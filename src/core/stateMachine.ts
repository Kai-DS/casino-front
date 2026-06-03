// フェーズ遷移ステートマシン (§12, §B1, §B3, §B4, §C3)
//
// BONUS_ENTRY = 入賞ゲーム1回 (7-7-7 or 7-7-BAR 固定, 払い出し 0)
// BONUS_GAME  = 消化ゲーム    (BELL-BELL-BELL 固定, 14枚×規定回数)

import { FLAG, type Flag, type SettingLevel, type ReelIndex } from '../types/domain';
import type { GameState } from '../types/state';
import type { Phase, SpinSubPhase } from '../types/phase';
import { nextStateAfterBonus } from '../types/bonus';
import { selectFlag, drawCountdownSuccess } from './lottery';
import { reelGoals, decideStop, autoAimPos } from './reelControl';
import { evaluateLines } from './paylines';
import { getRolePayout, computeBonusGamePayout, isBonusRole } from './payout';
import { isBonusFlagType, toBonusContext, withRemainingPayout } from './bonus';
import { initRushSet, onRushStopR } from './rush';

// ── アクション定義 ─────────────────────────────────────────────

export type Action =
  | { type: 'BET' }
  | { type: 'LEVER' }
  | { type: 'STOP'; reel: 'L' | 'C' | 'R'; pressPos: number }
  | { type: 'BONUS_NOTICE_DONE' }    // 告知演出完了 → BONUS_ENTRY へ
  | { type: 'AUTO_TICK' }            // bonusManualMode=false 時の自動進行
  | { type: 'RUSH_END_DONE' }        // RUSH終了演出完了 → SPIN へ
  | { type: 'SET_AUTO';         value: boolean }
  | { type: 'SET_BONUS_MANUAL'; value: boolean }
  // ── DEV / プロトタイプ専用 ────────────────────────────────────
  | { type: 'ADD_COINS';         amount: number }
  | { type: 'SET_SETTING_LEVEL'; level: SettingLevel }   // §C5 resetForSettingChange
  | { type: 'SET_DEBUG_FLAG';    flag: Flag | null }      // §C4 1回消費型
  | { type: 'SET_DEBUG_RUSH';    result: 'SUCCESS' | 'FAIL' | null };

const BET_COST          = 3;
const CEILING_THRESHOLD = 500;  // §C3

/** チェリー当選フラグか (これらの時のみチェリーを払い出す。視覚だけのガセは無効) */
function isCherryFlag(flag: Flag | null): boolean {
  return flag === FLAG.ANGLE_CHERRY
    || flag === FLAG.ANGLE_CHERRY_BIG
    || flag === FLAG.ANGLE_CHERRY_REG
    || flag === FLAG.CENTER_CHERRY_BIG;
}

// ── フェーズ生成ヘルパー (gameIndex 等を型安全に引き継ぐ) ─────

type HasSub = Extract<Phase, { sub: SpinSubPhase }>;

