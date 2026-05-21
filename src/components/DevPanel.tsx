import type { ReactNode } from 'react';
import type { Dispatch } from 'react';
import type { Action } from '../core/stateMachine';
import type { GameState } from '../types/state';
import type { SettingLevel } from '../types/domain';

type Props = {
  gs:       GameState;
  dispatch: Dispatch<Action>;
};

const SETTING_LEVELS: SettingLevel[] = [1, 4, 5, 6];

export function DevPanel({ gs, dispatch }: Props) {
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
        DEV
      </div>

      {/* コイン */}
      <Section label="COINS">
        <DevBtn
          label="+10000"
          color="#00ffcc"
          onClick={() => dispatch({ type: 'ADD_COINS', amount: 10000 })}
        />
      </Section>

      {/* 設定 */}
      <Section label="SETTING">
        <div style={{ display: 'flex', gap: 4 }}>
          {SETTING_LEVELS.map(lv => (
            <DevBtn
              key={lv}
              label={`設定${lv}`}
              color={gs.settingLevel === lv ? '#ffd700' : '#556'}
              active={gs.settingLevel === lv}
              onClick={() => dispatch({ type: 'SET_SETTING_LEVEL', level: lv })}
            />
          ))}
        </div>
      </Section>

      {/* RUSH継続強制 (クリックで即セット) */}
      <Section label="RUSH RESULT">
        <div style={{ display: 'flex', gap: 4 }}>
          {(['SUCCESS', 'FAIL'] as const).map(r => (
            <DevBtn
              key={r}
              label={r}
              color={gs.debugForcedRushResult === r ? (r === 'SUCCESS' ? '#44ff88' : '#ff4444') : '#446'}
              active={gs.debugForcedRushResult === r}
              onClick={() => dispatch({ type: 'SET_DEBUG_RUSH', result: r })}
            />
          ))}
          <DevBtn
            label="CLR"
            color={gs.debugForcedRushResult !== null ? '#cc4444' : '#334'}
            onClick={() => dispatch({ type: 'SET_DEBUG_RUSH', result: null })}
          />
        </div>
        {gs.debugForcedRushResult !== null && (
          <div style={{ color: '#44ff88', fontSize: 10, marginTop: 3 }}>
            RUSH: {gs.debugForcedRushResult}
          </div>
        )}
      </Section>

      {/* 状態表示 */}
      <div style={{ borderTop: '1px solid #223', paddingTop: 6, fontSize: 10, color: '#445', lineHeight: 1.6 }}>
        <div>coins: <span style={{ color: '#00ffcc' }}>{gs.coins}</span></div>
        <div>setting: <span style={{ color: '#ffd700' }}>{gs.settingLevel}</span></div>
        <div>games: <span style={{ color: '#777' }}>{gs.normalGameCount}</span></div>
        <div>rush: <span style={{ color: gs.rushActive ? '#ff44cc' : '#445' }}>
          {gs.rushActive ? `SET${gs.rushSetIndex} +${gs.rushTotalPayout}` : 'off'}
        </span></div>
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

function DevBtn({
  label, color, active, onClick,
}: {
  label:   string;
  color:   string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:      '2px 5px',
        borderRadius: 4,
        border:       `1px solid ${color}`,
        background:   active ? `${color}33` : 'transparent',
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
