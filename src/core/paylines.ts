// 5ライン判定・CHERRY検出 (§4, §7, §B4)

import { SYMBOL, PAYLINES, type GameSymbol, type ReelPositions } from '../types/domain';
import type { Role } from '../types/domain';
import type { EvaluateLinesResult, LineHit } from '../types/lines';
import type { PaylineKey } from '../types/domain';
import { getSymbol } from './reels';

// 評価するペイラインの順序 (上→下→斜め)
const PAYLINE_KEYS: readonly PaylineKey[] = ['TOP', 'CENTER', 'BOTTOM', 'ASC', 'DESC'];

/**
 * 3リールの停止位置から全5ラインを評価し、入賞とチェリー検出を返す。
 *
 * CHERRY は左リール単独で検出 (ラインと独立)。
 * BIG/REG はボーナス入賞ゲームの CENTER ラインで検出される。
 */
export function evaluateLines(positions: ReelPositions): EvaluateLinesResult {
  const [lStop, cStop, rStop] = positions;
  const hits: LineHit[] = [];

  for (const key of PAYLINE_KEYS) {
    const payline = PAYLINES[key];
    const l = getSymbol('left',   lStop, payline[0]);
    const c = getSymbol('center', cStop, payline[1]);
    const r = getSymbol('right',  rStop, payline[2]);
    const role = matchRole(l, c, r);
    if (role !== null) {
      hits.push({ line: key, role });
    }
  }

  // §4: CHERRY は左リール位置のみで判定 (右リールに CHERRY がないため3揃いは不可)
  const leftCenter = getSymbol('left', lStop, 'center');
  const leftTop    = getSymbol('left', lStop, 'top');
  const leftBottom = getSymbol('left', lStop, 'bottom');

  let cherry: EvaluateLinesResult['cherry'] = null;
  if (leftCenter === SYMBOL.CHERRY) {
    cherry = 'CENTER';
  } else if (leftTop === SYMBOL.CHERRY || leftBottom === SYMBOL.CHERRY) {
    cherry = 'ANGLE';
  }

  return { hits, cherry };
}

/** 3図柄から入賞役を判定 */
function matchRole(l: GameSymbol, c: GameSymbol, r: GameSymbol): Role | null {
  // BIG: 7-7-7, REG: 7-7-BAR (§4-1)
  if (l === SYMBOL.SEVEN && c === SYMBOL.SEVEN) {
    if (r === SYMBOL.SEVEN) return 'BIG';
    if (r === SYMBOL.BAR)   return 'REG';
  }
  // 3揃い小役
  if (l === c && c === r) {
    switch (l) {
      case SYMBOL.BELL:     return 'BELL';
      case SYMBOL.JACK:     return 'JACK';
      case SYMBOL.BLUE_GEM: return 'BLUE_GEM';
      case SYMBOL.REPLAY:   return 'REPLAY';
      default:              break;
    }
  }
  return null;
}
