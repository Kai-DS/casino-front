import type { AutoSpeed, UISettings } from '../ui/uiSettings';
import { AUTO_SPEED_LABEL } from '../ui/uiSettings';

type Props = {
  settings:       UISettings;
  bonusManualMode: boolean;
  onClose:        () => void;
  onChange:       (patch: Partial<UISettings>) => void;
  onBonusManual:  (v: boolean) => void;
};

const SPEEDS: AutoSpeed[] = ['normal', 'double', 'turbo'];

export function SettingsModal({ settings, bonusManualMode, onClose, onChange, onBonusManual }: Props) {
  return (
    // オーバーレイ — クリックで閉じる
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset:    0,
        background: '#00000088',
        display:  'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex:   200,
      }}
    >
      {/* モーダル本体 — クリック伝播を止める */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   '#0d0d1a',
          border:       '1px solid #00ffcc44',
          borderRadius: 12,
          padding:      '20px 24px',
          minWidth:     280,
          color:        '#aaa',
          fontFamily:   'inherit',
          display:      'flex',
          flexDirection: 'column',
          gap:          16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 'bold', color: '#00ffcc', letterSpacing: 2 }}>
          ⚙ SETTINGS
        </div>

        {/* AUTO速度 */}
        <fieldset style={{ border: '1px solid #223', borderRadius: 6, padding: '8px 12px', margin: 0 }}>
          <legend style={{ fontSize: 11, color: '#666', letterSpacing: 1, padding: '0 4px' }}>AUTO速度</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {SPEEDS.map(speed => (
              <label key={speed} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="autoSpeed"
                  value={speed}
                  checked={settings.autoSpeed === speed}
                  onChange={() => onChange({ autoSpeed: speed })}
                  style={{ accentColor: '#00ffcc' }}
                />
                {AUTO_SPEED_LABEL[speed]}
              </label>
            ))}
          </div>
        </fieldset>

        {/* ペカ停止 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={settings.stopAutoOnPeka}
            onChange={e => onChange({ stopAutoOnPeka: e.target.checked })}
            style={{ accentColor: '#00ffcc', width: 16, height: 16 }}
          />
          ペカったら自動を止めて手動に戻る
        </label>

        {/* ボーナス手動消化 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={bonusManualMode}
            onChange={e => onBonusManual(e.target.checked)}
            style={{ accentColor: '#ffaa00', width: 16, height: 16 }}
          />
          <span>ボーナス手動消化 <span style={{ fontSize: 10, color: '#666' }}>(BET/LEVER/STOP 操作)</span></span>
        </label>

        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          style={{
            marginTop:    4,
            height:       38,
            borderRadius: 8,
            border:       '1px solid #00ffcc44',
            background:   '#00ffcc11',
            color:        '#00ffcc',
            fontSize:     13,
            fontFamily:   'inherit',
            letterSpacing: 1,
            cursor:       'pointer',
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
