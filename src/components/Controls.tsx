import { COLORS, BUTTON } from '../ui/layout';

type Props = {
  autoMode:       boolean;
  onAutoToggle:   () => void;
  onSettingsOpen: () => void;
};

export function Controls({ autoMode, onAutoToggle, onSettingsOpen }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
      <ToggleButton
        label={autoMode ? '⏸ AUTO ON' : '▶ AUTO'}
        active={autoMode}
        onClick={onAutoToggle}
      />
      <ToggleButton
        label="⚙ SETTINGS"
        active={false}
        onClick={onSettingsOpen}
      />
    </div>
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
        height:       BUTTON.h,
        borderRadius: BUTTON.radius,
        border:       `1px solid ${color}`,
        background:   active ? `${color}22` : 'transparent',
        color,
        fontSize:     BUTTON.fontSize,
        fontFamily:   'inherit',
        letterSpacing: 1,
        cursor:       'pointer',
      }}
    >
      {label}
    </button>
  );
}
