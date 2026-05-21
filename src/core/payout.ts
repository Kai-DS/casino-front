// 払い出し処理 (§7, §6-2, §7-1)

import type { Role } from '../types/domain';
import type { EvaluateLinesResult } from '../types/lines';

// §7: 役ごとの払い出し枚数
export const ROLE_PAYOUT: Record<Role, number> = {
  BIG:           0,   // ボーナス突入 (払い出しはボーナス消化で行う)
  REG:           0,   // 同上
  BELL:          14,
  JACK:          10,
  BLUE_GEM:      8,
  ANGLE_CHERRY:  2,
  CENTER_CHERRY: 2,
  REPLAY:        0,   // 再遊技 (コイン増減なし)
};

// §7-1: ボーナス払い出し定数
export const BIG_TOTAL_PAYOUT         = 168; // 14枚 × 12G
export const REG_TOTAL_PAYOUT         = 56;  // 14枚 × 4G
export const BONUS_GAME_PAYOUT_PER_GAME = 14;

export function getRolePayout(role: Role): number {
  return ROLE_PAYOUT[role];
}

/**
 * §6-1, §6-2: 通常スピン (SPIN フェーズ) の払い出し計算。
 * ライン入賞 + チェリー検出 (ANGLE/CENTER) の合算。
 * 複数ライン同時成立時は合算払い出し。
 */
export function computeNormalPayout(result: EvaluateLinesResult): number {
  let total = 0;
  for (const hit of result.hits) {
    total += getRolePayout(hit.role);
  }
  // §7: ANGLE_CHERRY も CENTER_CHERRY もどちらも 2枚
  if (result.cherry !== null) total += 2;
  return total;
}

/**
 * §7-1: ボーナス消化中の1ゲームあたり払い出し。
 * remainingPayout から 14枚ずつ消化し、0 以下になればボーナス終了。
 */
export function computeBonusGamePayout(remainingPayout: number): {
  payout:       number;
  newRemaining: number;
  isComplete:   boolean;
} {
  const payout      = Math.min(BONUS_GAME_PAYOUT_PER_GAME, remainingPayout);
  const newRemaining = remainingPayout - payout;
  return { payout, newRemaining, isComplete: newRemaining <= 0 };
}

export function isBonusRole(role: Role): boolean {
  return role === 'BIG' || role === 'REG';
}

export function isReplayRole(role: Role): boolean {
  return role === 'REPLAY';
}
