// フェーズ遷移ステートマシン (§12, §B1, §B3, §B4, §C3)
//
// BONUS_ENTRY = 入賞ゲーム1回 (7-7-7 or 7-7-BAR 固定, 払い出し 0)
// BONUS_GAME  = 消化ゲーム    (BELL-BELL-BELL 固定, 14枚×規定回数)

import { FLAG } from '../types/domain';
import type { GameState } from '../types/state';
import type { Phase, SpinSubPhase } from '../types/phase';
import { nextStateAfterBonus } from '../types/bonus';
import { selectFlag, drawCountdownSuccess } from './lottery';
import { getNormalSpinStops, getBonusEntryStops, getBonusGameStops } from './reels';
import { evaluateLines } from './paylines';
import { computeNormalPayout, computeBonusGamePayout } from './payout';
import { isBonusFlagType, toBonusContext, withRemainingPayout } from './bonus';
import { initRushSet, onRushStopL, onRushStopR } from './rush';

// ── アクション定義 ─────────────────────────────────────────────

export type Action =
  | { type: 'BET' }
  | { type: 'LEVER' }
  | { type: 'STOP'; reel: 'L' | 'C' | 'R' }
  | { type: 'BONUS_NOTICE_DONE' }    // 告知演出完了 → BONUS_ENTRY へ
  | { type: 'AUTO_TICK' }            // bonusManualMode=false 時の自動進行
  | { type: 'RUSH_END_DONE' }        // RUSH終了演出完了 → SPIN へ
  | { type: 'SET_AUTO';         value: boolean }
  | { type: 'SET_BONUS_MANUAL'; value: boolean };

