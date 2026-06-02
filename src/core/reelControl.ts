// コマ滑り（引き込み・蹴飛ばし）方式の停止制御 — reel-control-v1 (docs/reel_move.md)
//
// レバーONで成立役 (pendingFlag) は確定済み。停止ボタンを押した瞬間のコマ位置
// pressPos を起点に、すべり 0〜MAX_SLIP の範囲で:
//   - 成立役の構成図柄を引き込む (100%引き込み)
//   - 非成立のボーナス/小役は揃えない (100%蹴飛ばし)
// 図柄配置の都合で MAX_SLIP 以内に引き込めない希少図柄 (BELL/JACK/SEVEN) は、
// 取りこぼし回避を優先してすべりを延長する (§2-4 100%引き込み保証)。

import { SYMBOL, FLAG, type Flag, type GameSymbol, type ReelIndex, type ReelPositions } from '../types/domain';
import type { GameState } from '../types/state';
import { REEL_STRIPS, REEL_SIZE, type ReelColumn } from './reels';
import { evaluateLines } from './paylines';

export const MAX_SLIP = 4;

const S = SYMBOL;
const COLS: readonly ReelColumn[] = ['left', 'center', 'right'];

export type ReelGoal =
  | { kind: 'symbol'; sym: GameSymbol }      // 中段にこの図柄を引き込む (7/BELL 等、目押し対象)
  | { kind: 'line-symbol'; sym: GameSymbol } // 上中下段いずれかのラインに揃える (REPLAY/GEM、最寄りで成立)
  | { kind: 'cherry-center' }                // 左リール中段に CHERRY
  | { kind: 'cherry-angle' }                 // 左リール上段 or 下段に CHERRY (角)
  | { kind: 'avoid' };                       // 何も揃えない (ハズレ/ボーナス非告知)

// ── ゴール決定 ────────────────────────────────────────────────

/** 現在のゲーム状態から各リール (左/中/右) の停止ゴールを決定 */
export function reelGoals(gs: GameState): [ReelGoal, ReelGoal, ReelGoal] {
  const ph = gs.phase;

  // ボーナス入賞ゲーム: 7-7-7 (BIG) / 7-7-BAR (REG)
  if (ph.kind === 'BONUS_ENTRY') {
    const isREG = gs.bonusContext?.kind === 'NORMAL_REG' || gs.bonusContext?.kind === 'RUSH_REG';
    return isREG
      ? [{ kind: 'symbol', sym: S.SEVEN }, { kind: 'symbol', sym: S.SEVEN }, { kind: 'symbol', sym: S.BAR }]
      : [{ kind: 'symbol', sym: S.SEVEN }, { kind: 'symbol', sym: S.SEVEN }, { kind: 'symbol', sym: S.SEVEN }];
  }

  // ボーナス消化ゲーム: BELL-BELL-BELL
  if (ph.kind === 'BONUS_GAME') {
    return [{ kind: 'symbol', sym: S.BELL }, { kind: 'symbol', sym: S.BELL }, { kind: 'symbol', sym: S.BELL }];
  }

  // §B2: RUSH継続抽選 6G目 継続確定 → 左中段 CHERRY の継続演出 (pendingFlag 非ボーナス時)
  if (ph.kind === 'RUSH_JUDGE' && ph.gameIndex === 6 && gs.rushInternalContinueFlag
      && gs.pendingFlag !== null && !isBonusVisualFlag(gs.pendingFlag)) {
    return [{ kind: 'cherry-center' }, { kind: 'avoid' }, { kind: 'avoid' }];
  }

  return goalsForFlag(gs.pendingFlag);
}

function goalsForFlag(flag: Flag | null): [ReelGoal, ReelGoal, ReelGoal] {
  const all = (sym: GameSymbol): [ReelGoal, ReelGoal, ReelGoal] =>
    [{ kind: 'symbol', sym }, { kind: 'symbol', sym }, { kind: 'symbol', sym }];
  // REPLAY/GEM は頻出役。上中下段いずれかのラインに最寄りで揃える。
  const allLine = (sym: GameSymbol): [ReelGoal, ReelGoal, ReelGoal] =>
    [{ kind: 'line-symbol', sym }, { kind: 'line-symbol', sym }, { kind: 'line-symbol', sym }];
  switch (flag) {
    case FLAG.REPLAY:   return allLine(S.REPLAY);
    case FLAG.BLUE_GEM: return allLine(S.BLUE_GEM);
    case FLAG.BELL:     return all(S.BELL);   // 目押し対象 (中段)
    case FLAG.JACK:     return all(S.JACK);   // 目押し対象 (中段)
    case FLAG.ANGLE_CHERRY:
    case FLAG.ANGLE_CHERRY_BIG:
    case FLAG.ANGLE_CHERRY_REG:
      return [{ kind: 'cherry-angle' }, { kind: 'avoid' }, { kind: 'avoid' }];
    case FLAG.CENTER_CHERRY_BIG:
      return [{ kind: 'cherry-center' }, { kind: 'avoid' }, { kind: 'avoid' }];
    // LOSS / NORMAL_BIG / NORMAL_REG / PREMIUM_BIG / CEILING_BIG → ロス目 (ボーナスは入賞Gで揃える)
    default:
      return [{ kind: 'avoid' }, { kind: 'avoid' }, { kind: 'avoid' }];
  }
}

