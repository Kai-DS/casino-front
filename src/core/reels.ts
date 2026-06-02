// リール配列・停止位置計算 (§5, §5-1, §B4)

import { SYMBOL, FLAG, type GameSymbol, type Flag, type ReelIndex, type ReelPositions, type PaylineRow } from '../types/domain';

const S = SYMBOL; // 短縮エイリアス
export const REEL_SIZE = 21;
export type ReelColumn = 'left' | 'center' | 'right';

// 回転速度: 1コマ進むのに要する時間。80回転/分 ÷ 21コマ ≈ 35.7ms/コマ
export const SPIN_FRAME_MS = 60000 / (80 * 21);
// 回り始めの加速にかける時間 (0→最高速まで線形にランプアップ)
export const SPIN_RAMP_MS = 350;

/**
 * 回転開始からの経過時間 (ms) → 進んだコマ数 (小数)。
 * [0, RAMP] は等加速 (速度 0→最高速)、以降は等速。
 * 表示 (rAF) と pressPos 逆算 (liveCenterIndex) が同じ式を使うことで一致する。
 */
export function spinFrames(elapsed: number): number {
  const v = 1 / SPIN_FRAME_MS; // 最高速 (コマ/ms)
  if (elapsed <= SPIN_RAMP_MS) return (v * elapsed * elapsed) / (2 * SPIN_RAMP_MS);
  return (v * SPIN_RAMP_MS) / 2 + v * (elapsed - SPIN_RAMP_MS);
}

/**
 * 回転開始位置と経過時間から、現在中段に「最も近い」コマ index を求める。
 * index増加=下方向。図柄が下に流れる = 中段 index は減少方向 (0→20→19…)。
 */
export function liveCenterIndex(startPos: number, startTime: number, now: number): number {
  const frames = Math.round(spinFrames(now - startTime));
  return ((startPos - frames) % REEL_SIZE + REEL_SIZE) % REEL_SIZE;
}

// §5: リール配列 (index = docs/reel.csv のコマ番号 0〜20) — CSV基準 (正)
export const REEL_STRIPS: Readonly<Record<ReelColumn, readonly GameSymbol[]>> = {
  left: [
    S.BELL,     S.SEVEN,    S.REPLAY,   S.BLUE_GEM, S.REPLAY,   // 0-4
    S.BLUE_GEM, S.BAR,      S.CHERRY,   S.BLUE_GEM, S.REPLAY,   // 5-9
    S.BLUE_GEM, S.SEVEN,    S.JACK,     S.BLUE_GEM, S.REPLAY,   // 10-14
    S.BLUE_GEM, S.CHERRY,   S.BAR,      S.BLUE_GEM, S.REPLAY,   // 15-19
    S.BLUE_GEM,                                                  // 20
  ],
  center: [
    S.REPLAY,   S.SEVEN,    S.BLUE_GEM, S.CHERRY,   S.REPLAY,   // 0-4
    S.BELL,     S.BLUE_GEM, S.CHERRY,   S.REPLAY,   S.BAR,      // 5-9
    S.BLUE_GEM, S.CHERRY,   S.REPLAY,   S.BELL,     S.BLUE_GEM, // 10-14
    S.CHERRY,   S.REPLAY,   S.BAR,      S.BLUE_GEM, S.CHERRY,   // 15-19
    S.JACK,                                                      // 20
  ],
  right: [
    S.BLUE_GEM, S.SEVEN,    S.BAR,      S.BELL,     S.REPLAY,   // 0-4
    S.BLUE_GEM, S.JACK,     S.BELL,     S.REPLAY,   S.BLUE_GEM, // 5-9
    S.JACK,     S.BELL,     S.REPLAY,   S.BLUE_GEM, S.JACK,     // 10-14
    S.BELL,     S.REPLAY,   S.BLUE_GEM, S.JACK,     S.BELL,     // 15-19
    S.REPLAY,                                                    // 20
  ],
} as const;

// ── 内部ユーティリティ ────────────────────────────────────────

function getAt(strip: readonly GameSymbol[], idx: number): GameSymbol {
  const normalized = ((idx % REEL_SIZE) + REEL_SIZE) % REEL_SIZE;
  const sym = strip[normalized];
  if (sym === undefined) throw new RangeError(`reel index out of range: ${idx}`);
  return sym;
}

/** row オフセット: index増加=下方向 なので 上段=中段-1, 下段=中段+1 */
function rowOffset(row: PaylineRow): number {
  return row === 'top' ? -1 : row === 'bottom' ? 1 : 0;
}

/** 指定リール・停止位置・行の図柄を返す */
export function getSymbol(col: ReelColumn, stopIndex: number, row: PaylineRow): GameSymbol {
  return getAt(REEL_STRIPS[col], stopIndex + rowOffset(row));
}

/** ReelPositions 生成ヘルパー */
function pos(l: number, c: number, r: number): ReelPositions {
  return [l as ReelIndex, c as ReelIndex, r as ReelIndex] as const;
}

