// D5: ライン評価結果

import type { PaylineKey } from './domain';
import type { Role } from './domain';

export type LineHit = {
  line: PaylineKey;
  role: Role;
};

export type EvaluateLinesResult = {
  /** 揃った全ライン (表示用) */
  hits: LineHit[];
  /** CHERRY判定 (左リールのみ、ライン評価とは独立) */
  cherry: 'CENTER' | 'ANGLE' | null;
};
