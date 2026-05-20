// D4: 告知パターンと液晶モード

/** 告知パターン (A2 で LATE_REVIVAL に改名) */
export type NotifyPattern =
  | 'GACO'          // 後ペカ ガコッ音あり 37.5%
  | 'SILENT'        // 後ペカ 無音 37.5%
  | 'PRE_LEVER'     // 先ペカ レバーON時 15%
  | 'PRE_SPIN'      // 先ペカ リール始動時 5%
  | 'DELAY'         // 遅れペカ 3%
  | 'LATE_REVIVAL'; // 遅延復活ペカ 2% (v7.3 A2)

export type PremierEffect =
  | 'LAMP_RAINBOW'
  | 'STRONG_GACO'
  | 'FULL_SILENT'
  | 'SLOW_LIGHT'
  | 'LAMP_DELAY';

/** 液晶モード (A4 の優先度順で切り替え) */
export type LCDMode =
  | 'normal'
  | 'bonus_notice'
  | 'bonus_game'
  | 'countdown'
  | 'countdown_revival'
  | 'rush_judge'
  | 'rush_set'
  | 'rush_end';

/** JACKランプ */
export type JackLampState = 'off' | 'on' | 'blink' | 'rainbow';

/** サイドランプ */
export type SideLampState = 'off' | 'on' | 'bonus' | 'rush';
