// GameState → UIState 変換 (§30-16, §A4)

import type { GameState } from '../types/state';
import type { LCDMode } from '../types/notify';
import { isInputAcceptable } from '../types/phase';
import { getReelWindow } from '../core/reels';
import type { UIState, ButtonState, LCDContent } from './UIState';

export function deriveUIState(gs: GameState): UIState {
  const lcdMode    = deriveLCDMode(gs);
  const lcdContent = deriveLCDContent(gs, lcdMode);
  return {
    reelWindow:      getReelWindow(gs.reelPos),
    reelSpinning:    gs.reelSpinning,
    coins:           gs.coins,
    phase:           gs.phase,
    lcdMode,
    lcdContent,
    jackLampState:   gs.jackLampState,
    sideLampState:   gs.sideLampState,
    buttons:         deriveButtons(gs),
    rushActive:      gs.rushActive,
    rushSetIndex:    gs.rushSetIndex,
    rushTotalPayout: gs.rushTotalPayout,
    bonusContext:    gs.bonusContext,
    notifyPattern:   gs.notifyPattern,
  };
}

// ── §A4 液晶モード優先度 ──────────────────────────────────────
//
// 優先度 (高 → 低):
//   rush_end > rush_judge > rush_set > countdown_revival > countdown
//   > bonus_game > bonus_notice > normal

function deriveLCDMode(gs: GameState): LCDMode {
  const ph = gs.phase;
  switch (ph.kind) {
    case 'RUSH_END':
      return 'rush_end';

    case 'RUSH_JUDGE':
      return 'rush_judge';

    case 'BONUS_ENTRY':
    case 'BONUS_GAME':
      return 'bonus_game';

    case 'COUNTDOWN':
      return gs.countdownRevivalScheduled ? 'countdown_revival' : 'countdown';

    case 'BONUS_NOTICE':
      return 'bonus_notice';

    case 'SPIN':
      // LATE_REVIVAL: ボーナス後の遅延告知 (v7.3 §A2)
      if (gs.deferredBonusNotice) return 'bonus_notice';
      // RUSH中の通常遊技 (セット間スピン等) では rush_set を継続表示
      if (gs.rushActive) return 'rush_set';
      return 'normal';

    default: {
      const _exhaustive: never = ph;
      throw new Error(`deriveLCDMode: unknown phase: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ── 液晶コンテンツ (モード別の表示データ) ─────────────────────

function deriveLCDContent(gs: GameState, mode: LCDMode): LCDContent {
  const ph = gs.phase;

  switch (mode) {
    case 'bonus_notice':
      return { mode: 'bonus_notice', notifyPattern: gs.notifyPattern };

    case 'bonus_game': {
      const ctx = gs.bonusContext;
      if (ctx === null) return { mode: 'normal' };
      return { mode: 'bonus_game', bonusKind: ctx.kind, remainingPayout: ctx.remainingPayout };
    }

    case 'countdown':
    case 'countdown_revival': {
      const gameIndex = ph.kind === 'COUNTDOWN' ? ph.gameIndex : 1;
      return { mode, gameIndex };
    }

    case 'rush_judge':
      if (ph.kind !== 'RUSH_JUDGE') return { mode: 'normal' };
      return { mode: 'rush_judge', gameIndex: ph.gameIndex, setIndex: gs.rushSetIndex };

    case 'rush_set':
      return { mode: 'rush_set', setIndex: gs.rushSetIndex, totalPayout: gs.rushTotalPayout };

    case 'rush_end':
      return { mode: 'rush_end', totalPayout: gs.rushTotalPayout };

    case 'normal':
      return { mode: 'normal' };

    default: {
      const _exhaustive: never = mode;
      throw new Error(`deriveLCDContent: unknown mode: ${_exhaustive}`);
    }
  }
}

// ── ボタン有効状態 (§B1 入力ロック表) ────────────────────────

function deriveButtons(gs: GameState): ButtonState {
  const accept = (input: Parameters<typeof isInputAcceptable>[1]) =>
    isInputAcceptable(gs.phase, input, gs.isProcessing, gs.bonusManualMode);
  return {
    bet:   accept('BET'),
    lever: accept('LEVER'),
    stopL: accept('L'),
    stopC: accept('C'),
    stopR: accept('R'),
  };
}
