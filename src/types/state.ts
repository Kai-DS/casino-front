// D7: GameState 全体定義

import type { Flag, ReelPositions } from './domain';
import type { Phase } from './phase';
import type { BonusContext } from './bonus';
import type { NotifyPattern, JackLampState, SideLampState } from './notify';

export interface GameState {
  // 設定
  settingLevel: 1 | 4 | 5 | 6;

  // コイン
  coins:           number;
  lastNormalPayout: number;  // 直前の通常スピン払い出し (Counters 表示用)

  // 抽選
  pendingFlag: Flag | null;
  notifyPattern: NotifyPattern | null;
  countdownRevivalScheduled: boolean;
  deferredBonusNotice: boolean;       // LATE_REVIVAL 用 (v7.3 A2)

  // フェーズ
  phase: Phase;
  isProcessing: boolean;

  // 通常時カウンタ (RUSH中は加算しない、v7.3 C3 参照)
  normalGameCount: number;

  // ボーナス
  bonusContext: BonusContext;

  // RUSH
  rushActive: boolean;
  rushSetIndex: number;               // 1始まり
  rushTotalPayout: number;
  rushInternalContinueFlag: boolean;  // 6G目 STOP_L で中段CHERRY 出現条件 (v7.3 B2)

  // 操作モード
  autoMode: boolean;
  bonusManualMode: boolean;

  // リール
  reelPos: ReelPositions;
  reelSpinning: readonly [boolean, boolean, boolean];

  // UI連動状態 (§30)
  maxBetPressed: boolean;
  leverDown: boolean;
  pushPressed: boolean;
  pressedStops: readonly [boolean, boolean, boolean];
  jackLampState: JackLampState;
  sideLampState: SideLampState;

  // デバッグ (1回消費型、リロードでクリア、v7.3 C4 参照)
  debugForcedFlag: Flag | null;
  debugForcedRushResult: 'SUCCESS' | 'FAIL' | null;
}
