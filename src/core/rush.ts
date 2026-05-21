// MIDNIGHT RUSH フェーズ補助 (§B2, §17, §18)

import type { GameState } from '../types/state';
import { draw1GRen, drawRushContinue } from './lottery';
import { getCenterCherryStopPositionLeft } from './reels';
import { isBonusFlagType, toBonusContext } from './bonus';

/**
 * 新 RUSH セット開始。gameIndex=1 の RUSH_JUDGE フェーズに遷移する。
 *
 * §17-2 の継続抽選 (~67.7%) をここで先行実施し rushInternalContinueFlag に格納する。
 * 1G連 (§18-1, 1/110) は各ゲーム STOP_R 後に追加抽選される。
 * どちらかが true であれば 6G目 STOP_L で中段CHERRY が表示される (§B2)。
 */
export function initRushSet(gs: GameState, setIndex: number): GameState {
  return {
    ...gs,
    rushActive: true,
    rushSetIndex: setIndex,
    rushInternalContinueFlag: drawRushContinue(),
    phase: { kind: 'RUSH_JUDGE', gameIndex: 1, sub: 'WAIT_BET' },
  };
}

/**
 * §B2: RUSH_JUDGE 6G目 STOP_L 時の左リール位置強制。
 *
 * rushInternalContinueFlag === true のとき、左リールを
 * getCenterCherryStopPositionLeft() (= index 4) に差し替える。
 * reels.ts の Left strip: index 4 = CHERRY → center row に表示されることで
 * 「中段CHERRY」の視覚的確定演出になる。
 * false の場合はリール位置を変更しない (ハズレ継続)。
 */
export function onRushStopL(gs: GameState): GameState {
  if (!gs.rushInternalContinueFlag) return gs;

  // Left[4] = CHERRY が center row に表示 → RUSH継続の確定演出 (reels.ts §B2 参照)
  const cherryPos = getCenterCherryStopPositionLeft(); // = 4 as ReelIndex
  const [, c, r] = gs.reelPos;
  return { ...gs, reelPos: [cherryPos, c, r] as const };
}

/**
 * RUSH_JUDGE 各ゲーム STOP_R 後の処理。
 * 呼び出し前に stateMachine.ts で小役払い出し (coins) が加算済みであること。
 *
 * 1. RUSH中ボーナス確定フラグ → BONUS_NOTICE へ委譲 (RUSH_BIG / RUSH_REG)
 * 2. §18-1: 1G連抽選 (1/110) → 当選で rushInternalContinueFlag を true に上書き
 * 3. gameIndex < 6: 次ゲームへ進む
 * 4. gameIndex = 6 完了:
 *    - rushInternalContinueFlag true → 新セット (initRushSet)
 *    - false                         → RUSH_END
 */
export function onRushStopR(gs: GameState): GameState {
  const ph = gs.phase;
  if (ph.kind !== 'RUSH_JUDGE') return gs;

  const flag = gs.pendingFlag!;

  // RUSH中ボーナス: BIG/REG 確定 → BONUS_NOTICE (RUSH_BIG / RUSH_REG コンテキスト)
  if (isBonusFlagType(flag)) {
    return {
      ...gs,
      bonusContext: toBonusContext(flag, gs.rushSetIndex, true),
      phase: { kind: 'BONUS_NOTICE' },
      pendingFlag: null,
    };
  }

  // §18-1: 毎ゲーム 1G連抽選 (全設定共通 1/110)
  const continueFlag = gs.rushInternalContinueFlag || draw1GRen();

  if (ph.gameIndex < 6) {
    return {
      ...gs,
      rushInternalContinueFlag: continueFlag,
      phase: { kind: 'RUSH_JUDGE', gameIndex: (ph.gameIndex + 1) as 1|2|3|4|5|6, sub: 'WAIT_BET' },
      pendingFlag: null,
    };
  }

  // ゲーム 6 完了: 継続 or 終了
  if (continueFlag) {
    return initRushSet(
      { ...gs, rushInternalContinueFlag: false, pendingFlag: null },
      gs.rushSetIndex + 1,
    );
  }
  return {
    ...gs,
    rushInternalContinueFlag: false,
    rushActive: false,
    phase: { kind: 'RUSH_END' },
    pendingFlag: null,
  };
}