function isBonusVisualFlag(flag: Flag): boolean {
  return flag === FLAG.NORMAL_BIG || flag === FLAG.NORMAL_REG
    || flag === FLAG.PREMIUM_BIG || flag === FLAG.CEILING_BIG
    || flag === FLAG.CENTER_CHERRY_BIG || flag === FLAG.ANGLE_CHERRY_BIG
    || flag === FLAG.ANGLE_CHERRY_REG;
}

// ── 停止位置決定 ──────────────────────────────────────────────

/**
 * 1リールの停止目標を決定する。
 * @param reelIdx     0=左 1=中 2=右
 * @param pressPos    停止ボタンを押した瞬間の中段コマ index
 * @param goals       3リール分のゴール (蹴飛ばし判定で他リール参照)
 * @param current     現在の reelPos (停止済みリールは確定位置を保持)
 * @param stoppedMask 各リールが停止済みか
 */
export function decideStop(
  reelIdx: 0 | 1 | 2,
  pressPos: number,
  goals: readonly [ReelGoal, ReelGoal, ReelGoal],
  current: ReelPositions,
  stoppedMask: readonly [boolean, boolean, boolean],
): ReelIndex {
  const goal   = goals[reelIdx]!;
  const isLast = stoppedMask.filter(Boolean).length === 2;
  const N      = REEL_SIZE;
  const at     = (k: number) => ((pressPos - k) % N + N) % N; // 回転方向 = index 減少 (下方向に流れる)
  const allows = (pos: number) => !isLast || !violatesConstraint(reelIdx, pos, goals, current);

  if (goal.kind === 'avoid') {
    // 蹴飛ばし: 役を作らない位置。全域に延長して 100%回避を保証 (見えない停止調整)。
    for (let k = 0; k < N; k++) {
      const pos = at(k);
      if (goalSatisfied(reelIdx, pos, goal) && allows(pos)) return pos as ReelIndex;
    }
    return pressPos as ReelIndex;
  }

  if (goal.kind === 'line-symbol') {
    // REPLAY/GEM: 上中下段いずれかのラインに揃える。既停止リールと共通のラインに乗る
    // 最寄り (減少方向) の位置を選ぶ。頻出役なので必ず見つかる (100%引き込み)。
    const lines = allowedLines(goal.sym, current, stoppedMask);
    for (let k = 0; k < N; k++) {
      const pos = at(k);
      if (lineSymbolOk(reelIdx, pos, goal.sym, lines)) return pos as ReelIndex;
    }
    return pressPos as ReelIndex;
  }

  // symbol (BELL/JACK/7) / cherry: 厳密 0〜MAX_SLIP のみ。範囲外なら取りこぼし (目押し必須)。
  for (let k = 0; k <= MAX_SLIP; k++) {
    const pos = at(k);
    if (goalSatisfied(reelIdx, pos, goal) && allows(pos)) return pos as ReelIndex;
  }
  // 取りこぼし: 誤ボーナスだけは避けて pressPos 付近 (前方) で停止。
  for (let k = 0; k < N; k++) {
    const pos = at(k);
    if (allows(pos)) return pos as ReelIndex;
  }
  return pressPos as ReelIndex;
}

/** sym を乗せられるライン offset (上=-1/中=0/下=+1) を、既停止リールと矛盾しない範囲で返す */
function allowedLines(
  sym: GameSymbol,
  current: ReelPositions,
  stoppedMask: readonly [boolean, boolean, boolean],
): number[] {
  return [-1, 0, 1].filter(o => {
    for (let i = 0; i < 3; i++) {
      if (!stoppedMask[i]) continue;
      const s = REEL_STRIPS[COLS[i]!][((current[i]! + o) % REEL_SIZE + REEL_SIZE) % REEL_SIZE];
      if (s !== sym) return false;
    }
    return true;
  });
}

