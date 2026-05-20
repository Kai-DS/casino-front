// D1: 基本ドメイン型

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
  CENTER_CHERRY: 'CENTER_CHERRY',
  NORMAL_BIG: 'NORMAL_BIG',
  NORMAL_REG: 'NORMAL_REG',
  CHERRY_BIG: 'CHERRY_BIG',
  CHERRY_REG: 'CHERRY_REG',
  PREMIUM_BIG: 'PREMIUM_BIG',
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
