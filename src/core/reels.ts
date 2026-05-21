// リール配列・停止位置計算 (§5, §5-1, §B4)

import { SYMBOL, FLAG, type GameSymbol, type Flag, type ReelIndex, type ReelPositions, type PaylineRow } from '../types/domain';

const S = SYMBOL; // 短縮エイリアス
export const REEL_SIZE = 21;
export type ReelColumn = 'left' | 'center' | 'right';

// §5: リール配列 (コマ1 = index 0, コマ21 = index 20)
export const REEL_STRIPS: Readonly<Record<ReelColumn, readonly GameSymbol[]>> = {
  left: [
    S.BLUE_GEM, S.REPLAY,   S.BLUE_GEM, S.BAR,      S.CHERRY,   // 0-4  (コマ1-5)
    S.BLUE_GEM, S.REPLAY,   S.BLUE_GEM, S.JACK,     S.SEVEN,    // 5-9  (コマ6-10)
    S.BLUE_GEM, S.REPLAY,   S.BLUE_GEM, S.CHERRY,   S.BAR,      // 10-14 (コマ11-15)
    S.BLUE_GEM, S.REPLAY,   S.BLUE_GEM, S.REPLAY,   S.SEVEN,    // 15-19 (コマ16-20)
    S.BELL,                                                        // 20   (コマ21)
  ],
  center: [
    S.JACK,     S.CHERRY,   S.BLUE_GEM, S.BAR,      S.REPLAY,   // 0-4
    S.CHERRY,   S.BLUE_GEM, S.BELL,     S.REPLAY,   S.CHERRY,   // 5-9
    S.BLUE_GEM, S.BAR,      S.REPLAY,   S.CHERRY,   S.BLUE_GEM, // 10-14
    S.BELL,     S.REPLAY,   S.CHERRY,   S.BLUE_GEM, S.SEVEN,    // 15-19
    S.REPLAY,                                                      // 20
  ],
  right: [
    S.REPLAY,   S.BELL,     S.JACK,     S.BLUE_GEM, S.REPLAY,   // 0-4
    S.BELL,     S.JACK,     S.BLUE_GEM, S.REPLAY,   S.BELL,     // 5-9
    S.JACK,     S.BLUE_GEM, S.REPLAY,   S.BELL,     S.JACK,     // 10-14
    S.BLUE_GEM, S.REPLAY,   S.BELL,     S.BAR,      S.SEVEN,    // 15-19
    S.BLUE_GEM,                                                   // 20
  ],
} as const;

// ── 内部ユーティリティ ────────────────────────────────────────

function getAt(strip: readonly GameSymbol[], idx: number): GameSymbol {
  const normalized = ((idx % REEL_SIZE) + REEL_SIZE) % REEL_SIZE;
  const sym = strip[normalized];
  if (sym === undefined) throw new RangeError(`reel index out of range: ${idx}`);
  return sym;
}

/** row オフセット: top=+1, center=0, bottom=-1 (strip 上位方向が top) */
function rowOffset(row: PaylineRow): number {
  return row === 'top' ? 1 : row === 'bottom' ? -1 : 0;
}

/** 指定リール・停止位置・行の図柄を返す */
export function getSymbol(col: ReelColumn, stopIndex: number, row: PaylineRow): GameSymbol {
  return getAt(REEL_STRIPS[col], stopIndex + rowOffset(row));
}

/** ReelPositions 生成ヘルパー */
function pos(l: number, c: number, r: number): ReelPositions {
  return [l as ReelIndex, c as ReelIndex, r as ReelIndex] as const;
}

// ── 停止位置テーブル ──────────────────────────────────────────
//
// 各停止位置は CENTER ラインで所定図柄が揃うことを事前検証済み。
// top=(stopIndex+1)%21, bottom=(stopIndex-1+21)%21 の規約に基づく。
//
// LOSS       (0, 0, 0)  : 中段 BLUE_GEM-JACK-REPLAY → ノーマッチ ✓
// REPLAY     (1, 4, 0)  : 中段 REPLAY-REPLAY-REPLAY ✓
// BLUE_GEM   (0, 2, 3)  : 中段 BLUE_GEM-BLUE_GEM-BLUE_GEM ✓
// BELL       (20, 7, 1) : 中段 BELL-BELL-BELL ✓
// JACK       (8, 0, 2)  : 中段 JACK-JACK-JACK ✓
// ANGLE_CHR  (5, 0, 0)  : 左下段 CHERRY → 角CHERRY ✓ (他ライン不一致)
// CENTER_CHR (4, 0, 0)  : 左中段 CHERRY → 中段CHERRY ✓ (他ライン不一致)
// ENTRY BIG  (9, 19,19) : 中段 SEVEN-SEVEN-SEVEN ✓
// ENTRY REG  (9, 19,18) : 中段 SEVEN-SEVEN-BAR ✓
// BONUS GAME (20, 7, 1) : BELL と同じ (14枚)

/** §5-1: フラグに応じた通常スピン停止位置 (自動制御) */
export function getNormalSpinStops(flag: Flag): ReelPositions {
  switch (flag) {
    case FLAG.REPLAY:       return pos(1,  4,  0);
    case FLAG.BLUE_GEM:     return pos(0,  2,  3);
    case FLAG.BELL:         return pos(20, 7,  1);
    case FLAG.JACK:         return pos(8,  0,  2);
    case FLAG.ANGLE_CHERRY:     return pos(5,  0,  0); // 左下段に CHERRY
    case FLAG.ANGLE_CHERRY_BIG: return pos(5,  0,  0); // 角CHERRY + BIG: 同じビジュアル
    case FLAG.ANGLE_CHERRY_REG: return pos(5,  0,  0); // 角CHERRY + REG: 同じビジュアル
    case FLAG.CENTER_CHERRY_BIG: return pos(4,  0,  0); // 左中段に CHERRY → RUSH直行
    // LOSS / NORMAL_BIG / NORMAL_REG / PREMIUM_BIG / CEILING_BIG → ロス演出
    default:                    return pos(0,  0,  0);
  }
}

/** §B4: ボーナス入賞ゲームは中段ライン固定 */
export function getBonusEntryStops(isREG: boolean): ReelPositions {
  return isREG
    ? pos(9, 19, 18)  // 中段 SEVEN-SEVEN-BAR
    : pos(9, 19, 19); // 中段 SEVEN-SEVEN-SEVEN
}

/** §7-1: ボーナス消化中は毎ゲーム BELL-BELL-BELL (14枚) */
export function getBonusGameStops(): ReelPositions {
  return pos(20, 7, 1);
}

/** §B2: RUSH継続抽選フェーズ 6G目 STOP_L で中段CHERRY を表示する左リール位置 */
export function getCenterCherryStopPositionLeft(): ReelIndex {
  return 4 as ReelIndex; // Left[4] = CHERRY → 中段
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
