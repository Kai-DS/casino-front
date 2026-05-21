import type { ReactNode } from 'react';
import { CABINET } from '../ui/layout';

type Props = { children: ReactNode; isNotice: boolean; onClick?: () => void };

export function Cabinet({ children, isNotice, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        width:        CABINET.width,
        background:   isNotice ? undefined : CABINET.bg,
        animation:    isNotice ? 'notice-flash 0.4s ease-in-out infinite' : undefined,
        border:       `2px solid ${CABINET.border}`,
        boxShadow:    `0 0 24px ${CABINET.glow}, inset 0 0 12px ${CABINET.glow}`,
        borderRadius: 16,
        padding:      CABINET.padding,
        display:      'flex',
        flexDirection: 'column',
        gap:           12,
        cursor:        onClick ? 'pointer' : undefined,
        userSelect:    'none',
      }}
    >
      {/* タイトル */}
      <div style={{
        textAlign:  'center',
        fontSize:   28,
        fontWeight: 'bold',
        color:      '#00ffcc',
        letterSpacing: 6,
        animation:  'neon-pulse 2s ease-in-out infinite',
        textShadow: '0 0 12px #00ffcc, 0 0 30px #00ffcc88',
      }}>
        NEON JACK
      </div>
      {children}
    </div>
  );
}