const BET_COST          = 3;
const CEILING_THRESHOLD = 500;  // §C3

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
    case 'STOP':              return onStop(gs, action.reel);
    case 'BONUS_NOTICE_DONE': return onBonusNoticeDone(gs);
    case 'AUTO_TICK':         return onAutoTick(gs);
    case 'RUSH_END_DONE':     return { ...gs, rushTotalPayout: 0, rushActive: false, phase: { kind: 'SPIN', sub: 'WAIT_BET' } };
    case 'SET_AUTO':          return { ...gs, autoMode:        action.value };
    case 'SET_BONUS_MANUAL':  return { ...gs, bonusManualMode: action.value };
    default: {
      const _exhaustive: never = action;
      throw new Error(`transition: unknown action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ── BET ──────────────────────────────────────────────────────

function onBet(gs: GameState): GameState {
  const ph = gs.phase;
  if (!('sub' in ph) || ph.sub !== 'WAIT_BET') return gs;
  if ((ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') && !gs.bonusManualMode) return gs;
  // §29-2: 入賞ゲーム (BONUS_ENTRY) は BET 消費なし
  if (ph.kind !== 'BONUS_ENTRY' && gs.coins < BET_COST) return gs;
  const coins = ph.kind === 'BONUS_ENTRY' ? gs.coins : gs.coins - BET_COST;
  return { ...gs, coins, phase: advanceSub(ph, 'WAIT_LEVER') };
}

// ── LEVER ─────────────────────────────────────────────────────

function onLever(gs: GameState): GameState {
  const ph = gs.phase;
  if (!('sub' in ph) || ph.sub !== 'WAIT_LEVER') return gs;
  if ((ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') && !gs.bonusManualMode) return gs;

  // §B4: 入賞ゲーム (BONUS_ENTRY) は中段 7-7-7 / 7-7-BAR 固定
  if (ph.kind === 'BONUS_ENTRY') {
    const ctx   = gs.bonusContext!;
    const isREG = ctx.kind === 'NORMAL_REG' || ctx.kind === 'RUSH_REG';
    return {
      ...gs,
      reelPos:      getBonusEntryStops(isREG),
      reelSpinning: [true, true, true],
      leverDown:    true,
      phase:        advanceSub(ph, 'STOP_L'),
    };
  }

  // BONUS_GAME: 毎ゲーム BELL-BELL-BELL 固定 (§7-1)
  if (ph.kind === 'BONUS_GAME') {
    return {
      ...gs,
      reelPos:      getBonusGameStops(),
      reelSpinning: [true, true, true],
      leverDown:    true,
      phase:        advanceSub(ph, 'STOP_L'),
    };
  }

  // §C3: 天井チェック (SPIN かつ RUSH外 かつ通常ゲーム数 >= 500)
  let pendingFlag     = gs.pendingFlag;
  let normalGameCount = gs.normalGameCount;
  if (ph.kind === 'SPIN' && !gs.rushActive && gs.normalGameCount >= CEILING_THRESHOLD) {
    pendingFlag      = FLAG.CEILING_BIG;
    normalGameCount  = 0;
  } else {
    pendingFlag = selectFlag(gs);
  }

  return {
    ...gs,
    pendingFlag,
    normalGameCount,
    reelPos:      getNormalSpinStops(pendingFlag),
    reelSpinning: [true, true, true],
    leverDown:    true,
    phase:        advanceSub(ph, 'STOP_L'),
  };
}

// ── STOP ──────────────────────────────────────────────────────

function onStop(gs: GameState, reel: 'L' | 'C' | 'R'): GameState {
  const ph = gs.phase;
  if (!('sub' in ph)) return gs;
  if ((ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') && !gs.bonusManualMode) return gs;

  const expected = reel === 'L' ? 'STOP_L' : reel === 'C' ? 'STOP_C' : 'STOP_R';
  if (ph.sub !== expected) return gs;

  // §B2: RUSH_JUDGE 6G目 STOP_L → rushInternalContinueFlag に応じて中段CHERRY強制
  let s = gs;
  if (reel === 'L' && ph.kind === 'RUSH_JUDGE' && ph.gameIndex === 6) {
    s = onRushStopL(gs);
  }

  const spinIdx = reel === 'L' ? 0 : reel === 'C' ? 1 : 2;
  const nextSpin: [boolean, boolean, boolean] = [s.reelSpinning[0], s.reelSpinning[1], s.reelSpinning[2]];
  nextSpin[spinIdx] = false;

  if (reel !== 'R') {
    const nextSub = reel === 'L' ? 'STOP_C' : 'STOP_R';
    return { ...s, reelSpinning: nextSpin, phase: advanceSub(ph, nextSub) };
  }

  return onStopR({ ...s, reelSpinning: nextSpin }, ph);
}

// ── 全停止 → 評価 → フェーズ遷移 ─────────────────────────────

function onStopR(gs: GameState, ph: Phase): GameState {
  // §B4: 入賞ゲーム完了 → 払い出しなし → BONUS_GAME へ
  if (ph.kind === 'BONUS_ENTRY') {
    return { ...gs, phase: { kind: 'BONUS_GAME', sub: 'WAIT_BET' } };
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
  const evalResult   = evaluateLines(gs.reelPos);
  const normalPayout = computeNormalPayout(evalResult);
  let s: GameState   = { ...gs, coins: gs.coins + normalPayout };

  switch (ph.kind) {
    case 'SPIN': {
      const flag = s.pendingFlag!;
      if (isBonusFlagType(flag)) {
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
    case 'WAIT_LEVER': {
      const reelPos = ph.kind === 'BONUS_ENTRY'
        ? getBonusEntryStops(gs.bonusContext?.kind === 'NORMAL_REG' || gs.bonusContext?.kind === 'RUSH_REG')
        : getBonusGameStops();
      return { ...gs, reelPos, reelSpinning: [true, true, true], phase: advanceSub(ph, 'STOP_L') };
    }
    case 'STOP_L': return { ...gs, reelSpinning: [false, gs.reelSpinning[1], gs.reelSpinning[2]], phase: advanceSub(ph, 'STOP_C') };
    case 'STOP_C': return { ...gs, reelSpinning: [false, false, gs.reelSpinning[2]],              phase: advanceSub(ph, 'STOP_R') };
    case 'STOP_R': return onStopR({ ...gs, reelSpinning: [false, false, false] }, ph);
  }
}
