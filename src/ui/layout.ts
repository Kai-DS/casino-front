// レイアウト定数 (§30-4)

export const CABINET = {
  width:    480,
  padding:  16,
  bg:       '#0d0d1a',
  border:   '#00ffcc',
  glow:     '#00ffcc55',
} as const;

export const REEL = {
  cellW:  130,
  cellH:  82,
  gap:    6,
  bg:     '#00000a',
  border: '#223',
} as const;

export const PAYLINE_COLOR = '#ffd700' as const;

export const BUTTON = {
  h:        52,
  radius:   8,
  fontSize: 13,
} as const;

export const COLORS = {
  bet:      '#00ffcc',
  lever:    '#00ff66',
  stop:     '#ffcc00',
  push:     '#ff44cc',
  toggle:   '#888',
  toggleOn: '#00ffcc',
  disabled: '#2a2a2a',
  dimText:  '#555',
} as const;

export const SYMBOL: Record<string, { label: string; color: string; bg: string }> = {
  SEVEN:    { label: '7',   color: '#ff2020', bg: '#300010' },
  BAR:      { label: 'BAR', color: '#d0d0d0', bg: '#1a1a1a' },
  JACK:     { label: 'J',   color: '#ffd700', bg: '#221a00' },
  BLUE_GEM: { label: '♦',  color: '#00bfff', bg: '#001833' },
  BELL:     { label: '♪',  color: '#ffaa00', bg: '#221500' },
  CHERRY:   { label: '♥',  color: '#ff5544', bg: '#220010' },
  REPLAY:   { label: '↺',  color: '#00ff88', bg: '#001a0d' },
};