function advanceSub(ph: HasSub, sub: SpinSubPhase): Phase {
  switch (ph.kind) {
    case 'SPIN':        return { kind: 'SPIN',        sub };
    case 'BONUS_ENTRY': return { kind: 'BONUS_ENTRY', sub };
    case 'BONUS_GAME':  return { kind: 'BONUS_GAME',  sub };
    case 'COUNTDOWN':   return { kind: 'COUNTDOWN',   gameIndex: ph.gameIndex, sub };
    case 'RUSH_JUDGE':  return { kind: 'RUSH_JUDGE',  gameIndex: ph.gameIndex, sub };
    default: {
      const _exhaustive: never = ph;
      throw new Error(`advanceSub: unknown kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ── メインレデューサー ────────────────────────────────────────

export function transition(gs: GameState, action: Action): GameState {
  switch (action.type) {
    case 'BET':               return onBet(gs);
    case 'LEVER':             return onLever(gs);
    case 'STOP':              return onStop(gs, action.reel, action.pressPos);
    case 'BONUS_NOTICE_DONE': return onBonusNoticeDone(gs);
    case 'AUTO_TICK':         return onAutoTick(gs);
    case 'RUSH_END_DONE':     return { ...gs, rushTotalPayout: 0, rushActive: false, phase: { kind: 'SPIN', sub: 'WAIT_BET' } };
    case 'SET_AUTO':          return { ...gs, autoMode:        action.value };
    case 'SET_BONUS_MANUAL':  return { ...gs, bonusManualMode: action.value };
    case 'ADD_COINS':         return { ...gs, coins: gs.coins + action.amount };
    case 'SET_SETTING_LEVEL': return resetForSettingChange(gs, action.level);
    case 'SET_DEBUG_FLAG':    return { ...gs, debugForcedFlag:      action.flag };
    case 'SET_DEBUG_RUSH':    return { ...gs, debugForcedRushResult: action.result };
    default: {
      const _exhaustive: never = action;
      throw new Error(`transition: unknown action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ── §C5: 設定変更時リセット ────────────────────────────────────

function resetForSettingChange(gs: GameState, level: SettingLevel): GameState {
  return {
    ...gs,
    settingLevel:          level,
    normalGameCount:       0,
    pendingFlag:           null,
    debugForcedFlag:       null,
    debugForcedRushResult: null,
  };
}

// ── BET ──────────────────────────────────────────────────────

function onBet(gs: GameState): GameState {
  const ph = gs.phase;
  if (!('sub' in ph) || ph.sub !== 'WAIT_BET') return gs;
  if ((ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') && !gs.bonusManualMode) return gs;
  // §29-2: 入賞ゲーム (BONUS_ENTRY) は BET 消費なし。再遊技 (replayActive) も無料。
  const free = ph.kind === 'BONUS_ENTRY' || gs.replayActive;
  if (!free && gs.coins < BET_COST) return gs;
  const coins = free ? gs.coins : gs.coins - BET_COST;
  return { ...gs, coins, replayActive: false, maxBetPressed: true, leverDown: false, phase: advanceSub(ph, 'WAIT_LEVER') };
}

// ── LEVER ─────────────────────────────────────────────────────

function onLever(gs: GameState): GameState {
  const ph = gs.phase;
  if (!('sub' in ph) || ph.sub !== 'WAIT_LEVER') return gs;
  if ((ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') && !gs.bonusManualMode) return gs;

  // ボーナス入賞/消化ゲーム: 回転開始のみ (出目は停止時に引き込みで揃える)
  if (ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') {
    return {
      ...gs,
      maxBetPressed: false,
      reelSpinning: [true, true, true],
      leverDown:    true,
      phase:        advanceSub(ph, 'STOP_L'),
    };
  }

  // §C4: 強制フラグが最優先 (天井・通常抽選より上位、1回消費)
  let pendingFlag      = gs.pendingFlag;
  let normalGameCount  = gs.normalGameCount;
  let debugForcedFlag  = gs.debugForcedFlag;

  if (debugForcedFlag !== null) {
    pendingFlag     = debugForcedFlag;
    debugForcedFlag = null;
  } else if (ph.kind === 'SPIN' && !gs.rushActive && gs.normalGameCount >= CEILING_THRESHOLD) {
    // §C3: 天井チェック
    pendingFlag     = FLAG.CEILING_BIG;
    normalGameCount = 0;
  } else {
    pendingFlag = selectFlag(gs);
  }

  return {
    ...gs,
    pendingFlag,
    normalGameCount,
    debugForcedFlag,
    maxBetPressed: false,
    reelSpinning: [true, true, true],
    leverDown:    true,
    phase:        advanceSub(ph, 'STOP_L'),
  };
}

// ── STOP ──────────────────────────────────────────────────────

function onStop(gs: GameState, reel: 'L' | 'C' | 'R', pressPos: number): GameState {
  const ph = gs.phase;
  if (!('sub' in ph)) return gs;
  if ((ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') && !gs.bonusManualMode) return gs;

  const expected = reel === 'L' ? 'STOP_L' : reel === 'C' ? 'STOP_C' : 'STOP_R';
  if (ph.sub !== expected) return gs;

  const reelIdx = reel === 'L' ? 0 : reel === 'C' ? 1 : 2;
  return applyStop(gs, reelIdx, pressPos);
}

/**
 * コマ滑り停止の中核。pressPos を起点に引き込み/蹴飛ばしで停止位置を確定し、
 * 次サブフェーズへ進める。手動・AUTO 共通 (停止順は 左→中→右 固定)。
 */
function applyStop(gs: GameState, reelIdx: 0 | 1 | 2, pressPos: number): GameState {
  const ph = gs.phase;
  if (!('sub' in ph)) return gs;

  const goals = reelGoals(gs);
  // 左→中→右 固定順: reelIdx 未満のリールは停止済み
  const stoppedMask: [boolean, boolean, boolean] = [reelIdx >= 1, reelIdx >= 2, false];
  const target = decideStop(reelIdx, pressPos, goals, gs.reelPos, stoppedMask);

  const nextPos: [ReelIndex, ReelIndex, ReelIndex] = [gs.reelPos[0], gs.reelPos[1], gs.reelPos[2]];
  nextPos[reelIdx] = target;
  const nextSpin: [boolean, boolean, boolean] = [gs.reelSpinning[0], gs.reelSpinning[1], gs.reelSpinning[2]];
  nextSpin[reelIdx] = false;

  if (reelIdx !== 2) {
    const nextSub = reelIdx === 0 ? 'STOP_C' : 'STOP_R';
    return {
      ...gs,
      reelPos:      nextPos,
      reelSpinning: nextSpin,
      leverDown:    reelIdx === 0 ? false : gs.leverDown,
      phase:        advanceSub(ph, nextSub),
    };
  }

  return onStopR({ ...gs, reelPos: nextPos, reelSpinning: nextSpin }, ph);
}

// ── 全停止 → 評価 → フェーズ遷移 ─────────────────────────────

function onStopR(gs: GameState, ph: Phase): GameState {
  // §B4: 入賞ゲーム。中段ラインに 7が揃えば BONUS_GAME へ。取りこぼしたら持ち越し (再スピン)。
  // 斜め/上下段でたまたま並んでも成立扱いにしない (ちゃんと中段に揃える必要がある)。
  if (ph.kind === 'BONUS_ENTRY') {
    const ctx     = gs.bonusContext!;
    const isREG   = ctx.kind === 'NORMAL_REG' || ctx.kind === 'RUSH_REG';
    const target  = isREG ? 'REG' : 'BIG';
    const result  = evaluateLines(gs.reelPos);
    const aligned = result.hits.some(h => h.line === 'CENTER' && h.role === target);
    return aligned
      ? { ...gs, phase: { kind: 'BONUS_GAME',  sub: 'WAIT_BET' } }
      : { ...gs, phase: { kind: 'BONUS_ENTRY', sub: 'WAIT_BET' } }; // 持ち越し
  }

  // ボーナス消化ゲーム: computeBonusGamePayout で処理 (evaluateLines 不要)
  if (ph.kind === 'BONUS_GAME') {
    const ctx = gs.bonusContext!;
    const { payout, newRemaining, isComplete } = computeBonusGamePayout(ctx.remainingPayout);
    const s: GameState = {
      ...gs,
      coins:           gs.coins + payout,
      rushTotalPayout: gs.rushTotalPayout + (gs.rushActive ? payout : 0),
      bonusContext:    withRemainingPayout(ctx, newRemaining),
    };
    if (!isComplete) return { ...s, phase: { kind: 'BONUS_GAME', sub: 'WAIT_BET' } };
    return afterBonusComplete(s);
  }

  // 通常・COUNTDOWN・RUSH_JUDGE: 小役評価
  // チェリーは「チェリー当選フラグがある時のみ」払い出す (見た目で角に出てもガセは無効)
  const evalResult    = evaluateLines(gs.reelPos);
  const cherryAllowed = isCherryFlag(gs.pendingFlag) && evalResult.cherry !== null;
  let normalPayout = 0;
  for (const hit of evalResult.hits) normalPayout += getRolePayout(hit.role);
  if (cherryAllowed) normalPayout += 2;
  const smallHit = evalResult.hits.find(h => !isBonusRole(h.role));
  // REPLAY 成立 → 次ゲームの BET が無料 (再遊技)
  const replayHit = evalResult.hits.some(h => h.role === 'REPLAY');
  const winLabel = cherryAllowed
    ? 'CHERRY'
    : smallHit !== undefined
      ? smallHit.role
      : '---';
  let s: GameState   = { ...gs, coins: gs.coins + normalPayout, lastWinLabel: winLabel, replayActive: replayHit };

  switch (ph.kind) {
    case 'SPIN': {
      const flag = s.pendingFlag!;
      if (isBonusFlagType(flag)) {
        // 当たった瞬間は種別 (BIG/REG) を成立役に出さない (揃えてから判明)
        return {
          ...s,
          bonusContext:    toBonusContext(flag, s.rushSetIndex, s.rushActive),
          normalGameCount: 0,
          phase:           { kind: 'BONUS_NOTICE' },
          pendingFlag:     null,
        };
      }
      return {
        ...s,
        normalGameCount:  s.normalGameCount + 1,
        lastNormalPayout: normalPayout,
        phase:            { kind: 'SPIN', sub: 'WAIT_BET' },
        pendingFlag:      null,
      };
    }

    case 'COUNTDOWN': {
      const flag = s.pendingFlag!;
      // COUNTDOWN中のボーナス確定 → 通常ボーナスとして処理
      if (isBonusFlagType(flag)) {
        return {
          ...s,
          bonusContext: toBonusContext(flag, s.rushSetIndex, false),
          phase:        { kind: 'BONUS_NOTICE' },
          pendingFlag:  null,
        };
      }
      if (ph.gameIndex < 3) {
        return {
          ...s,
          phase:       { kind: 'COUNTDOWN', gameIndex: (ph.gameIndex + 1) as 1|2|3, sub: 'WAIT_BET' },
          pendingFlag: null,
        };
      }
      // 3G目完了: §B3 突入率100% (debugForcedRushResult でのみ上書き可)
      const success = s.debugForcedRushResult !== null
        ? s.debugForcedRushResult === 'SUCCESS'
        : drawCountdownSuccess(s.settingLevel);
      s = { ...s, debugForcedRushResult: null, pendingFlag: null };
      if (success) {
        return initRushSet({ ...s, rushActive: true, rushSetIndex: 1, rushTotalPayout: 0 }, 1);
      }
      return { ...s, phase: { kind: 'SPIN', sub: 'WAIT_BET' } };
    }

    case 'RUSH_JUDGE': {
      s = { ...s, rushTotalPayout: s.rushTotalPayout + normalPayout };
      return onRushStopR({ ...s, phase: ph });
    }

    default:
      return s;
  }
}

// ── BONUS_NOTICE_DONE ─────────────────────────────────────────

function onBonusNoticeDone(gs: GameState): GameState {
  if (gs.phase.kind !== 'BONUS_NOTICE') return gs;
  // 入賞ゲームはプレイヤーが BET/LEVER/STOP を操作 (リール位置は LEVER 時に確定)
  return { ...gs, phase: { kind: 'BONUS_ENTRY', sub: 'WAIT_BET' } };
}

// ── ボーナス完了後の遷移 ──────────────────────────────────────

function afterBonusComplete(gs: GameState): GameState {
  const ctx   = gs.bonusContext!;
  const after = nextStateAfterBonus(ctx);
  const s: GameState = { ...gs, bonusContext: null };

  switch (after.to) {
    case 'COUNTDOWN':
      return { ...s, phase: { kind: 'COUNTDOWN', gameIndex: 1, sub: 'WAIT_BET' } };

    case 'RUSH_DIRECT':
      return initRushSet({ ...s, rushActive: true, rushSetIndex: 1, rushTotalPayout: 0 }, 1);

    case 'NORMAL':
      return { ...s, rushActive: false, phase: { kind: 'SPIN', sub: 'WAIT_BET' } };

    case 'RUSH_NEXT_SET_OR_JUDGE':
      return initRushSet(s, s.rushSetIndex + 1);

    default: {
      const _exhaustive: never = after;
      throw new Error(`afterBonusComplete: unknown destination: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ── AUTO_TICK (bonusManualMode=false 時の BONUS_GAME 自動消化) ─

function onAutoTick(gs: GameState): GameState {
  if (gs.bonusManualMode) return gs;
  const ph = gs.phase;
  if (ph.kind !== 'BONUS_ENTRY' && ph.kind !== 'BONUS_GAME') return gs;

  switch (ph.sub) {
    case 'WAIT_BET': {
      // §29-2: BONUS_ENTRY は BET 消費なし; BONUS_GAME は 3枚
      if (ph.kind === 'BONUS_GAME' && gs.coins < BET_COST) return gs;
      const coins = ph.kind === 'BONUS_ENTRY' ? gs.coins : gs.coins - BET_COST;
      return { ...gs, coins, phase: advanceSub(ph, 'WAIT_LEVER') };
    }
    case 'WAIT_LEVER':
      return { ...gs, reelSpinning: [true, true, true], phase: advanceSub(ph, 'STOP_L') };
    case 'STOP_L': return applyStop(gs, 0, autoAimPos(gs, 0));
    case 'STOP_C': return applyStop(gs, 1, autoAimPos(gs, 1));
    case 'STOP_R': return applyStop(gs, 2, autoAimPos(gs, 2));
  }
}
