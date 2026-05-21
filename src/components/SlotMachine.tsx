import { useReducer, useState, useEffect, useRef } from 'react';
import type { GameState } from '../types/state';
import { FLAG } from '../types/domain';
import { transition, type Action } from '../core/stateMachine';
import { getNormalSpinStops } from '../core/reels';
import { deriveUIState } from '../ui/deriveUIState';
import { Cabinet }    from './Cabinet';
import { Counters }   from './Counters';
import { ReelWindow } from './ReelWindow';
import { Controls }   from './Controls';

// ── 初期状態 ─────────────────────────────────────────────────

const INITIAL: GameState = {
  settingLevel:              1,
  coins:                     50,
  lastNormalPayout:          0,
  pendingFlag:               null,
  notifyPattern:             null,
  countdownRevivalScheduled: false,
  deferredBonusNotice:       false,
  phase:                     { kind: 'SPIN', sub: 'WAIT_BET' },
  isProcessing:              false,
  normalGameCount:           0,
  bonusContext:              null,
  rushActive:                false,
  rushSetIndex:              1,
  rushTotalPayout:           0,
  rushInternalContinueFlag:  false,
  autoMode:                  false,
  bonusManualMode:           false,
  reelPos:                   getNormalSpinStops(FLAG.LOSS),
  reelSpinning:              [false, false, false],
  maxBetPressed:             false,
  leverDown:                 false,
  pushPressed:               false,
  pressedStops:              [false, false, false],
  jackLampState:             'off',
  sideLampState:             'off',
  debugForcedFlag:           null,
  debugForcedRushResult:     null,
};

// ── コンポーネント ────────────────────────────────────────────

export function SlotMachine() {
  const [gs, dispatch]    = useReducer(transition, INITIAL);
  const [pressedStops, setPressedStops] =
    useState<[boolean, boolean, boolean]>([false, false, false]);

  const ui = deriveUIState(gs);

  // ── §30-8: 停止ボタン押下状態 ─────────────────────────────
  // WAIT_BET に戻ったとき(払い出し完了後)に解除
  useEffect(() => {
    if (!('sub' in gs.phase) || gs.phase.sub !== 'WAIT_BET') return;
    const t = setTimeout(() => setPressedStops([false, false, false]), 200);
    return () => clearTimeout(t);
  }, [gs.phase]);

  // ── BONUS_NOTICE / RUSH_END: タイマーで自動遷移 ──────────
  useEffect(() => {
    const ph = gs.phase;
    let t: ReturnType<typeof setTimeout> | undefined;
    if (ph.kind === 'BONUS_NOTICE') {
      t = setTimeout(() => dispatch({ type: 'BONUS_NOTICE_DONE' }), 1000);
    } else if (ph.kind === 'RUSH_END') {
      t = setTimeout(() => dispatch({ type: 'RUSH_END_DONE' }), 1500);
    }
    return () => { clearTimeout(t); };
  }, [gs.phase]);

  // ── AUTO モード: 同じ UI 遷移をタイマーで自動発火 (§30-14) ─
  const autoRef = useRef(gs.autoMode);
  autoRef.current = gs.autoMode;

  useEffect(() => {
    if (!gs.autoMode) return;
    const ph = gs.phase;

    let act: Action | null = null;
    let delay = 200;

    if (ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') {
      act = { type: 'AUTO_TICK' }; delay = 120;
    } else if ('sub' in ph) {
      switch (ph.sub) {
        case 'WAIT_BET':   act = { type: 'BET' };              delay = 80;  break;
        case 'WAIT_LEVER': act = { type: 'LEVER' };            delay = 180; break;
        case 'STOP_L':     act = { type: 'STOP', reel: 'L' };  delay = 120; break;
        case 'STOP_C':     act = { type: 'STOP', reel: 'C' };  delay = 120; break;
        case 'STOP_R':     act = { type: 'STOP', reel: 'R' };  delay = 120; break;
      }
    }

    if (act === null) return;
    const captured = act;
    const t = setTimeout(() => { if (autoRef.current) dispatch(captured); }, delay);
    return () => clearTimeout(t);
  }, [gs.autoMode, gs.phase]);

  // ── ハンドラ ──────────────────────────────────────────────

  function handleBet()   { dispatch({ type: 'BET' }); }
  function handleLever() { dispatch({ type: 'LEVER' }); }

  function handleStop(reel: 'L' | 'C' | 'R') {
    const idx = reel === 'L' ? 0 : reel === 'C' ? 1 : 2;
    setPressedStops(prev => {
      const next: [boolean, boolean, boolean] = [prev[0], prev[1], prev[2]];
      next[idx] = true;
      return next;
    });
    dispatch({ type: 'STOP', reel });
  }

  function handleAutoToggle()   { dispatch({ type: 'SET_AUTO',         value: !gs.autoMode }); }
  function handleManualToggle() { dispatch({ type: 'SET_BONUS_MANUAL', value: !gs.bonusManualMode }); }

  // ── フェーズ表示ラベル (デバッグ用ヘッダー) ───────────────

  const phaseLabel = (() => {
    const ph = gs.phase;
    if (!('sub' in ph)) return ph.kind;
    return 'gameIndex' in ph
      ? `${ph.kind} G${ph.gameIndex} / ${ph.sub}`
      : `${ph.kind} / ${ph.sub}`;
  })();

  return (
    <Cabinet isNotice={gs.phase.kind === 'BONUS_NOTICE'}>

      {/* フェーズ表示 */}
      <div style={{
        textAlign:  'center',
        fontSize:   11,
        color:      '#446',
        letterSpacing: 1,
      }}>
        {phaseLabel}
        {gs.bonusContext && (
          <span style={{ marginLeft: 8, color: '#664' }}>
            [{gs.bonusContext.kind} rem={gs.bonusContext.remainingPayout}]
          </span>
        )}
      </div>

      <Counters
        coins={ui.coins}
        lastNormalPayout={gs.lastNormalPayout}
        normalGameCount={gs.normalGameCount}
        rushActive={ui.rushActive}
        rushSetIndex={ui.rushSetIndex}
        rushTotalPayout={ui.rushTotalPayout}
      />

      <ReelWindow
        reelWindow={ui.reelWindow}
        reelSpinning={ui.reelSpinning}
      />

      {/* LCD モード表示 (Priority 2 で LCD.tsx に置換) */}
      <LcdPlaceholder lcdContent={ui.lcdContent} />

      <Controls
        buttons={ui.buttons}
        pressedStops={pressedStops}
        autoMode={gs.autoMode}
        bonusManualMode={gs.bonusManualMode}
        onBet={handleBet}
        onLever={handleLever}
        onStop={handleStop}
        onAutoToggle={handleAutoToggle}
        onManualToggle={handleManualToggle}
      />

    </Cabinet>
  );
}

