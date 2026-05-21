// UI レンダリング用の派生状態型 (§30-16)

import type { Phase } from '../types/phase';
import type { BonusContext } from '../types/bonus';
import type { LCDMode, NotifyPattern, JackLampState, SideLampState } from '../types/notify';
import type { ReelWindow } from '../core/reels';

/** ボタン有効状態 */
export type ButtonState = {
  readonly bet:   boolean;
  readonly lever: boolean;
  readonly stopL: boolean;
  readonly stopC: boolean;
  readonly stopR: boolean;
};

/** LCD に表示するコンテンツ (モード別) */
export type LCDContent =
  | { mode: 'normal' }
  | { mode: 'bonus_notice'; notifyPattern: NotifyPattern | null }
  | {
      mode: 'bonus_game';
      main: { bonusKind: NonNullable<BonusContext>['kind']; remainingPayout: number };
      sub:  { setIndex: number; totalPayout: number } | null;  // null = 非RUSH中
    }
  | { mode: 'countdown';    gameIndex: 1 | 2 | 3 }
  | { mode: 'countdown_revival'; gameIndex: 1 | 2 | 3 }
  | { mode: 'rush_judge';   gameIndex: 1|2|3|4|5|6; setIndex: number }
  | { mode: 'rush_set';     setIndex: number; totalPayout: number }
  | { mode: 'rush_end';     totalPayout: number };

/** UI レイヤーに渡す派生状態 */
export type UIState = {
  // リール
  readonly reelWindow:   ReelWindow;
  readonly reelSpinning: readonly [boolean, boolean, boolean];

  // コイン
  readonly coins: number;

  // フェーズ (アニメーション分岐用)
  readonly phase: Phase;

  // 液晶
  readonly lcdMode:    LCDMode;
  readonly lcdContent: LCDContent;

  // ランプ
  readonly jackLampState: JackLampState;
  readonly sideLampState: SideLampState;

  // ボタン有効状態
  readonly buttons: ButtonState;

  // RUSH 情報
  readonly rushActive:      boolean;
  readonly rushSetIndex:    number;
  readonly rushTotalPayout: number;

  // ボーナス情報 (LCD・サウンド用)
  readonly bonusContext:  BonusContext;
  readonly notifyPattern: NotifyPattern | null;
};