/** 中段ラインで指定図柄が揃う全停止位置を返す */
export function getCandidateStops(
  leftSym:   GameSymbol,
  centerSym: GameSymbol,
  rightSym:  GameSymbol,
): ReelPositions[] {
  const candidates: ReelPositions[] = [];
  for (let l = 0; l < REEL_SIZE; l++) {
    if (REEL_STRIPS.left[l] !== leftSym) continue;
    for (let c = 0; c < REEL_SIZE; c++) {
      if (REEL_STRIPS.center[c] !== centerSym) continue;
      for (let r = 0; r < REEL_SIZE; r++) {
        if (REEL_STRIPS.right[r] !== rightSym) continue;
        candidates.push(pos(l, c, r));
      }
    }
  }
  return candidates;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** 左リールでチェリーが上段/中段/下段に映らない停止位置か判定 */
function noCherry([l]: ReelPositions): boolean {
  const prev = (l - 1 + REEL_SIZE) % REEL_SIZE;
  const next = (l + 1) % REEL_SIZE;
  return (
    REEL_STRIPS.left[l]    !== SYMBOL.CHERRY &&
    REEL_STRIPS.left[prev] !== SYMBOL.CHERRY &&
    REEL_STRIPS.left[next] !== SYMBOL.CHERRY
  );
}

// ── 停止位置テーブル ──────────────────────────────────────────
//
// 各停止位置は CENTER ラインで所定図柄が揃うことをスクリプトで検証済み (reel_fix_spec.md)。
// top=(stopIndex+1)%21, bottom=(stopIndex-1+21)%21 の規約に基づく。
//
// LOSS           (0, 0, 4)  : 全5ライン不一致確認済み ✓
// REPLAY         (2, 0, 4)  : 中段 REPLAY × 3 ✓
// BLUE_GEM       (3, 2, 5)  : 中段 BLUE_GEM × 3 ✓
// BELL           (0, 5, 3)  : 中段 BELL × 3 ✓
// JACK           (11,20, 6) : 中段 JACK × 3 ✓
// ANGLE_CHR      (8, 0, 1)  : 左下段 CHERRY → 角CHERRY ✓
// CENTER_CHR_BIG (7, 0, 1)  : 左中段 CHERRY → RUSH直行 ✓
// ENTRY BIG      (1, 1, 1)  : 中段 SEVEN × 3 ✓
// ENTRY REG      (1, 1, 2)  : 中段 SEVEN / SEVEN / BAR ✓
// BONUS GAME     (0, 5, 3)  : 中段 BELL × 3 ✓

/** §5-1: フラグに応じた通常スピン停止位置 — 候補からランダム選択 */
export function getNormalSpinStops(flag: Flag): ReelPositions {
  switch (flag) {
    case FLAG.REPLAY:
      return pickRandom(getCandidateStops(S.REPLAY,   S.REPLAY,   S.REPLAY).filter(noCherry));
    case FLAG.BLUE_GEM:
      return pickRandom(getCandidateStops(S.BLUE_GEM, S.BLUE_GEM, S.BLUE_GEM).filter(noCherry));
    case FLAG.BELL:
      return pickRandom(getCandidateStops(S.BELL,     S.BELL,     S.BELL).filter(noCherry));
    case FLAG.JACK:
      return pickRandom(getCandidateStops(S.JACK,     S.JACK,     S.JACK).filter(noCherry));
    // チェリー系: 左リール固定、中・右は安全位置
    case FLAG.ANGLE_CHERRY:
    case FLAG.ANGLE_CHERRY_BIG:
    case FLAG.ANGLE_CHERRY_REG:
      return pos(8, 0, 1); // 左下段 CHERRY
    case FLAG.CENTER_CHERRY_BIG:
      return pos(7, 0, 1); // 左中段 CHERRY → RUSH直行
    // LOSS / NORMAL_BIG / NORMAL_REG / PREMIUM_BIG / CEILING_BIG → ロス演出 (固定)
    default:
      return pos(0, 0, 4); // left[0]=BELL: cherry非隣接確認済み
  }
}

/** §B4: ボーナス入賞ゲームは中段ライン — ランダム選択 */
export function getBonusEntryStops(isREG: boolean): ReelPositions {
  return isREG
    ? pickRandom(getCandidateStops(S.SEVEN, S.SEVEN, S.BAR))
    : pickRandom(getCandidateStops(S.SEVEN, S.SEVEN, S.SEVEN));
}

/** §7-1: ボーナス消化中は毎ゲーム BELL-BELL-BELL (14枚) — ランダム選択 */
export function getBonusGameStops(): ReelPositions {
  return pickRandom(getCandidateStops(S.BELL, S.BELL, S.BELL));
}

/** §B2: RUSH継続抽選フェーズ 6G目 STOP_L で中段CHERRY を表示する左リール位置 */
export function getCenterCherryStopPositionLeft(): ReelIndex {
  return 7 as ReelIndex; // left[7] = CHERRY → 中段 (docs/reel.csv コマ7)
}

// ── ウィンドウ読み取り ────────────────────────────────────────

/** 3×3 の表示窓 (UI 層へ渡す) */
export type ReelWindow = Readonly<{
  left:   readonly [GameSymbol, GameSymbol, GameSymbol]; // [top, center, bottom]
  center: readonly [GameSymbol, GameSymbol, GameSymbol];
  right:  readonly [GameSymbol, GameSymbol, GameSymbol];
}>;

export function getReelWindow(positions: ReelPositions): ReelWindow {
  const [lStop, cStop, rStop] = positions;
  const sym = (col: ReelColumn, stop: number, row: PaylineRow) => getSymbol(col, stop, row);
  return {
    left:   [sym('left',   lStop, 'top'), sym('left',   lStop, 'center'), sym('left',   lStop, 'bottom')],
    center: [sym('center', cStop, 'top'), sym('center', cStop, 'center'), sym('center', cStop, 'bottom')],
    right:  [sym('right',  rStop, 'top'), sym('right',  rStop, 'center'), sym('right',  rStop, 'bottom')],
  };
}