// ── LCD プレースホルダー (Priority 2 で LCD.tsx に置換) ───────

import type { LCDContent } from '../ui/UIState';

function LcdPlaceholder({ lcdContent }: { lcdContent: LCDContent }) {
  const text = (() => {
    switch (lcdContent.mode) {
      case 'normal':           return '— NORMAL —';
      case 'bonus_notice':     return `★ BONUS! ${lcdContent.notifyPattern ?? ''}`;
      case 'bonus_game':
        return `${lcdContent.main.bonusKind}  rem:${lcdContent.main.remainingPayout}`
          + (lcdContent.sub ? `  [RUSH SET ${lcdContent.sub.setIndex}  +${lcdContent.sub.totalPayout}]` : '');
      case 'countdown':        return `COUNTDOWN  G${lcdContent.gameIndex}/3`;
      case 'countdown_revival': return `REVIVAL!!  G${lcdContent.gameIndex}/3`;
      case 'rush_judge':       return `MIDNIGHT RUSH  SET${lcdContent.setIndex}  G${lcdContent.gameIndex}/6`;
      case 'rush_set':         return `RUSH SET ${lcdContent.setIndex}  total:${lcdContent.totalPayout}`;
      case 'rush_end':         return `RUSH END  total:${lcdContent.totalPayout}`;
    }
  })();

  const isRush = lcdContent.mode === 'rush_judge' || lcdContent.mode === 'rush_set';
  const isBig  = lcdContent.mode === 'bonus_game' || lcdContent.mode === 'bonus_notice';

  return (
    <div style={{
      textAlign:    'center',
      padding:      '8px 12px',
      background:   '#060610',
      border:       `1px solid ${isRush ? '#ff44cc44' : isBig ? '#ffd70044' : '#223'}`,
      borderRadius: 6,
      fontSize:     12,
      color:        isRush ? '#ff44cc' : isBig ? '#ffd700' : '#556',
      letterSpacing: 1,
      minHeight:    32,
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'center',
    }}>
      {text}
    </div>
  );
}
