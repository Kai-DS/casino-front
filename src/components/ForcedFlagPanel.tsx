import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Dispatch } from 'react';
import type { Action } from '../core/stateMachine';
import type { GameState } from '../types/state';
import { FLAG, type Flag } from '../types/domain';

type Props = {
  gs:       GameState;
  dispatch: Dispatch<Action>;
};

const SMALL_FLAGS: [string, Flag][] = [
  ['BLUE_GEM',     FLAG.BLUE_GEM],
  ['BELL',         FLAG.BELL],
  ['JACK',         FLAG.JACK],
  ['REPLAY',       FLAG.REPLAY],
  ['ANGLE_CHERRY', FLAG.ANGLE_CHERRY],
];

const BONUS_FLAGS: [string, Flag][] = [
  ['NORMAL_BIG',        FLAG.NORMAL_BIG],
  ['NORMAL_REG',        FLAG.NORMAL_REG],
  ['CENTER_CHERRY_BIG', FLAG.CENTER_CHERRY_BIG],
  ['PREMIUM_BIG',       FLAG.PREMIUM_BIG],
  ['ANGLE_CHERRY_BIG',  FLAG.ANGLE_CHERRY_BIG],
  ['ANGLE_CHERRY_REG',  FLAG.ANGLE_CHERRY_REG],
  ['CEILING_BIG',       FLAG.CEILING_BIG],
];

export function ForcedFlagPanel({ gs, dispatch }: Props) {
  const [selectedFlag, setSelectedFlag] = useState<Flag | null>(null);

  const armed     = gs.debugForcedFlag;
  const isDirty   = selectedFlag !== armed;

  function handleApply() {
    dispatch({ type: 'SET_DEBUG_FLAG', flag: selectedFlag });
  }

  function handleClear() {
    setSelectedFlag(null);
    dispatch({ type: 'SET_DEBUG_FLAG', flag: null });
  }

  return (
    <div style={{
      width:         220,
      background:    '#080810',
      border:        '1px solid #334',
      borderRadius:  10,
      padding:       12,
      display:       'flex',
      flexDirection: 'column',
      gap:           10,
      fontSize:      11,
      color:         '#888',
      fontFamily:    'monospace',
      alignSelf:     'flex-start',
    }}>
      <div style={{ color: '#556', fontWeight: 'bold', letterSpacing: 2, borderBottom: '1px solid #223', paddingBottom: 4 }}>
        FORCED FLAG
      </div>

      <Section label="SMALL">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {SMALL_FLAGS.map(([label, flag]) => (
            <FlagBtn
              key={flag}
              label={label}
              selected={selectedFlag === flag}
              armed={armed === flag}
              onClick={() => setSelectedFlag(prev => prev === flag ? null : flag)}
            />
          ))}
        </div>
      </Section>

      <Section label="BONUS">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {BONUS_FLAGS.map(([label, flag]) => (
            <FlagBtn
              key={flag}
              label={label}
              selected={selectedFlag === flag}
              armed={armed === flag}
              onClick={() => setSelectedFlag(prev => prev === flag ? null : flag)}
            />
          ))}
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
        <button
          onClick={handleApply}
          disabled={!isDirty}
          style={{
            flex:         1,
            padding:      '3px 0',
            borderRadius: 4,
            border:       `1px solid ${isDirty ? '#00ffcc' : '#334'}`,
            background:   isDirty ? '#00ffcc22' : 'transparent',
            color:        isDirty ? '#00ffcc' : '#334',
            fontSize:     10,
            fontFamily:   'monospace',
            cursor:       isDirty ? 'pointer' : 'default',
          }}
        >
          APPLY
        </button>
        <button
          onClick={handleClear}
          style={{
            padding:      '3px 8px',
            borderRadius: 4,
            border:       `1px solid ${armed !== null || selectedFlag !== null ? '#cc4444' : '#334'}`,
            background:   'transparent',
            color:        armed !== null || selectedFlag !== null ? '#cc4444' : '#334',
            fontSize:     10,
            fontFamily:   'monospace',
            cursor:       'pointer',
          }}
        >
          CLR
        </button>
      </div>

      <div style={{ fontSize: 10, lineHeight: 1.6 }}>
        {selectedFlag !== null && (
          <div style={{ color: isDirty ? '#ffe066' : '#556' }}>
            SEL: {selectedFlag}{isDirty ? ' *' : ''}
          </div>
        )}
        {armed !== null ? (
          <div style={{ color: '#ff9944' }}>ARMED: {armed}</div>
        ) : (
          <div style={{ color: '#334' }}>ARMED: —</div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#445', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function FlagBtn({
  label, selected, armed, onClick,
}: {
  label:    string;
  selected: boolean;
  armed:    boolean;
  onClick:  () => void;
}) {
  const color = armed ? '#ff9944' : selected ? '#ffe066' : '#446';
  return (
    <button
      onClick={onClick}
      style={{
        padding:      '2px 5px',
        borderRadius: 4,
        border:       `1px solid ${color}`,
        background:   selected || armed ? `${color}33` : 'transparent',
        color,
        fontSize:     10,
        fontFamily:   'monospace',
        cursor:       'pointer',
        lineHeight:   1.4,
      }}
    >
      {label}
    </button>
  );
}
