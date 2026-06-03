import { useReducer, useState, useEffect, useRef } from 'react';
import type { GameState } from '../types/state';
import { FLAG } from '../types/domain';
import { transition, type Action } from '../core/stateMachine';
import { autoAimPos } from '../core/reelControl';
import { getNormalSpinStops, spinFrames } from '../core/reels';
import { deriveUIState } from '../ui/deriveUIState';
import {
  DEFAULT_UI_SETTINGS, AUTO_SPEED_DELAY,
  type UISettings,
} from '../ui/uiSettings';
import { Cabinet }       from './Cabinet';
import { Counters }      from './Counters';
import { SFX }           from '../ui/sounds';
import { Controls }      from './Controls';
import { SettingsModal } from './SettingsModal';
import { DevPanel }       from './DevPanel';
import { ForcedFlagPanel } from './ForcedFlagPanel';
import type { LCDContent } from '../ui/UIState';

// 回転クロック: 全リール回転開始の時刻と、各リールの開始コマ index
export type SpinClock = { startTime: number; startPos: [number, number, number] };

// ── 初期状態 ─────────────────────────────────────────────────

const INITIAL: GameState = {
  settingLevel:              1,
  coins:                     1000,
  lastNormalPayout:          0,
  lastWinLabel:              '---',
  replayActive:              false,
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
  bonusManualMode:           true,  // デフォルト手動消化 (AUTO消化はオプション)
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
  const [uiSettings, setUiSettings] = useState<UISettings>(DEFAULT_UI_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  // 回転クロック: レバーONで開始時刻と各リールの開始コマをランダムに確定。
  // 停止ボタン押下時、この時刻から現在の中段コマ (pressPos) を逆算する (目押し)。
  const [spinClock, setSpinClock] = useState<SpinClock | null>(null);

  const ui = deriveUIState(gs);

  // ── 回転クロックの開始/終了 ───────────────────────────────
  useEffect(() => {
    const anySpin = gs.reelSpinning.some(Boolean);
    const allSpin = gs.reelSpinning.every(Boolean);
    setSpinClock(prev => {
      if (allSpin && prev === null) {
        const rand = () => Math.floor(Math.random() * 21);
        return { startTime: performance.now(), startPos: [rand(), rand(), rand()] };
      }
      if (!anySpin && prev !== null) return null;
      return prev;
    });
  }, [gs.reelSpinning]);

  // 指定リールの押下位置 (クロック未設定時はランダム)。
  // 中段は減少方向 (下に流れる)。次に中段へ来るコマ = floor(c) を基準にすることで、
  // すべりが必ず減少=下方向のみになり、上方向の戻りが発生しない (下にずれて止まる)。
  function pressPosOf(reelIdx: 0 | 1 | 2): number {
    if (spinClock === null) return Math.floor(Math.random() * 21);
    const c = spinClock.startPos[reelIdx] - spinFrames(performance.now() - spinClock.startTime);
    return ((Math.floor(c) % 21) + 21) % 21;
  }

  // ── §30-8: 停止ボタン押下状態リセット ─────────────────────
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

  // ── ペカ時 AUTO 停止 ───────────────────────────────────────
  useEffect(() => {
    if (gs.jackLampState !== 'on') return;
    if (!uiSettings.stopAutoOnPeka || !gs.autoMode) return;
    dispatch({ type: 'SET_AUTO', value: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.jackLampState]);

  // ── AUTO / ボーナス自動消化タイマー ───────────────────────
  const autoRef = useRef(gs.autoMode);
  autoRef.current = gs.autoMode;

  useEffect(() => {
    const ph = gs.phase;
    const delay = AUTO_SPEED_DELAY[uiSettings.autoSpeed];
    let act: Action | null = null;

    if (ph.kind === 'BONUS_ENTRY' || ph.kind === 'BONUS_GAME') {
      if (!gs.bonusManualMode) act = { type: 'AUTO_TICK' };
    } else if (gs.autoMode && 'sub' in ph) {
      switch (ph.sub) {
        case 'WAIT_BET':   act = { type: 'BET' };                                       break;
        case 'WAIT_LEVER': act = { type: 'LEVER' };                                     break;
        // AUTO は完璧に目押し (autoAimPos) してゴールを確実に揃える
        case 'STOP_L':     act = { type: 'STOP', reel: 'L', pressPos: autoAimPos(gs, 0) }; break;
        case 'STOP_C':     act = { type: 'STOP', reel: 'C', pressPos: autoAimPos(gs, 1) }; break;
        case 'STOP_R':     act = { type: 'STOP', reel: 'R', pressPos: autoAimPos(gs, 2) }; break;
      }
    }

    if (act === null) return;
    const captured = act;
    const t = setTimeout(() => {
      if (autoRef.current || captured.type === 'AUTO_TICK') dispatch(captured);
    }, delay);
    return () => clearTimeout(t);
  }, [gs.autoMode, gs.bonusManualMode, gs.phase, uiSettings.autoSpeed]);

  // ── dispatch ラッパー: 状態変化を確認してから音を鳴らす ──
  function dispatchWithSound(action: Action) {
    const next = transition(gs, action);
    const changed = next !== gs;

    if (changed) {
      if (action.type === 'BET')   SFX.maxbet();
      if (action.type === 'LEVER') SFX.lever();
      if (action.type === 'STOP') {
        if (action.reel === 'L') SFX.stop1();
        if (action.reel === 'C') SFX.stop2();
        if (action.reel === 'R') {
          next.lastNormalPayout > 0 ? SFX.stop3Win() : SFX.stop3();
        }
      }
    }

    dispatch(action);
  }

  // ── ハンドラ ──────────────────────────────────────────────

  function handleBet()   { dispatchWithSound({ type: 'BET' }); }
  function handleLever() { dispatchWithSound({ type: 'LEVER' }); }

  function handleStop(reel: 'L' | 'C' | 'R') {
    const idx = reel === 'L' ? 0 : reel === 'C' ? 1 : 2;
    const pressPos = pressPosOf(idx);
    setPressedStops(prev => {
      const next: [boolean, boolean, boolean] = [prev[0], prev[1], prev[2]];
      next[idx] = true;
      return next;
    });
    dispatchWithSound({ type: 'STOP', reel, pressPos });
  }

  function handleAutoToggle() { dispatch({ type: 'SET_AUTO', value: !gs.autoMode }); }

  // §30-15: 筐体背景クリックで現フェーズの次アクションを発火
  function handleScreenClick() {
    if (gs.isProcessing) return;
    const ph = gs.phase;
    if (!('sub' in ph)) return;
    switch (ph.sub) {
      case 'WAIT_BET':   dispatchWithSound({ type: 'BET' });    break;
      case 'WAIT_LEVER': dispatchWithSound({ type: 'LEVER' });  break;
      case 'STOP_L':     handleStop('L');                        break;
      case 'STOP_C':     handleStop('C');                        break;
      case 'STOP_R':     handleStop('R');                        break;
    }
  }

  function handleSettingsChange(patch: Partial<UISettings>) {
    setUiSettings(prev => ({ ...prev, ...patch }));
  }

  const phaseLabel = (() => {
    const ph = gs.phase;
    if (!('sub' in ph)) return ph.kind;
    return 'gameIndex' in ph
      ? `${ph.kind} G${ph.gameIndex} / ${ph.sub}`
      : `${ph.kind} / ${ph.sub}`;
  })();

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

      <Cabinet
        reelPos={gs.reelPos}
        reelSpinning={gs.reelSpinning}
        spinClock={spinClock}
        maxBetPressed={gs.maxBetPressed}
        leverDown={gs.leverDown}
        pressedStops={pressedStops}
        onBet={handleBet}
        onLever={handleLever}
        onStop={handleStop}
        isNotice={gs.phase.kind === 'BONUS_NOTICE'}
        onClick={handleScreenClick}
      />

      {/* 情報パネル + 操作 (筐体右横) */}
      <div style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
        minWidth:      180,
        paddingTop:    8,
      }}>
        <Controls
          autoMode={gs.autoMode}
          onAutoToggle={handleAutoToggle}
          onSettingsOpen={() => setShowSettings(true)}
        />
        <div style={{ fontSize: 11, color: '#446', letterSpacing: 1, fontFamily: 'monospace' }}>
          {phaseLabel}
          {/* 揃えた後 (消化中) のみ BIG/REG を表示。当たった瞬間は種別を出さない */}
          {gs.phase.kind === 'BONUS_GAME' && gs.bonusContext && (
            <div style={{ color: '#ffaa00', marginTop: 2, fontWeight: 'bold', fontSize: 13 }}>
              {bonusKindLabel(gs.bonusContext.kind)} 消化中
            </div>
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
        <LcdPlaceholder lcdContent={ui.lcdContent} />

        {/* 成立役・払い戻し */}
        <div style={{
          display:       'flex',
          gap:           12,
          fontSize:      12,
          fontFamily:    'monospace',
          color:         '#888',
        }}>
          <div>
            <div style={{ fontSize: 10, color: '#555', letterSpacing: 1 }}>成立役</div>
            <div style={{ color: '#ffd700', fontWeight: 'bold' }}>{gs.lastWinLabel}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#555', letterSpacing: 1 }}>払い戻し</div>
            <div style={{ color: '#00ffcc', fontWeight: 'bold' }}>{gs.lastNormalPayout}枚</div>
          </div>
        </div>
      </div>

      {/* DEV パネル群 */}
      {import.meta.env.DEV && <DevPanel gs={gs} dispatch={dispatch} />}
      {import.meta.env.DEV && <ForcedFlagPanel gs={gs} dispatch={dispatch} />}

      {showSettings && (
        <SettingsModal
          settings={uiSettings}
          bonusManualMode={gs.bonusManualMode}
          settingLevel={gs.settingLevel}
          onClose={() => setShowSettings(false)}
          onChange={handleSettingsChange}
          onBonusManual={v => dispatch({ type: 'SET_BONUS_MANUAL', value: v })}
          onSettingLevel={lv => dispatch({ type: 'SET_SETTING_LEVEL', level: lv })}
        />
      )}

    </div>
  );
}

// ボーナスコンテキストの種別を BIG / REG の表示用ラベルに変換
function bonusKindLabel(kind: string): 'BIG' | 'REG' {
  return kind.includes('REG') ? 'REG' : 'BIG';
}

// ── LCD プレースホルダー ───────────────────────────────────────

function LcdPlaceholder({ lcdContent }: { lcdContent: LCDContent }) {
  const text = (() => {
    switch (lcdContent.mode) {
      case 'normal':            return '— NORMAL —';
      case 'bonus_notice':      return `★ BONUS! ${lcdContent.notifyPattern ?? ''}`;
      case 'bonus_game':
        return `${bonusKindLabel(lcdContent.main.bonusKind)} 消化中  rem:${lcdContent.main.remainingPayout}`
          + (lcdContent.sub ? `  [RUSH SET ${lcdContent.sub.setIndex}  +${lcdContent.sub.totalPayout}]` : '');
      case 'countdown':         return `COUNTDOWN  G${lcdContent.gameIndex}/3`;
      case 'countdown_revival': return `REVIVAL!!  G${lcdContent.gameIndex}/3`;
      case 'rush_judge':        return `MIDNIGHT RUSH  SET${lcdContent.setIndex}  G${lcdContent.gameIndex}/6`;
      case 'rush_set':          return `RUSH SET ${lcdContent.setIndex}  total:${lcdContent.totalPayout}`;
      case 'rush_end':          return `RUSH END  total:${lcdContent.totalPayout}`;
    }
  })();

  const isRush = lcdContent.mode === 'rush_judge' || lcdContent.mode === 'rush_set';
  const isBig  = lcdContent.mode === 'bonus_game' || lcdContent.mode === 'bonus_notice';

  return (
    <div style={{
      textAlign:      'center',
      padding:        '6px 12px',
      background:     '#060610cc',
      border:         `1px solid ${isRush ? '#ff44cc44' : isBig ? '#ffd70044' : '#223'}`,
      borderRadius:   6,
      fontSize:       12,
      color:          isRush ? '#ff44cc' : isBig ? '#ffd700' : '#556',
      letterSpacing:  1,
      minHeight:      28,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      {text}
    </div>
  );
}
