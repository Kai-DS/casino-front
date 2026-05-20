// D3: ボーナスコンテキスト (判別共用体)

export type BonusContext =
  | null
  | { kind: 'NORMAL_BIG';  remainingPayout: number }
  | { kind: 'NORMAL_REG';  remainingPayout: number }
  | { kind: 'CEILING_BIG'; remainingPayout: number }
  | { kind: 'PREMIUM_BIG'; remainingPayout: number }
  | { kind: 'RUSH_BIG';    remainingPayout: number; setIndex: number }
  | { kind: 'RUSH_REG';    remainingPayout: number; setIndex: number };

export type AfterBonus =
  | { to: 'COUNTDOWN' }
  | { to: 'RUSH_DIRECT' }
  | { to: 'NORMAL' }
  | { to: 'RUSH_NEXT_SET_OR_JUDGE' };

export function nextStateAfterBonus(ctx: NonNullable<BonusContext>): AfterBonus {
  switch (ctx.kind) {
    case 'NORMAL_BIG':
    case 'CEILING_BIG':
      return { to: 'COUNTDOWN' };
    case 'PREMIUM_BIG':
      return { to: 'RUSH_DIRECT' };
    case 'NORMAL_REG':
      return { to: 'NORMAL' };
    case 'RUSH_BIG':
    case 'RUSH_REG':
      return { to: 'RUSH_NEXT_SET_OR_JUDGE' };
    default: {
      const _exhaustive: never = ctx;
      throw new Error(`Unhandled bonus context: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
