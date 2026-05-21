// D1: 基本ドメイン型

export type SettingLevel = 1 | 4 | 5 | 6;

/** 図柄 (組み込み Symbol との衝突を避けるため GameSymbol にリネーム) */
export const SYMBOL = {
  SEVEN: 'SEVEN',
  BAR: 'BAR',
  JACK: 'JACK',
  BLUE_GEM: 'BLUE_GEM',
  BELL: 'BELL',
  CHERRY: 'CHERRY',
  REPLAY: 'REPLAY',
} as const;
export type GameSymbol = typeof SYMBOL[keyof typeof SYMBOL];

/** 内部抽選フラグ */
export const FLAG = {
  LOSS: 'LOSS',
  REPLAY: 'REPLAY',
  BLUE_GEM: 'BLUE_GEM',
  BELL: 'BELL',
  JACK: 'JACK',
  ANGLE_CHERRY: 'ANGLE_CHERRY',
  CENTER_CHERRY: 'CENTER_CHERRY',      // RUSH_JUDGE 演出用 (lottery 未使用)
  NORMAL_BIG: 'NORMAL_BIG',
  NORMAL_REG: 'NORMAL_REG',
  ANGLE_CHERRY_BIG: 'ANGLE_CHERRY_BIG', // 角CHERRY+BIG: 角CHERRY視覚 + BIG → COUNTDOWN
  ANGLE_CHERRY_REG: 'ANGLE_CHERRY_REG', // 角CHERRY+REG: 角CHERRY視覚 + REG → 通常へ
  CENTER_CHERRY_BIG: 'CENTER_CHERRY_BIG', // 中段CHERRY+BIG: 確定値固定確率 → RUSH直行 (§A3)
  PREMIUM_BIG: 'PREMIUM_BIG',           // 単独BIG 1% 変換: LOSS視覚のままRUSH直行 (§A3)
  CEILING_BIG: 'CEILING_BIG',
} as const;
export type Flag = typeof FLAG[keyof typeof FLAG];

/** 入賞役 (画面表示用) */
export type Role =
  | 'BIG' | 'REG' | 'BELL' | 'JACK' | 'BLUE_GEM' | 'REPLAY'
  | 'CENTER_CHERRY' | 'ANGLE_CHERRY';

/** リール位置 (0-20, branded type) */
export type ReelIndex = number & { readonly __brand: 'ReelIndex' };
export type ReelPositions = readonly [ReelIndex, ReelIndex, ReelIndex];

/** ペイライン */
export type PaylineRow = 'top' | 'center' | 'bottom';
export type Payline = readonly [PaylineRow, PaylineRow, PaylineRow];

export const PAYLINES = {
  TOP:    ['top',    'top',    'top']    as const,
  CENTER: ['center', 'center', 'center'] as const,
  BOTTOM: ['bottom', 'bottom', 'bottom'] as const,
  ASC:    ['bottom', 'center', 'top']    as const,
  DESC:   ['top',    'center', 'bottom'] as const,
} satisfies Record<string, Payline>;
export type PaylineKey = keyof typeof PAYLINES;
