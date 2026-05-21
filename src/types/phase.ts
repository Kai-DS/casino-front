// D2: フェーズ判別共用体

/** 通常スピン共通サブフェーズ */
export type SpinSubPhase =
  | 'WAIT_BET'
  | 'WAIT_LEVER'
  | 'STOP_L'
  | 'STOP_C'
  | 'STOP_R';

/** 全フェーズ */
export type Phase =
  | { kind: 'SPIN';         sub: SpinSubPhase }
  | { kind: 'BONUS_NOTICE' }
  | { kind: 'BONUS_ENTRY';  sub: SpinSubPhase }  // 入賞ゲーム1回 (中段 7-7-7 / 7-7-BAR)
  | { kind: 'BONUS_GAME';   sub: SpinSubPhase }  // 消化ゲーム (BELL-BELL-BELL × 規定回数)
  | { kind: 'COUNTDOWN';    gameIndex: 1 | 2 | 3; sub: SpinSubPhase }
  | { kind: 'RUSH_JUDGE';   gameIndex: 1 | 2 | 3 | 4 | 5 | 6; sub: SpinSubPhase }
  | { kind: 'RUSH_END' };

export type InputKind = 'BET' | 'LEVER' | 'L' | 'C' | 'R';

/** 入力受付判定 (網羅性チェック付き) */
export function isInputAcceptable(
  phase: Phase,
  input: InputKind,
  isProcessing: boolean,
  bonusManualMode: boolean,
): boolean {
  if (isProcessing) return false;
  switch (phase.kind) {
    case 'BONUS_NOTICE':
    case 'RUSH_END':
      return false;
    case 'SPIN':
    case 'COUNTDOWN':
    case 'RUSH_JUDGE':
      return matchesSubPhase(phase.sub, input);
    case 'BONUS_ENTRY':
    case 'BONUS_GAME':
      return bonusManualMode ? matchesSubPhase(phase.sub, input) : false;
    default: {
      const _exhaustive: never = phase;
      throw new Error(`Unhandled phase: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function matchesSubPhase(sub: SpinSubPhase, input: InputKind): boolean {
  switch (sub) {
    case 'WAIT_BET':   return input === 'BET';
    case 'WAIT_LEVER': return input === 'LEVER';
    case 'STOP_L':     return input === 'L';
    case 'STOP_C':     return input === 'C';
    case 'STOP_R':     return input === 'R';
  }
}
