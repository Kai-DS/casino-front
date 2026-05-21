import type { ReelWindow } from '../core/reels';
import type { GameSymbol } from '../types/domain';
import { REEL, PAYLINE_COLOR, SYMBOL } from '../ui/layout';

type Props = {
  reelWindow:   ReelWindow;
  reelSpinning: readonly [boolean, boolean, boolean];
};

export function ReelWindow({ reelWindow, reelSpinning }: Props) {
  const reels = [
    { col: reelWindow.left,   spinning: reelSpinning[0] },
    { col: reelWindow.center, spinning: reelSpinning[1] },
    { col: reelWindow.right,  spinning: reelSpinning[2] },
  ] as const;

  return (
    <div style={{
      display:         'flex',
      gap:             REEL.gap,
      background:      '#000',
      border:          `2px solid ${PAYLINE_COLOR}44`,
      borderRadius:    8,
      padding:         6,
      position:        'relative',
    }}>
      {/* 中段ペイラインマーカー */}
      <div style={{
        position:    'absolute',
        left:        0, right: 0,
        top:         6 + REEL.cellH,   // top cell height + padding
        height:      REEL.cellH,
        border:      `2px solid ${PAYLINE_COLOR}`,
        borderLeft:  'none', borderRight: 'none',
        pointerEvents: 'none',
        zIndex:       1,
      }} />

      {reels.map(({ col, spinning }, ri) => (
        <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {col.map((sym, rowIdx) => (
            <SymbolCell
              key={rowIdx}
              sym={sym}
              isCenter={rowIdx === 1}
              spinning={spinning}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SymbolCell({
  sym,
  isCenter,
  spinning,
}: {
  sym:      GameSymbol;
  isCenter: boolean;
  spinning: boolean;
}) {
  const info = SYMBOL[sym] ?? { label: '?', color: '#fff', bg: '#111' };

  return (
    <div style={{
      width:          REEL.cellW,
      height:         REEL.cellH,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      background:     spinning ? '#111' : info.bg,
      border:         isCenter
        ? `2px solid ${PAYLINE_COLOR}88`
        : `1px solid ${REEL.border}`,
      borderRadius:   4,
      fontSize:       spinning ? 20 : isCenter ? 36 : 26,
      fontWeight:     'bold',
      color:          spinning ? '#444' : info.color,
      textShadow:     spinning ? 'none' : `0 0 10px ${info.color}88`,
      animation:      spinning ? 'reel-spin 0.12s linear infinite' : undefined,
      transition:     'background 0.1s',
      overflow:       'hidden',
    }}>
      {spinning ? '↕' : info.label}
    </div>
  );
}
