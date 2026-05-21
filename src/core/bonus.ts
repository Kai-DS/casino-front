// ボーナスフェーズ補助 (§8, §B4, §D3)

import { FLAG } from '../types/domain';
import type { Flag } from '../types/domain';
import type { BonusContext } from '../types/bonus';
import { BIG_TOTAL_PAYOUT, REG_TOTAL_PAYOUT } from './payout';

const BIG_FLAGS: ReadonlySet<Flag> = new Set([
  FLAG.NORMAL_BIG,
  FLAG.ANGLE_CHERRY_BIG,
  FLAG.CENTER_CHERRY_BIG,
  FLAG.PREMIUM_BIG,
  FLAG.CEILING_BIG,
]);

/** フラグがいずれかのボーナス種別かどうか */
export function isBonusFlagType(flag: Flag): boolean {
  return BIG_FLAGS.has(flag) || flag === FLAG.NORMAL_REG || flag === FLAG.ANGLE_CHERRY_REG;
}

/**
 * フラグ + コンテキストから BonusContext を生成。
 *
 * §A3 案Y: CENTER_CHERRY_BIG / PREMIUM_BIG はどちらも PREMIUM_BIG コンテキスト
 * (RUSH直行)。RUSH中 (rushActive=true) の BIG/REG は RUSH_BIG / RUSH_REG。
 */
export function toBonusContext(
  flag: Flag,
  rushSetIndex: number,
  rushActive: boolean,
): NonNullable<BonusContext> {
  if (rushActive) {
    return BIG_FLAGS.has(flag)
      ? { kind: 'RUSH_BIG', remainingPayout: BIG_TOTAL_PAYOUT, setIndex: rushSetIndex }
      : { kind: 'RUSH_REG', remainingPayout: REG_TOTAL_PAYOUT, setIndex: rushSetIndex };
  }

  switch (flag) {
    case FLAG.NORMAL_BIG:
    case FLAG.ANGLE_CHERRY_BIG:
      return { kind: 'NORMAL_BIG',  remainingPayout: BIG_TOTAL_PAYOUT };
    case FLAG.CENTER_CHERRY_BIG:
    case FLAG.PREMIUM_BIG:
      return { kind: 'PREMIUM_BIG', remainingPayout: BIG_TOTAL_PAYOUT };
    case FLAG.CEILING_BIG:
      return { kind: 'CEILING_BIG', remainingPayout: BIG_TOTAL_PAYOUT };
    case FLAG.NORMAL_REG:
    case FLAG.ANGLE_CHERRY_REG:
      return { kind: 'NORMAL_REG',  remainingPayout: REG_TOTAL_PAYOUT };
    default:
      throw new Error(`toBonusContext: not a bonus flag: ${flag}`);
  }
}

/** BonusContext の remainingPayout を更新 (型安全) */
export function withRemainingPayout(
  ctx: NonNullable<BonusContext>,
  newRemaining: number,
): NonNullable<BonusContext> {
  switch (ctx.kind) {
    case 'NORMAL_BIG':  return { ...ctx, remainingPayout: newRemaining };
    case 'NORMAL_REG':  return { ...ctx, remainingPayout: newRemaining };
    case 'CEILING_BIG': return { ...ctx, remainingPayout: newRemaining };
    case 'PREMIUM_BIG': return { ...ctx, remainingPayout: newRemaining };
    case 'RUSH_BIG':    return { ...ctx, remainingPayout: newRemaining };
    case 'RUSH_REG':    return { ...ctx, remainingPayout: newRemaining };
    default: {
      const _exhaustive: never = ctx;
      throw new Error(`withRemainingPayout: unknown kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
