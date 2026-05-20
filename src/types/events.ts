// D6: 型付きイベントエミッタ

import type { Flag } from './domain';
import type { BonusContext } from './bonus';
import type { LineHit } from './lines';

export type CountdownTiming =
  | 'COUNT_8' | 'COUNT_7' | 'COUNT_6' | 'COUNT_5' | 'COUNT_4'
  | 'COUNT_3' | 'COUNT_2' | 'COUNT_1' | 'LAST' | 'COUNTDOWN_REVIVAL';

export interface GameEventMap {
  lineHit:       { hits: LineHit[]; cherry: 'CENTER' | 'ANGLE' | null };
  bonusStart:    { context: NonNullable<BonusContext> };
  bonusEnd:      { context: NonNullable<BonusContext>; totalPayout: number };
  oneGRen:       { nextBonusFlag: Flag };
  rushStart:     { initialSet: number };
  rushContinue:  { nextSet: number };
  rushFail:      { totalSets: number; totalPayout: number };
  rushEnd:       void;
  lampOn:        { color: 'blue' | 'rainbow'; blinking: boolean };
  lampOff:       void;
  countdownPeka: { timing: CountdownTiming };
}

export class TypedEventEmitter<M extends Record<string, unknown>> {
  private listeners = new Map<keyof M, Array<(payload: M[keyof M]) => void>>();

  on<K extends keyof M>(event: K, fn: (payload: M[K]) => void): void {
    const arr = (this.listeners.get(event) ?? []) as Array<(p: M[keyof M]) => void>;
    arr.push(fn as (p: M[keyof M]) => void);
    this.listeners.set(event, arr);
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    this.listeners.get(event)?.forEach(fn => fn(payload as M[keyof M]));
  }

  off<K extends keyof M>(event: K, fn: (payload: M[K]) => void): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(fn as (p: M[keyof M]) => void);
    if (idx >= 0) arr.splice(idx, 1);
  }
}
