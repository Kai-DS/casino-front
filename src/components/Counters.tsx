type Props = {
  coins:           number;
  lastNormalPayout: number;
  normalGameCount: number;
  rushActive:      boolean;
  rushSetIndex:    number;
  rushTotalPayout: number;
};

export function Counters({ coins, lastNormalPayout, normalGameCount, rushActive, rushSetIndex, rushTotalPayout }: Props) {
  return (
    <div style={{
      display:         'flex',
      justifyContent:  'space-between',
      background:      '#060612',
      border:          '1px solid #223',
      borderRadius:    8,
      padding:         '8px 12px',
      fontSize:        13,
    }}>
      <Counter label="COINS"  value={coins}            color="#00ffcc" />
      <Counter label="PAYOUT" value={lastNormalPayout} color="#ffd700" />
      {rushActive
        ? <>
            <Counter label="RUSH SET"   value={rushSetIndex}    color="#ff44cc" />
            <Counter label="RUSH TOTAL" value={rushTotalPayout} color="#ff44cc" />
          </>
        : <Counter label="GAMES" value={normalGameCount} color="#aaa" />
      }
    </div>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#666', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 'bold', color, lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}