/** この停止位置で sym が allowed のいずれかのライン上に来るか */
function lineSymbolOk(reelIdx: number, pos: number, sym: GameSymbol, lines: number[]): boolean {
  // 左リールREPLAYの (13,14,15) 出目 (中段=14) はハズレ専用。当選では出さない。
  if (reelIdx === 0 && sym === S.REPLAY && pos === 14) return false;
  const strip = REEL_STRIPS[COLS[reelIdx]!];
  return lines.some(o => strip[((pos + o) % REEL_SIZE + REEL_SIZE) % REEL_SIZE] === sym);
}

/**
 * AUTO 用の照準位置。ゴールを確実に満たす停止位置を全域から探す
 * (AUTO はランダム押下だとボーナス7が揃わず詰むため、完璧に目押しする)。
 */
export function autoAimPos(gs: GameState, reelIdx: 0 | 1 | 2): number {
  const goals  = reelGoals(gs);
  const goal   = goals[reelIdx]!;
  const isLast = reelIdx === 2;

  if (goal.kind === 'line-symbol') {
    const stoppedMask: [boolean, boolean, boolean] = [reelIdx >= 1, reelIdx >= 2, false];
    const lines = allowedLines(goal.sym, gs.reelPos, stoppedMask);
    for (let pos = 0; pos < REEL_SIZE; pos++) {
      if (lineSymbolOk(reelIdx, pos, goal.sym, lines)) return pos;
    }
    return gs.reelPos[reelIdx];
  }

  for (let pos = 0; pos < REEL_SIZE; pos++) {
    if (!goalSatisfied(reelIdx, pos, goal)) continue;
    if (isLast && violatesConstraint(reelIdx, pos, goals, gs.reelPos)) continue;
    return pos;
  }
  return gs.reelPos[reelIdx];
}

function goalSatisfied(reelIdx: number, pos: number, goal: ReelGoal): boolean {
  const strip = REEL_STRIPS[COLS[reelIdx]!];
  const top = (pos - 1 + REEL_SIZE) % REEL_SIZE;
  const bot = (pos + 1) % REEL_SIZE;
  switch (goal.kind) {
    case 'symbol':
      // (13,14,15) の左リールREPLAY(index14)は「ハズレ専用出目」。当選時の停止対象から除外。
      if (reelIdx === 0 && goal.sym === S.REPLAY && pos === 14) return false;
      return strip[pos] === goal.sym;
    case 'line-symbol':
      // line-symbol は decideStop/autoAimPos で個別処理。ここでは中段一致で代用。
      return strip[pos] === goal.sym;
    case 'cherry-center':
      return strip[pos] === S.CHERRY;
    case 'cherry-angle':
      return strip[top] === S.CHERRY || strip[bot] === S.CHERRY;
    case 'avoid':
      // 左リールは窓内 (上/中/下) に CHERRY を出さない位置を選ぶ
      if (reelIdx === 0) {
        return strip[top] !== S.CHERRY && strip[pos] !== S.CHERRY && strip[bot] !== S.CHERRY;
      }
      return true;
  }
}

/** 最終停止時の蹴飛ばし制約: 非成立ボーナスを揃えない / ハズレ時は全役を揃えない */
function violatesConstraint(
  reelIdx: number,
  pos: number,
  goals: readonly [ReelGoal, ReelGoal, ReelGoal],
  current: ReelPositions,
): boolean {
  const positions = buildPositions(reelIdx, pos, current);
  const result = evaluateLines(positions);
  const hasBonus = result.hits.some(h => h.role === 'BIG' || h.role === 'REG');

  // 全リール avoid (ハズレ/ボーナス非告知) → いかなる役・チェリーも揃えない
  if (goals.every(g => g.kind === 'avoid')) {
    return result.hits.length > 0 || result.cherry !== null;
  }
  // 小役/チェリー成立時 → ボーナスを別ラインで誤完成させない
  return hasBonus;
}

function buildPositions(reelIdx: number, pos: number, current: ReelPositions): ReelPositions {
  const arr: [ReelIndex, ReelIndex, ReelIndex] = [current[0], current[1], current[2]];
  arr[reelIdx] = pos as ReelIndex;
  return arr;
}

// ── 配列検証 (§3-3, 開発時のみ) ───────────────────────────────

/**
 * リール配列長の検証 (開発時のみ)。
 * 引き込みは「すべり 0〜MAX_SLIP、範囲外は取りこぼし」なので図柄分布の警告は不要。
 */
export function assertReelStripsValid(): void {
  for (const col of COLS) {
    const strip = REEL_STRIPS[col];
    if (strip.length !== REEL_SIZE) {
      throw new Error(`[reel] ${col} リール長が ${strip.length} (期待値 ${REEL_SIZE})`);
    }
  }
}
