// 内部抽選ロジック (§12, §8, §9, §A3)
//
// §A3 案Y 分離実装:
//   CENTER_CHERRY_BIG = 中段CHERRY+BIG (設定別固定確率, 1/8192 等)  → 中段CHERRY視覚 + RUSH直行
//   PREMIUM_BIG       = 単独BIG の 1% 変換 (設定共通)               → LOSS視覚のまま RUSH直行
//   ANGLE_CHERRY_BIG  = 角CHERRY+BIG (残りBIG の 22/97)            → 角CHERRY視覚 + BIG → COUNTDOWN

import { FLAG, type Flag, type SettingLevel } from '../types/domain';
import type { GameState } from '../types/state';

// §A3 確定値: 設定別パラメータ
type SettingParams = {
  bigTotal:        number; // §8 BIG合算確率
  regTotal:        number; // §8 REG確率
  blueGem:         number; // §9 BLUE GEM確率
  angleCherry:     number; // §9 角CHERRY確率
  centerCherryBig: number; // §A3 中段CHERRY+BIG 設定別固定値
};

const SETTING_PARAMS: Record<SettingLevel, SettingParams> = {
  1: { bigTotal: 1/218,  regTotal: 1/272,  blueGem: 1/6.10,  angleCherry: 1/36,   centerCherryBig: 1/8192 },
  4: { bigTotal: 1/210,  regTotal: 1/270,  blueGem: 1/5.90,  angleCherry: 1/35,   centerCherryBig: 1/7281 },
  5: { bigTotal: 1/205,  regTotal: 1/255,  blueGem: 1/5.75,  angleCherry: 1/34.5, centerCherryBig: 1/6553 },
  6: { bigTotal: 1/195,  regTotal: 1/235,  blueGem: 1/5.55,  angleCherry: 1/34,   centerCherryBig: 1/5957 },
};

type WeightedEntry = readonly [Flag, number];

/**
 * §A3 案Y:
 *   1. CENTER_CHERRY_BIG を固定確率で分離
 *   2. 残り (bigTotal - centerCherryBig) を 75:22 で 単独BIG / 角CHERRY+BIG に按分
 *   3. 単独BIG プールの 1% を PREMIUM_BIG に変換 (残り 99% が NORMAL_BIG)
 *      ─ 直接テーブル方式は §A3 のポスト変換コードと確率的に等価
 */
function buildTable(p: SettingParams): ReadonlyArray<WeightedEntry> {
  const residualBig    = p.bigTotal - p.centerCherryBig;
  const normalBigPool  = residualBig * (75 / 97); // 75:22 按分: 単独BIG プール
  const angleCherryBig = residualBig * (22 / 97); // 75:22 按分: 角CHERRY+BIG

  // §A3: 単独BIG プールの 1% が PREMIUM_BIG (LOSS視覚, RUSH直行)
  const premiumBig = normalBigPool * 0.01;
  const normalBig  = normalBigPool * 0.99;

  const normalReg      = p.regTotal * 0.75;
  const angleCherryReg = p.regTotal * 0.25;

  const base: Array<[Flag, number]> = [
    [FLAG.CENTER_CHERRY_BIG, p.centerCherryBig], // 中段CHERRY視覚 + RUSH直行
    [FLAG.PREMIUM_BIG,       premiumBig],         // LOSS視覚 + RUSH直行 (隠れ激熱)
    [FLAG.NORMAL_BIG,        normalBig],
    [FLAG.ANGLE_CHERRY_BIG,  angleCherryBig],
    [FLAG.NORMAL_REG,        normalReg],
    [FLAG.ANGLE_CHERRY_REG,  angleCherryReg],
    [FLAG.REPLAY,            1 / 7.30],
    [FLAG.BLUE_GEM,          p.blueGem],
    [FLAG.BELL,              1 / 1024],
    [FLAG.JACK,              1 / 1024],
    [FLAG.ANGLE_CHERRY,      p.angleCherry],
  ];

  const sumNonLoss = base.reduce((s, [, prob]) => s + prob, 0);
  return [...base, [FLAG.LOSS, 1 - sumNonLoss]];
}

const TABLES: Record<SettingLevel, ReadonlyArray<WeightedEntry>> = {
  1: buildTable(SETTING_PARAMS[1]),
  4: buildTable(SETTING_PARAMS[4]),
  5: buildTable(SETTING_PARAMS[5]),
  6: buildTable(SETTING_PARAMS[6]),
};

// ── 抽選関数 ─────────────────────────────────────────────────

/** レバーON時の内部抽選 (§12)。C4: デバッグフラグが設定されていれば1回消費して返す。 */
export function selectFlag(gs: GameState): Flag {
  if (gs.debugForcedFlag !== null) {
    const f = gs.debugForcedFlag;
    gs.debugForcedFlag = null;
    return f;
  }
  return drawFromTable(gs.settingLevel);
}

function drawFromTable(setting: SettingLevel): Flag {
  const table = TABLES[setting];
  const r = Math.random();
  let cum = 0;
  for (const [flag, prob] of table) {
    cum += prob;
    if (r < cum) return flag;
  }
  return FLAG.LOSS;
}

/** §18-1: 1G連抽選 (全設定共通 1/110) */
export function draw1GRen(): boolean {
  return Math.random() < 1 / 110;
}

/** §B3: NEON COUNTDOWN 突入率 100% 確定 (v7.3 §B3) */
export function drawCountdownSuccess(_setting: SettingLevel): boolean {
  return true;
}

/** §17-2: RUSH内部継続抽選 (1G連なし時、約67.7%) */
export function drawRushContinue(): boolean {
  return Math.random() < 0.677;
}

/** §16: RUSH中ボーナス種別振り分け (BIG/REG 50:50) */
export function drawRushBonusType(): 'BIG' | 'REG' {
  return Math.random() < 0.5 ? 'BIG' : 'REG';
}

// ── 検査・確認用 ──────────────────────────────────────────────

export type ProbEntry = {
  flag:          string;
  prob:          number;
  oneInX:        string;
  note?:         string;
};

/** 確率テーブル全体を設定別に返す (シミュレーション・確認用) */
export function getProbTable(): Record<SettingLevel, ProbEntry[]> {
  const result = {} as Record<SettingLevel, ProbEntry[]>;
  for (const s of [1, 4, 5, 6] as SettingLevel[]) {
    const p = SETTING_PARAMS[s];
    const residualBig   = p.bigTotal - p.centerCherryBig;
    const normalBigPool = residualBig * (75 / 97);
    const premiumBig    = normalBigPool * 0.01;

    result[s] = TABLES[s].map(([flag, prob]) => {
      const entry: ProbEntry = {
        flag:   flag as string,
        prob,
        oneInX: prob > 0 ? `1/${(1 / prob).toFixed(1)}` : '0',
      };
      if (flag === FLAG.PREMIUM_BIG) {
        const pct = (premiumBig / normalBigPool * 100).toFixed(2);
        entry.note = `単独BIG プールの ${pct}%`;
      }
      if (flag === FLAG.CENTER_CHERRY_BIG) {
        const pct = (p.centerCherryBig / p.bigTotal * 100).toFixed(2);
        entry.note = `全BIGの ${pct}%`;
      }
      return entry;
    });
  }
  return result;
}

/** §A3 の確定値パラメータ (検証用) */
export { SETTING_PARAMS };
