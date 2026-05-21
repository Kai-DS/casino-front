import type { ButtonState } from '../ui/UIState';
import { BUTTON, COLORS } from '../ui/layout';

type Props = {
  buttons:         ButtonState;
  pressedStops:    readonly [boolean, boolean, boolean];
  autoMode:        boolean;
  bonusManualMode: boolean;
  onBet:           () => void;
  onLever:         () => void;
  onStop:          (reel: 'L' | 'C' | 'R') => void;
  onAutoToggle:    () => void;
  onManualToggle:  () => void;
};

export function Controls({
  buttons, pressedStops, autoMode, bonusManualMode,
  onBet, onLever, onStop, onAutoToggle, onManualToggle,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* 行1: MAX BET + LEVER */}
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionButton
          label="MAX BET"
          enabled={buttons.bet}
          color={COLORS.bet}
          onClick={onBet}
          flex={1}
        />
        <ActionButton
          label="▶ LEVER"
          enabled={buttons.lever}
          color={COLORS.lever}
          onClick={onLever}
          flex={2}
        />
      </div>

      {/* 行2: STOP L / C / R */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['L', 'C', 'R'] as const).map((reel, i) => (
          <StopButton
            key={reel}
            label={`STOP ${reel}`}
            enabled={buttons.stopL && reel === 'L' || buttons.stopC && reel === 'C' || buttons.stopR && reel === 'R'}
            pressed={pressedStops[i] ?? false}
            onClick={() => onStop(reel)}
          />
        ))}
      </div>

      {/* 行3: PUSH */}
      <ActionButton
        label="PUSH"
        enabled={false}
        color={COLORS.push}
        onClick={() => { /* future: phase-specific push action */ }}
        flex={1}
      />

      {/* 行4: AUTO / MANUAL BONUS トグル */}
      <div style={{ display: 'flex', gap: 8 }}>
        <ToggleButton
          label={autoMode ? '⏸ AUTO ON' : '▶ AUTO'}
          active={autoMode}
          onClick={onAutoToggle}
        />
        <ToggleButton
          label={bonusManualMode ? '⚙ MANUAL ON' : '⚙ MANUAL'}
          active={bonusManualMode}
          onClick={onManualToggle}
        />
      </div>

    </div>
  );
}

// ── 汎用ボタン ─────────────────────────────────────────────────

function ActionButton({
  label, enabled, color, onClick, flex,
}: {
  label:   string;
  enabled: boolean;
  color:   string;
  onClick: () => void;
  flex?:   number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      style={{
        flex:          flex ?? 1,
        height:        BUTTON.h,
        borderRadius:  BUTTON.radius,
        border:        `2px solid ${enabled ? color : COLORS.disabled}`,
        background:    enabled ? `${color}22` : COLORS.disabled,
        color:         enabled ? color : COLORS.dimText,
        fontSize:      BUTTON.fontSize,
        fontWeight:    'bold',
        fontFamily:    'inherit',
        letterSpacing: 1,
        cursor:        enabled ? 'pointer' : 'not-allowed',
        transition:    'background 0.1s, transform 0.08s',
        textShadow:    enabled ? `0 0 8px ${color}88` : 'none',
        boxShadow:     enabled ? `0 0 10px ${color}44` : 'none',
      }}
      onMouseDown={(e) => {
        if (!enabled) return;
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)';
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
      }}
    >
      {label}
    </button>
  );
}

function StopButton({
  label, enabled, pressed, onClick,
}: {
  label:   string;
  enabled: boolean;
  pressed: boolean;
  onClick: () => void;
}) {
  const active = enabled || pressed;
  const color  = COLORS.stop;
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      style={{
        flex:          1,
        height:        BUTTON.h,
        borderRadius:  BUTTON.radius,
        border:        `2px solid ${active ? color : COLORS.disabled}`,
        background:    pressed  ? `${color}55`
                     : enabled  ? `${color}22`
                     :            COLORS.disabled,
        color:         active ? color : COLORS.dimText,
        fontSize:      BUTTON.fontSize,
        fontWeight:    'bold',
        fontFamily:    'inherit',
        letterSpacing: 1,
        cursor:        enabled ? 'pointer' : 'not-allowed',
        transition:    'background 0.1s',
        boxShadow:     pressed ? `0 0 14px ${color}88` : enabled ? `0 0 6px ${color}33` : 'none',
      }}
    >
      {label}
    </button>
  );
}

function ToggleButton({
  label, active, onClick,
}: {
  label:   string;
  active:  boolean;
  onClick: () => void;
}) {
  const color = active ? COLORS.toggleOn : COLORS.toggle;
  return (
    <button
      onClick={onClick}
      style={{
        flex:         1,
        height:       38,
        borderRadius: BUTTON.radius,
        border:       `1px solid ${color}`,
        background:   active ? `${color}22` : 'transparent',
        color,
        fontSize:     11,
        fontFamily:   'inherit',
        letterSpacing: 1,
        cursor:       'pointer',
      }}
    >
      {label}
    </button>
  );
}
