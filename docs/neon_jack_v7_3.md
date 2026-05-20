# NEON JACK 仕様書 v7.3 完全版

v7.2 本体 (29項目差分込み) を出発点とし、v7.3 提案書の A群〜D群を全て確定、§30「筐体UI・ガワ連携仕様」を新規統合した最終版。

本仕様書は v7.2 への **差分パッチ + 追加章** の形式で構成する。v7.2 本体と併せて参照すること。

---

## 0. v7.3 への変更サマリー

| カテゴリ | 件数 | 主要変更 |
|---|---:|---|
| A群: 数値・論理の確定 | 4 | 中段CHERRY演出削除、復活ペカ分離、BIG分配再設計、液晶優先度確定 |
| B群: 文書整合 | 5 | 入力ロック表更新、COUNTDOWN対応表、中段ライン固定 ほか |
| C群: エッジケース確定 | 6 | AUTO停止時間、天井カウント条件、設定変更時クリア範囲 ほか |
| D群: TypeScript型定義 | 8 | 全フェーズ・全状態の判別共用体化、tsconfig 設定 |
| §30: 筐体UI・ガワ連携 | 21節 | core/UI分離、画像素材配置、レイアウト、優先順位 |

**機械割確定タイミング**: A1 と A3 の確定により、設定別の役構成が完全に固定された。この時点で 100万G シミュレーションが実行可能。

---

## A群: 数値・論理の確定事項

### A1. 中段CHERRY演出 (ボーナス中) — **削除確定**

**v7.2 §11-3, §18-2 を削除**。仕様を実装に合わせる方針 (旧提案書 案B 採用)。

#### 改訂内容

1. §11-5 マトリクスから「ボーナス中=1G連経由で約1/3300」の行を削除
2. §18-2「1G連当選時の中段CHERRY演出 (約3.3%)」の項目を削除
3. §27-3 を以下に書き換え:

> 中段CHERRYは **通常時およびRUSH継続抽選フェーズ** で出現する。出現すれば常に最強の恩恵 (通常時=BIG+RUSH直行確定、継続抽選=継続確定) を意味する。

4. ボーナス中の1G連抽選は **演出パターンを区別せず**、`emit('oneGRen')` のみ発火 (v7.2 #10 の現行実装をそのまま維持)

#### 機械割への影響

ボーナス中 1G連発生率自体は §11-5 通り (BIG=1/110, REG=1/220)。演出パターン分岐の削除であり、確率分布には影響しない。

---

### A2. 復活ペカの名前衝突 — **分離確定**

| 旧名 | 新名 | 場面 | 内部変数 |
|---|---|---|---|
| 復活ペカ (§21) | **遅延復活ペカ** / `LATE_REVIVAL` | 通常時告知パターン (2%) | `gs.notifyPattern` |
| 復活 (§14-4) | **COUNTDOWN復活** / `COUNTDOWN_REVIVAL` | NEON COUNTDOWN内 (15%) | `gs.countdownRevivalScheduled` |

#### LATE_REVIVAL の動作仕様 (v7.2 #13 の「実質SILENT化」問題を解消)

```
第3停止直後:
  - JACK LAMP は点灯させない (SILENT と同じ無音処理)
  - "BONUS確定" 表示も出さない
  - 払い出し処理のみ実行
  ↓
次ゲーム冒頭 WAIT_BET 直前:
  - JACK LAMP を遅延点灯 (3秒の最低表示時間を確保)
  - _enterBonusNotice() を発火
  - BONUS_NOTICE フェーズへ遷移
```

実装上は `gs.deferredBonusNotice: boolean` を追加し、次ゲーム冒頭でこのフラグをチェックする。

---

### A3. BIG分配の再設計 — **設定別固定方式**

中段CHERRY+BIG を **設定別に個別固定** とし、残りを単独BIG/CHERRY+BIGで按分する (旧提案書 案A 採用)。

#### 確定値

| 設定 | 全BIG確率 | 中段CHERRY+BIG (固定) | 残り (単独BIG + 角CHERRY+BIG) |
|---:|---:|---:|---:|
| 1 | 1/218.0 | **1/8192** | 1/224 (95.85%) |
| 4 | 1/210.0 | **1/7281** | 1/216 (96.55%) |
| 5 | 1/205.0 | **1/6553** | 1/211 (96.87%) |
| 6 | 1/195.0 | **1/5957** | 1/202 (96.72%) |

#### 残り部分の内訳

単独BIG : 角CHERRY+BIG = **75 : 22** の比率で按分 (合計97を分母として再正規化)。

| 設定 | 単独BIG | 角CHERRY+BIG |
|---:|---:|---:|
| 1 | (224 × 97/75)^-1 ≒ **1/289.8** | (224 × 97/22)^-1 ≒ **1/987.6** |
| 4 | ≒ 1/279.4 | ≒ 1/952.4 |
| 5 | ≒ 1/272.9 | ≒ 1/930.1 |
| 6 | ≒ 1/261.3 | ≒ 1/890.4 |

#### PREMIUM_BIG の扱い

PREMIUM_BIG は全BIGに対して **約1%** (設定共通) を、上記「単独BIG」枠の内側からさらに抽選で取り分ける。実装上は:

```typescript
// lottery.ts
if (selectedFlag === FLAG.NORMAL_BIG && Math.random() < 0.01) {
  selectedFlag = FLAG.PREMIUM_BIG;
}
```

#### CEILING_BIG の扱い

天井 (500G到達) で発生する BIG は別経路 (NORMAL_BIG とは別フラグ `CEILING_BIG`)。上記の確率テーブルには含まれない。

---

### A4. RUSH中ボーナス消化中の液晶表示 — **優先度確定**

#### 表示優先度 (高 → 低)

1. ボーナス消化中表示 (メイン領域: 種別 + 獲得枚数)
2. RUSHセット表示 (ヘッダー領域: "RUSH N SET")
3. NEON COUNTDOWN表示 (メイン領域: 数字)
4. RUSH継続抽選表示 (メイン領域: 期待度演出)
5. 通常時表示 (メイン領域: 帽子アイコン)

#### 改訂後の §3-2 表

| 状態 | メイン表示 | サブ表示 (ヘッダー) |
|---|---|---|
| 通常時 | 帽子アイコン | - |
| BONUS_NOTICE | "BONUS" 確定表示 | - |
| ボーナス消化中 (発生元問わず) | 種別 + 獲得枚数 | RUSH中なら "RUSH N SET" |
| NEON COUNTDOWN | カウントダウン数字 | - |
| RUSH継続抽選 | 期待度演出 | "RUSH N SET" |
| RUSH中 (セット待機) | 帽子アイコン or 演出 | "RUSH N SET" |
| RUSH_END | "END" / 通常復帰演出 | - |

実装上は `LCDMode` (D4 参照) と `lcdSubText` の2系統で管理する。

---

## B群: 文書整合の確定事項

### B1. §28-13-2 入力ロック表 — **v7.3 統合版**

| 状態 | 入力受付 | 備考 |
|---|---|---|
| WAIT_BET | MAXBET / 画面クリック / AUTO | 変更なし |
| WAIT_LEVER | LEVER / 画面クリック / AUTO | 変更なし |
| WAIT_STOP_LEFT | LEFT / 画面クリック / AUTO | 変更なし |
| WAIT_STOP_CENTER | CENTER / 画面クリック / AUTO | 変更なし |
| WAIT_STOP_RIGHT | RIGHT / 画面クリック / AUTO | 変更なし |
| ~~PAYOUT~~ | ~~すべて無効~~ | **B5 で削除。`isProcessing` で代用** |
| BONUS_NOTICE | すべて無効 | 3秒間の最低表示時間 |
| BONUS_ENTRY (bonusManualMode=OFF) | 画面クリック / AUTO のみ | リール停止演出を順次自動進行 |
| **BONUS_ENTRY (bonusManualMode=ON)** | **LEFT → CENTER → RIGHT 個別 / 画面クリック** | **AUTO中は ON でも自動進行** |
| BONUS_GAME (WAIT_BET〜STOP_R 流用) | 通常スピンと同じ。`bonusCtx` で判別 | v7.2 #6 |
| COUNTDOWN_WAIT_BET 〜 COUNTDOWN_STOP_R | 各サブフェーズ対応ボタン / 画面クリック / AUTO | v7.2 #2 |
| RUSH_JUDGE_WAIT_BET 〜 RUSH_JUDGE_STOP_R | 同上 | v7.2 #2 |
| **RUSH_END** | **すべて無効。3秒後に自動で通常時 WAIT_BET へ遷移** | **v7.2 #1 新規** |
| ~~RUSH_RESULT~~ | ~~画面クリックまたはAUTO~~ | **削除。`rushFail`/`rushContinue` イベントで代用** |

#### 共通条件

- `isProcessing === true` の間は、上記表の規定に関わらず **全入力を無効化**
- AUTO中は表中の "AUTO" 列が有効なフェーズで自動進行
- BONUS_NOTICE と RUSH_END は AUTO中も最低表示時間を確保 (AUTOの一時停止)

---

### B2. RUSH継続抽選フェーズの中段CHERRY出現タイミング — **確定**

中段CHERRYは **内部継続フラグON時のみ、6G目の `RUSH_JUDGE_STOP_L` で表示** する。

#### 仕様文 (§19-4, §19-5 への追記)

> RUSH継続抽選の6G中、内部継続フラグ (`gs.rushInternalContinueFlag === true`) がONの場合に限り、6G目の左リール第1停止で中段CHERRYを停止させる。これにより:
>
> 1. 1〜5G目の演出は「期待度示唆」のままバリエーションを維持
> 2. 6G目 LEVER は通常の告知タイミング枠として温存
> 3. 6G目 STOP_L で「中段CHERRY=継続確定」のジャグラー伝統演出を成立させる
>
> 内部継続フラグOFF時は通常の小役 (またはハズレ) を停止させる。

#### 実装

```typescript
// reels.ts (RUSH_JUDGE 6G目 STOP_L 時)
if (gs.phase.kind === 'RUSH_JUDGE' 
    && gs.phase.gameIndex === 6 
    && gs.phase.sub === 'STOP_L'
    && gs.rushInternalContinueFlag) {
  return getCenterCherryStopPositionLeft();
}
```

---

### B3. NEON COUNTDOWN の告知タイミング対応表 — **3G構造で確定**

NEON COUNTDOWN は **3G** で完結する。各ゲームは BET → LEVER → L → C → R の5サブフェーズ。合計15サブフェーズ。

#### サブフェーズ ↔ 表示カウント 対応表

| サブフェーズ | 表示カウント | 告知発火点 |
|---|---|---|
| 1G目 COUNTDOWN_WAIT_BET | 8 | 表示開始 |
| 1G目 COUNTDOWN_WAIT_LEVER | 8 (維持) | - |
| 1G目 COUNTDOWN_STOP_L | 7 | 告知振り分け点 |
| 1G目 COUNTDOWN_STOP_C | 6 | 告知振り分け点 |
| 1G目 COUNTDOWN_STOP_R | 5 | 告知振り分け点 |
| 2G目 COUNTDOWN_WAIT_BET | 5 (維持) | - |
| 2G目 COUNTDOWN_WAIT_LEVER | 4 | 告知振り分け点 |
| 2G目 COUNTDOWN_STOP_L | 3 | 告知振り分け点 |
| 2G目 COUNTDOWN_STOP_C | 2 | 告知振り分け点 |
| 2G目 COUNTDOWN_STOP_R | 1 | 告知振り分け点 |
| 3G目 COUNTDOWN_WAIT_BET | 1 (維持) | - |
| 3G目 COUNTDOWN_WAIT_LEVER | ラスト演出 | 告知振り分け点 (ラスト枠) |
| 3G目 COUNTDOWN_STOP_L | "?" 表示 | - |
| 3G目 COUNTDOWN_STOP_C | "?" 表示 | - |
| 3G目 COUNTDOWN_STOP_R | 結果確定 | **失敗 or COUNTDOWN復活 (15%)** |

#### 告知振り分け確率の総計 (v7.2 §14-4 維持)

| タイミング | 確率 | 内部処理 |
|---|---:|---|
| カウント8 (1G目 BET) | 2% | RUSH突入確定演出 |
| カウント7 (1G目 STOP_L) | 4% | 同上 |
| カウント6 (1G目 STOP_C) | 5% | 同上 |
| カウント5 (1G目 STOP_R) | 7% | 同上 |
| カウント4 (2G目 LEVER) | 3% | 同上 |
| カウント3 (2G目 STOP_L) | 10% | 同上 |
| カウント2 (2G目 STOP_C) | 13% | 同上 |
| カウント1 (2G目 STOP_R) | 18% | 同上 |
| ラスト (3G目 LEVER) | 23% | 同上 |
| 復活 (3G目 STOP_R 後) | 15% | COUNTDOWN_REVIVAL 発火 |
| **失敗合計** | **-** | 残り = 100% - 上記合計 |

合計 = 2+4+5+7+3+10+13+18+23+15 = **100%** → RUSH突入確率は告知タイミングによらず常に100%。**つまりCOUNTDOWN自体は突入確定演出**であり、「失敗」と思わせる演出フェイクから復活で救う構造。

#### 重要

「COUNTDOWN中=RUSH突入確定」を前提とすると、§14 全体は「**突入はするが、いつ告知されるか分からない**」演出枠となる。これは v7.2 §14 の「COUNTDOWN成功でRUSH突入」と整合 (成功率100%設計)。

→ **要 Kai 確認**: §14 のCOUNTDOWN成功率は 100% 想定か、それとも復活含めて100%未満か。後者なら「失敗」枠を残し、機械割計算に反映が必要。本仕様書は **100%突入** で確定する。

---

### B4. ボーナス入賞ゲームのライン選択 — **中段固定**

v7.2 #25 で `getEntryStopPositions` が `pickRandom(PAYLINES)` を呼んでいるが、**ボーナス入賞ゲームでは中段ライン固定** に変更する。

#### 改訂内容

```typescript
// reels.ts (旧)
const line = pickRandom(PAYLINES);
const positions = computeFor(line, BIG_SYMBOLS);

// reels.ts (新)
const positions = computeFor(PAYLINES.CENTER, BIG_SYMBOLS);
```

#### 適用範囲

- ボーナス入賞ゲーム (BONUS_ENTRY フェーズ): 中段固定
- ボーナス消化中の小役揃い: ランダムライン継続 (演出バリエーション維持)
- 通常時の小役揃い: ランダムライン継続

---

### B5. PAYOUT フェーズの仕様書からの削除

§28-12 状態テーブルと §28-13-2 入力ロック表から **PAYOUT 行を削除**。以下を追記:

> v7.2 までは PAYOUT を独立フェーズとして定義していたが、v7.3 では実装に合わせて `isProcessing` フラグによる入力ロック方式に統合した。状態遷移図上は:
>
> ```
> WAIT_STOP_RIGHT (停止) → (払い出し処理: isProcessing=true 中) → 次状態
> ```
>
> として扱う。払い出し中の入力は全て破棄される。

---

## C群: エッジケース確定値

### C1. PREMIUM_BIG時の演出スタッキング — **確定**

#### 演出シーケンス (全部で約 6.2秒)

```
中段CHERRY停止          : 0ms
↓
払い出し処理 (2枚)      : 500ms (isProcessing=true)
↓
JACK LAMP点灯 (レインボー): 1500ms 表示 (最低)
↓
BONUS_NOTICE 表示       : 2200ms (PREMIUM_BIG専用カットイン)
↓
BONUS_ENTRY              : 中段ライン固定で7・7・7自動停止
↓
ボーナス消化開始
```

#### 確定値

- **AUTO suspend 総時間**: 6200ms (PREMIUM_BIG専用)
- **LAMPレインボーは他のpremier演出と排他**: 中段CHERRY停止と同時発火、他演出と重畳しない
- **§28-7 の最低3秒ルール**: PREMIUM_BIG にも適用される。上記 1500ms + 2200ms = 3700ms で達成済み

---

### C2. REPLAY とボーナス当選の同時引き — **排他確定**

#### 仕様

§12 のフラグリストにおいて、REPLAY + BIG/REG の **複合フラグは存在しない**。内部抽選は単一のフラグを返す:

```typescript
function lottery(): Flag {
  // 1回の抽選で1フラグのみ返す。複合不可。
  return chooseOne([...flagPool]);
}
```

§12 末尾に以下を追記:

> REPLAY、BIG (全種別)、REG (全種別) は内部抽選において **排他** である。同一ゲーム内で REPLAY と BIG/REG が同時に成立することはない。

#### デバッグ時の挙動 (テストケース)

- デバッグで `debugForcedFlag = NORMAL_BIG` 設定 → 通常の抽選を上書きして NORMAL_BIG 確定。REPLAY フラグは発生しない。
- REPLAY 成立中にデバッグで BIG 強制 → 次ゲームの抽選で BIG 強制 (REPLAY の自動BETは消費されてから判定)。問題なし。

---

### C3. 天井カウンタの加算条件 — **確定**

| タイミング | カウントする? | 加算位置 |
|---|---|---|
| 通常時 WAIT_BET → STOP_R 完走 | YES | STOP_R の払い出し処理完了直後 |
| 通常時 REPLAY後の自動再BET → STOP_R 完走 | YES (1G として) | 同上 |
| ボーナス入賞ゲーム消化 | NO | - |
| ボーナス消化中 (`bonusCtx !== null`) | NO | - |
| NEON COUNTDOWN サブフェーズ | NO | - |
| RUSH継続抽選フェーズ | NO | - |
| RUSH_END | NO | - |

#### 実装ガード

```typescript
function incrementNormalGameCount(gs: GameState): void {
  if (gs.phase.kind !== 'SPIN') return;
  if (gs.bonusContext !== null) return;
  if (gs.rushActive) return;
  gs.normalGameCount += 1;
  if (gs.normalGameCount >= 500) {
    gs.debugForcedFlag = FLAG.CEILING_BIG;
  }
}
```

呼び出し位置は **`_completePayout()` 内、状態遷移直前** とする。REPLAY時の自動再BETは新規ゲーム扱いなので、上記関数が次サイクルで再度呼ばれて自然に1G加算される (二重カウントなし)。

---

### C4. デバッグフラグのライフサイクル — **確定**

| 項目 | 仕様 |
|---|---|
| 永続化 | しない (sessionStorage / localStorage 不使用)。リロードで全て null にリセット |
| 消費 | 一度使用したら null に戻る (1回消費型) |
| AUTO中のデバッグ操作 | **次ゲームから反映**。実行中のゲーム抽選には介入しない |
| `debugForcedRushResult` | **次回の継続抽選1回分のみ有効**。RUSH中の連続継続中に複数回設定する場合は、その都度上書き |
| 設定変更時 | 全デバッグフラグを null にリセット (C5 参照) |

#### 実装

```typescript
// lottery.ts
function selectFlag(gs: GameState): Flag {
  if (gs.debugForcedFlag !== null) {
    const f = gs.debugForcedFlag;
    gs.debugForcedFlag = null;  // 消費
    return f;
  }
  return normalLottery(gs.settingLevel);
}
```

---

### C5. 設定変更時の状態クリア範囲 — **確定**

#### 確定済み (v7.2 #12)

- RUSH強制終了 (`rushActive = false`, `rushSetIndex = 0`)
- 天井カウンタリセット (`normalGameCount = 0`)
- 通常時 WAIT_BET へ遷移
- `autoMode = false`

#### v7.3 で追加確定

| 項目 | 処理 |
|---|---|
| `bonusContext` | **null に戻す** |
| COUNTDOWN/RUSH_JUDGE サブフェーズ中 | **破棄して通常時 WAIT_BET に巻き戻し** |
| `debugForcedFlag` / `debugForcedRushResult` | **両方 null にクリア** |
| `bonusManualMode` | **OFF にリセット** (UI状態としても初期化) |
| `notifyPattern` / `countdownRevivalScheduled` / `deferredBonusNotice` | **全て null / false にクリア** |
| 進行中のリール回転 | **即時停止し、初期位置 (0,0,0) に戻す** |
| `isProcessing` | **false に強制リセット** |
| 所持コイン | **維持** (v7.2 §29-5 通り) |

#### 実装ガイド

設定変更は専用の `resetForSettingChange()` 関数に集約し、上記項目を一括処理する。

---

### C6. AUTO停止時間 — **確定**

| タイミング | v7.2値 | v7.3確定値 | 備考 |
|---|---:|---:|---|
| JACK LAMP点灯 | 最低3秒 | **3000ms** | SILENT 含む |
| LATE_REVIVAL 用 LAMP点灯 | 最低3秒 | **3000ms** | 次ゲーム冒頭での遅延点灯 |
| BIG/REG開始 (BONUS_NOTICE) | 最低3秒 | **3200ms** | bonusNotice 経由 |
| PREMIUM_BIG 演出スタッキング | - | **6200ms** | C1 参照 |
| RUSH突入 | 最低5秒 | **4000ms** | プレイヤー体感優先、仕様改訂 |
| RUSH終了 (RUSH_END) | 最低3秒 | **3000ms** | 自動で WAIT_BET へ |
| RUSH継続確定演出 | - | **2200ms** | 6G目 STOP_L の中段CHERRY後 |
| COUNTDOWN復活 演出 | - | **2500ms** | 3G目 STOP_R 後の遅延発火 |

#### AUTO一時停止の実装

```typescript
function suspendAuto(ms: number): Promise<void> {
  if (!gs.autoMode) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

各演出開始時に `await suspendAuto(...)` を挿入する。手動操作中は不要 (プレイヤーが自分のペースで進行)。

---

## D群: TypeScript型定義 — **確定版**

### D1. 基本ドメイン型

```typescript
// src/types/domain.ts

/** 図柄 */
export const SYMBOL = {
  SEVEN: 'SEVEN',
  BAR: 'BAR',
  JACK: 'JACK',
  BLUE_GEM: 'BLUE_GEM',
  BELL: 'BELL',
  CHERRY: 'CHERRY',
  REPLAY: 'REPLAY',
} as const;
export type GameSymbol = typeof SYMBOL[keyof typeof SYMBOL];

/** 内部抽選フラグ */
export const FLAG = {
  LOSS: 'LOSS',
  REPLAY: 'REPLAY',
  BLUE_GEM: 'BLUE_GEM',
  BELL: 'BELL',
  JACK: 'JACK',
  ANGLE_CHERRY: 'ANGLE_CHERRY',
  CENTER_CHERRY: 'CENTER_CHERRY',
  NORMAL_BIG: 'NORMAL_BIG',
  NORMAL_REG: 'NORMAL_REG',
  CHERRY_BIG: 'CHERRY_BIG',
  CHERRY_REG: 'CHERRY_REG',
  PREMIUM_BIG: 'PREMIUM_BIG',
  CEILING_BIG: 'CEILING_BIG',
} as const;
export type Flag = typeof FLAG[keyof typeof FLAG];

/** 入賞役 (画面表示用) */
export type Role =
  | 'BIG' | 'REG' | 'BELL' | 'JACK' | 'BLUE_GEM' | 'REPLAY'
  | 'CENTER_CHERRY' | 'ANGLE_CHERRY';

/** リール位置 (0-20, branded type) */
export type ReelIndex = number & { readonly __brand: 'ReelIndex' };
export type ReelPositions = readonly [ReelIndex, ReelIndex, ReelIndex];

/** ペイライン */
export type PaylineRow = 'top' | 'center' | 'bottom';
export type Payline = readonly [PaylineRow, PaylineRow, PaylineRow];

export const PAYLINES = {
  TOP:    ['top',    'top',    'top']    as const,
  CENTER: ['center', 'center', 'center'] as const,
  BOTTOM: ['bottom', 'bottom', 'bottom'] as const,
  ASC:    ['bottom', 'center', 'top']    as const,
  DESC:   ['top',    'center', 'bottom'] as const,
} satisfies Record<string, Payline>;
export type PaylineKey = keyof typeof PAYLINES;
```

**注**: 型名 `Symbol` は組み込み型と衝突するため `GameSymbol` にリネーム。

---

### D2. フェーズ判別共用体

```typescript
// src/types/phase.ts

/** 通常スピン共通サブフェーズ */
export type SpinSubPhase =
  | 'WAIT_BET'
  | 'WAIT_LEVER'
  | 'STOP_L'
  | 'STOP_C'
  | 'STOP_R';

/** 全フェーズ */
export type Phase =
  | { kind: 'SPIN'; sub: SpinSubPhase }
  | { kind: 'BONUS_NOTICE' }
  | { kind: 'BONUS_ENTRY'; sub: SpinSubPhase }
  | { kind: 'COUNTDOWN'; gameIndex: 1 | 2 | 3; sub: SpinSubPhase }
  | { kind: 'RUSH_JUDGE'; gameIndex: 1 | 2 | 3 | 4 | 5 | 6; sub: SpinSubPhase }
  | { kind: 'RUSH_END' };

export type InputKind = 'BET' | 'LEVER' | 'L' | 'C' | 'R';

/** 入力受付判定 (網羅性チェック付き) */
export function isInputAcceptable(
  phase: Phase,
  input: InputKind,
  isProcessing: boolean,
  bonusManualMode: boolean,
): boolean {
  if (isProcessing) return false;
  switch (phase.kind) {
    case 'BONUS_NOTICE':
    case 'RUSH_END':
      return false;
    case 'SPIN':
    case 'COUNTDOWN':
    case 'RUSH_JUDGE':
      return matchesSubPhase(phase.sub, input);
    case 'BONUS_ENTRY':
      return bonusManualMode ? matchesSubPhase(phase.sub, input) : false;
    default: {
      const _exhaustive: never = phase;
      throw new Error(`Unhandled phase: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function matchesSubPhase(sub: SpinSubPhase, input: InputKind): boolean {
  switch (sub) {
    case 'WAIT_BET':    return input === 'BET';
    case 'WAIT_LEVER':  return input === 'LEVER';
    case 'STOP_L':      return input === 'L';
    case 'STOP_C':      return input === 'C';
    case 'STOP_R':      return input === 'R';
  }
}
```

---

### D3. ボーナスコンテキスト (判別共用体)

```typescript
// src/types/bonus.ts

export type BonusContext =
  | null
  | { kind: 'NORMAL_BIG';   remainingPayout: number }
  | { kind: 'NORMAL_REG';   remainingPayout: number }
  | { kind: 'CEILING_BIG';  remainingPayout: number }
  | { kind: 'PREMIUM_BIG';  remainingPayout: number }
  | { kind: 'RUSH_BIG';     remainingPayout: number; setIndex: number }
  | { kind: 'RUSH_REG';     remainingPayout: number; setIndex: number };

export type AfterBonus =
  | { to: 'COUNTDOWN' }
  | { to: 'RUSH_DIRECT' }
  | { to: 'NORMAL' }
  | { to: 'RUSH_NEXT_SET_OR_JUDGE' };

export function nextStateAfterBonus(ctx: NonNullable<BonusContext>): AfterBonus {
  switch (ctx.kind) {
    case 'NORMAL_BIG':
    case 'CEILING_BIG':
      return { to: 'COUNTDOWN' };
    case 'PREMIUM_BIG':
      return { to: 'RUSH_DIRECT' };
    case 'NORMAL_REG':
      return { to: 'NORMAL' };
    case 'RUSH_BIG':
    case 'RUSH_REG':
      return { to: 'RUSH_NEXT_SET_OR_JUDGE' };
    default: {
      const _exhaustive: never = ctx;
      throw new Error(`Unhandled bonus context: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

---

### D4. 告知パターンと液晶モード

```typescript
// src/types/notify.ts

export type NotifyPattern =
  | 'GACO'           // 後ペカ ガコッ音あり 37.5%
  | 'SILENT'         // 後ペカ 無音 37.5%
  | 'PRE_LEVER'      // 先ペカ レバーON時 15%
  | 'PRE_SPIN'       // 先ペカ リール始動時 5%
  | 'DELAY'          // 遅れペカ 3%
  | 'LATE_REVIVAL';  // 遅延復活ペカ 2% (旧 REVIVAL から改名 A2)

export type PremierEffect =
  | 'LAMP_RAINBOW'
  | 'STRONG_GACO'
  | 'FULL_SILENT'
  | 'SLOW_LIGHT'
  | 'LAMP_DELAY';

/** 液晶モード */
export type LCDMode =
  | 'normal'
  | 'bonus_notice'   // BONUS確定表示
  | 'bonus_game'     // ボーナス消化中
  | 'countdown'
  | 'countdown_revival'
  | 'rush_judge'
  | 'rush_set'
  | 'rush_end';

/** JACKランプ */
export type JackLampState = 'off' | 'on' | 'blink' | 'rainbow';

/** サイドランプ */
export type SideLampState = 'off' | 'on' | 'bonus' | 'rush';
```

---

### D5. ライン評価結果

```typescript
// src/types/lines.ts
import type { PaylineKey } from './domain';

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
```

---

### D6. 型付きイベントエミッタ

```typescript
// src/types/events.ts
import type { BonusContext } from './bonus';
import type { LineHit } from './lines';

export type CountdownTiming =
  | 'COUNT_8' | 'COUNT_7' | 'COUNT_6' | 'COUNT_5' | 'COUNT_4'
  | 'COUNT_3' | 'COUNT_2' | 'COUNT_1' | 'LAST' | 'COUNTDOWN_REVIVAL';

export interface GameEventMap {
  lineHit:         { hits: LineHit[]; cherry: 'CENTER' | 'ANGLE' | null };
  bonusStart:      { context: NonNullable<BonusContext> };
  bonusEnd:        { context: NonNullable<BonusContext>; totalPayout: number };
  oneGRen:         { nextBonusFlag: Flag };
  rushStart:       { initialSet: number };
  rushContinue:    { nextSet: number };
  rushFail:        { totalSets: number; totalPayout: number };
  rushEnd:         void;
  lampOn:          { color: 'blue' | 'rainbow'; blinking: boolean };
  lampOff:         void;
  countdownPeka:   { timing: CountdownTiming };
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
```

---

### D7. GameState 全体定義

```typescript
// src/types/state.ts
import type { Flag } from './domain';
import type { Phase } from './phase';
import type { BonusContext } from './bonus';
import type { NotifyPattern, JackLampState, SideLampState } from './notify';
import type { ReelPositions } from './domain';

export interface GameState {
  // 設定
  settingLevel: 1 | 4 | 5 | 6;

  // コイン
  coins: number;

  // 抽選
  pendingFlag: Flag | null;
  notifyPattern: NotifyPattern | null;
  countdownRevivalScheduled: boolean;
  deferredBonusNotice: boolean;       // A2 で追加: LATE_REVIVAL 用

  // フェーズ
  phase: Phase;
  isProcessing: boolean;

  // 通常時カウンタ
  normalGameCount: number;            // 天井 (RUSH中は加算しない、C3 参照)

  // ボーナス
  bonusContext: BonusContext;

  // RUSH
  rushActive: boolean;
  rushSetIndex: number;               // 1始まり
  rushTotalPayout: number;
  rushInternalContinueFlag: boolean;  // 6G目 STOP_L で中段CHERRY 出現条件 (B2)

  // 操作モード
  autoMode: boolean;
  bonusManualMode: boolean;

  // リール
  reelPos: ReelPositions;
  reelSpinning: readonly [boolean, boolean, boolean];

  // UI連動状態 (§30)
  maxBetPressed: boolean;
  leverDown: boolean;
  pushPressed: boolean;
  pressedStops: readonly [boolean, boolean, boolean];
  jackLampState: JackLampState;
  sideLampState: SideLampState;

  // デバッグ (1回消費型、リロードでクリア)
  debugForcedFlag: Flag | null;
  debugForcedRushResult: 'SUCCESS' | 'FAIL' | null;
}
```

---

### D8. 移行ステップとビルド設定

#### 移行ステップ

```
Step 1: src/types/ 配下に D1〜D7 の型定義ファイルを配置
        tsconfig.json を作成
        既存JSコードに JSDoc @type で型を当て、コンパイル確認

Step 2: 純粋ロジック層 (lottery.js, reels.js, paylines.js) を .ts へ
        ユニットテストで型ガードを検証

Step 3: 状態管理層 (gameState.ts, stateMachine.ts) を .ts へ
        判別共用体の網羅性チェック (switch + never) でバグ発見

Step 4: UI層 (DOM操作, event handlers) を .ts へ
        addEventListener の型 (HTMLButtonElement 等) を明示
        §30 の Components を React 化 (任意)

Step 5: デバッグパネル + AUTO制御を .ts へ
```

#### tsconfig.json 推奨設定

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**`noUncheckedIndexedAccess`** は `gs.reelPos[0]` が `ReelIndex | undefined` になるため、リール配列アクセス忘れを検出しやすい。

---

## §30. 筐体UI・ガワ連携仕様

### 30-1. 基本方針

NEON JACK では内部ゲームロジックと筐体UI表示を **分離** する。

- **core層** (`src/core/`): 抽選、状態遷移、リール停止位置、払い出し、ボーナス、RUSH、カウンター管理のみを担当。画像ファイル名・DOM要素・CSS に **直接依存しない**
- **UI層** (`src/components/`): core層が出力する GameState / UIState を参照し、筐体表示を切り替える

初期実装では、豪華な発光やアニメーションよりも、内部状態と筐体パーツの **連携** を優先する。

---

### 30-2. 層構造とディレクトリ

```
src/
├── core/                       # ゲームロジック (画像依存なし)
│   ├── lottery.ts
│   ├── reels.ts
│   ├── paylines.ts
│   ├── stateMachine.ts
│   ├── payout.ts
│   ├── bonus.ts
│   └── rush.ts
├── types/                      # D群 型定義
│   ├── domain.ts
│   ├── phase.ts
│   ├── bonus.ts
│   ├── notify.ts
│   ├── lines.ts
│   ├── events.ts
│   └── state.ts
├── ui/                         # UI派生関数
│   ├── deriveUIState.ts
│   └── layout.ts
└── components/                 # UI コンポーネント
    ├── SlotMachine.tsx
    ├── Cabinet.tsx
    ├── ReelWindow.tsx
    ├── Controls.tsx
    ├── Lamps.tsx
    ├── Counters.tsx
    └── LCD.tsx
```

---

### 30-3. 画像素材の配置

```
public/assets/slot/
├── cabinet/
│   ├── base.png
│   ├── reel_frame.png
│   ├── upper_panel.png
│   └── lower_panel.png
├── reels/
│   ├── reel_left.png            # 21コマ縦長strip
│   ├── reel_center.png
│   └── reel_right.png
├── symbols/                     # 単体図柄 (デバッグ・カットイン用)
│   ├── seven.png  bar.png  jack.png
│   ├── blue_gem.png  cherry.png  bell.png  replay.png
├── buttons/
│   ├── maxbet_normal.png  maxbet_pressed.png
│   ├── stop_normal.png    stop_pressed.png
│   └── push_normal.png    push_pressed.png
├── lever/
│   ├── lever_normal.png  lever_down.png
├── lamps/
│   ├── jack_lamp_off.png  jack_lamp_on.png
│   ├── jack_lamp_blink.png  jack_lamp_rainbow.png
│   ├── side_lamp_off.png  side_lamp_on.png
│   └── side_lamp_bonus.png  side_lamp_rush.png
└── lcd/
    ├── lcd_default.png  lcd_bonus.png
    ├── lcd_rush.png     lcd_countdown.png
```

初期実装では、未準備の素材は **CSS 表現または仮画像** で代用してよい。

---

### 30-4. 筐体レイアウト方式

筐体UIは **背景画像 + 個別パーツの重ね合わせ** で構成する。

```tsx
<div className="slot-machine">
  <img className="cabinet-base" src="/assets/slot/cabinet/base.png" />

  <div className="lcd-area">
    <LCD />
  </div>

  <div className="reel-area">
    <ReelWindow reelIndex={0} />
    <ReelWindow reelIndex={1} />
    <ReelWindow reelIndex={2} />
  </div>

  <Lamps />
  <Counters />
  <Controls />
</div>
```

```css
.slot-machine {
  position: relative;
  width: 720px;
  height: 1280px;
}

.cabinet-base {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.lcd-area, .reel-area, .controls-area,
.lamp-area, .counter-area {
  position: absolute;
}
```

#### レイアウト座標の管理

座標は `src/ui/layout.ts` で一元管理し、CSS変数または `style` プロパティで適用する。

```typescript
// src/ui/layout.ts
export const SLOT_LAYOUT = {
  reelArea:    { left: 150, top: 360, width: 420, height: 240 },
  maxBet:      { left: 105, top: 760, width: 95 },
  lever:       { left: 90,  top: 850, width: 120 },
  stopButtons: { left: [265, 365, 465] as const, top: 820, width: 90 },
  pushButton:  { left: 565, top: 760, width: 95 },
  jackLamp:    { left: 310, top: 100, width: 100 },
  lcd:         { left: 100, top: 180, width: 520, height: 160 },
  counters:    { left: 100, top: 1080, width: 520 },
} as const;
```

初期実装では仮置きでよい。素材確定後に微調整する。

---

### 30-5. リールUI仕様

リールは **21コマの縦長strip画像** として扱う。

```tsx
<div className="reel-window">
  <img className="reel-strip" src="/assets/slot/reels/reel_left.png" />
</div>
```

```css
.reel-window {
  overflow: hidden;
  position: relative;
  width: 140px;
  height: 240px;
}

.reel-strip {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
}
```

#### 停止時の translateY 計算

```typescript
const SYMBOL_HEIGHT = 80; // px (1コマ)
const translateY = -SYMBOL_HEIGHT * stopIndex;
// 中段に stopIndex のコマが来るように offset を加算
```

#### 回転中の表示

`gs.reelSpinning[index] === true` のリールに回転アニメーションを適用。

| 状態 | 説明 |
|---|---|
| `[true, true, true]` | 3リール回転中 |
| `[false, true, true]` | 左停止済み |
| `[false, false, true]` | 左・中停止済み |
| `[false, false, false]` | 全停止 |

---

### 30-6. MAXBETボタン

| 状態 | 表示画像 |
|---|---|
| `maxBetPressed === false` | maxbet_normal.png |
| `maxBetPressed === true`  | maxbet_pressed.png |

押下時は **100〜200ms** だけ pressed 表示。

```
WAIT_BET
  ↓ MAXBET入力
maxBetPressed = true
  ↓ 150ms
maxBetPressed = false
  ↓
WAIT_LEVER へ遷移
```

---

### 30-7. レバー

| 状態 | 表示画像 |
|---|---|
| `leverDown === false` | lever_normal.png |
| `leverDown === true`  | lever_down.png |

押下時のみ down 表示 (約 200ms)。

---

### 30-8. 停止ボタン

`pressedStops: [boolean, boolean, boolean]` (左・中・右)。

| 状態 | 表示 |
|---|---|
| false | stop_normal.png |
| true  | stop_pressed.png |

#### pressed 保持仕様

停止ボタンは **押された順に pressed 状態を保持** し、第3停止後の **払い出し完了まで戻さない**。

```
ゲーム開始時:    [false, false, false]
第1停止後:      [true,  false, false]
第2停止後:      [true,  true,  false]
第3停止後:      [true,  true,  true]
払い出し完了後:  [false, false, false]   ← isProcessing が false に戻った時
```

---

### 30-9. PUSHボタン

`pushPressed: boolean`。初期実装では **演出用ボタン**。通常進行に必須ではない。

将来用途:
- 告知確認
- RUSH演出スキップ
- ボーナス中演出スキップ
- デバッグ演出確認
- 液晶演出スキップ

---

### 30-10. JACKランプ

```typescript
export type JackLampState = 'off' | 'on' | 'blink' | 'rainbow';
```

| 状態 | 表示 | 必須度 |
|---|---|---|
| off | jack_lamp_off.png | 必須 |
| on | jack_lamp_on.png | 必須 |
| blink | on画像 + CSS @keyframes blink | 後続実装 |
| rainbow | jack_lamp_rainbow.png または CSS conic-gradient | 後続実装 |

#### 点灯場面

- ボーナス当選告知 (先ペカ / 後ペカ / 遅れペカ / 遅延復活ペカ)
- PREMIUM_BIG (rainbow)
- COUNTDOWN復活時 (3G目 STOP_R 後)

---

### 30-11. サイドランプ

```typescript
export type SideLampState = 'off' | 'on' | 'bonus' | 'rush';
```

| 状態 | 表示 |
|---|---|
| off  | side_lamp_off.png |
| on   | side_lamp_on.png |
| bonus | side_lamp_bonus.png または CSS pulsation |
| rush | side_lamp_rush.png または CSS rainbow flow |

初期実装では **状態だけ用意して、表示は未実装でよい**。

---

### 30-12. カウンター表示

| 項目 | 参照状態 | 表示位置 |
|---|---|---|
| 所持コイン | `coins` | 下部中央 |
| 現在ゲーム数 | `normalGameCount` | 下部左 |
| 払い出し枚数 | 直近の `payout` | 下部右 |
| ボーナス中獲得枚数 | `bonusContext?.remainingPayout` の逆算 | LCD連動 |
| RUSHセット数 | `rushSetIndex` | LCDヘッダー |
| RUSH総獲得枚数 | `rushTotalPayout` | LCDヘッダー |

```tsx
<div className="counter coin-counter">{gs.coins}</div>
<div className="counter game-counter">{gs.normalGameCount}</div>
<div className="counter payout-counter">{lastPayout}</div>
```

初期実装はテキスト表示 / CSS デジタル風で OK。

---

### 30-13. 液晶表示 (A4で確定した優先度)

| LCDMode | メイン表示 | サブ表示 (ヘッダー) |
|---|---|---|
| normal | 帽子アイコン / "NEON JACK" | - |
| bonus_notice | "BONUS" 確定表示 | - |
| bonus_game | 種別 + 獲得枚数 (例: "BIG BONUS  獲得 84枚") | RUSH中なら "RUSH N SET" |
| countdown | カウントダウン数字 8→1→ラスト | - |
| countdown_revival | "REVIVAL" カットイン | - |
| rush_judge | 期待度演出 | "RUSH N SET" |
| rush_set | 帽子アイコン or 通常演出 | "RUSH N SET" |
| rush_end | "END" / 通常復帰 | - |

初期実装はテキスト表示のみで成立。

---

### 30-14. AUTO中のUI表示

AUTO中も **通常プレイと同じUI状態遷移を通す**:

```
MAXBET 押下表示 → レバー down → リール回転
  → 左停止ボタン押下表示 → 左リール停止
  → 中停止ボタン押下表示 → 中リール停止
  → 右停止ボタン押下表示 → 右リール停止
  → 払い出し
```

各操作間は短縮可だが、以下の演出中は **AUTOを一時停止**:
- JACK LAMP点灯 (3000ms)
- BONUS_NOTICE (3200ms)
- BONUS_ENTRY (中段ライン7・7・7停止演出)
- RUSH突入 (4000ms)
- RUSH_END (3000ms)
- PREMIUM_BIG (6200ms)
- COUNTDOWN復活 (2500ms)

---

### 30-15. 入力受付とクリック範囲

| UIパーツ | 入力種別 |
|---|---|
| MAXBETボタン | BET |
| レバー | LEVER |
| 左停止ボタン | STOP_LEFT |
| 中停止ボタン | STOP_CENTER |
| 右停止ボタン | STOP_RIGHT |
| PUSHボタン | PUSH |
| 画面全体クリック | 現在フェーズに応じた次操作 (簡易プレイ用) |

#### 画面全体クリックの解釈

| 現在フェーズ | クリック動作 |
|---|---|
| WAIT_BET | BET |
| WAIT_LEVER | LEVER |
| STOP_L | STOP_LEFT |
| STOP_C | STOP_CENTER |
| STOP_R | STOP_RIGHT |
| その他 | 無視 |

個別ボタンを押した場合は対応する入力のみを処理。フェーズに合わない入力は無視。

---

### 30-16. UIState 型定義

GameState から UIState を派生させる。

```typescript
// src/ui/UIState.ts
import type { JackLampState, SideLampState, LCDMode } from '@/types/notify';

export interface UIState {
  // ボタン状態
  maxBetPressed: boolean;
  leverDown: boolean;
  pushPressed: boolean;
  pressedStops: readonly [boolean, boolean, boolean];

  // リール
  reelSpinning: readonly [boolean, boolean, boolean];
  reelPositions: readonly [number, number, number];

  // ランプ
  jackLampState: JackLampState;
  sideLampState: SideLampState;

  // 液晶
  lcdMode: LCDMode;
  lcdMainText: string;
  lcdSubText?: string;

  // カウンター
  displayCoins: number;
  displayGameCount: number;
  displayPayout: number;
  displayBonusPayout: number;
  displayRushSet: number;
  displayRushTotalPayout: number;
}
```

#### 派生関数

```typescript
// src/ui/deriveUIState.ts
import type { GameState } from '@/types/state';
import type { UIState } from './UIState';

export function deriveUIState(gs: GameState): UIState {
  return {
    maxBetPressed: gs.maxBetPressed,
    leverDown: gs.leverDown,
    pushPressed: gs.pushPressed,
    pressedStops: gs.pressedStops,
    reelSpinning: gs.reelSpinning,
    reelPositions: gs.reelPos as unknown as readonly [number, number, number],
    jackLampState: gs.jackLampState,
    sideLampState: gs.sideLampState,
    lcdMode: deriveLCDMode(gs),
    lcdMainText: deriveLCDMainText(gs),
    lcdSubText: deriveLCDSubText(gs),
    displayCoins: gs.coins,
    displayGameCount: gs.normalGameCount,
    displayPayout: getLastPayout(gs),
    displayBonusPayout: gs.bonusContext?.remainingPayout ?? 0,
    displayRushSet: gs.rushSetIndex,
    displayRushTotalPayout: gs.rushTotalPayout,
  };
}

function deriveLCDMode(gs: GameState): LCDMode {
  // A4 の優先度順
  if (gs.phase.kind === 'BONUS_NOTICE') return 'bonus_notice';
  if (gs.bonusContext !== null) return 'bonus_game';
  if (gs.phase.kind === 'COUNTDOWN') {
    if (gs.countdownRevivalScheduled) return 'countdown_revival';
    return 'countdown';
  }
  if (gs.phase.kind === 'RUSH_JUDGE') return 'rush_judge';
  if (gs.rushActive) return 'rush_set';
  if (gs.phase.kind === 'RUSH_END') return 'rush_end';
  return 'normal';
}
```

---

### 30-17. 初期実装で必須のUI連携 (Priority 1+2)

- [ ] 筐体背景画像の表示
- [ ] リール3本の表示
- [ ] リール回転・停止アニメーション
- [ ] MAXBET ボタンの押下表示切替
- [ ] レバー down 表示切替
- [ ] 停止ボタンの押下順 pressed 保持 (払い出し完了まで)
- [ ] JACKランプ off/on 切替
- [ ] コイン数表示
- [ ] ゲーム数表示
- [ ] 払い出し枚数表示
- [ ] BONUS_NOTICE 表示
- [ ] ボーナス中獲得枚数表示
- [ ] AUTO中も UI 状態遷移を通して進行

---

### 30-18. 後続実装で追加するUI演出 (Priority 3+4)

- JACKランプ blink / rainbow
- サイドランプ発光
- ボーナス中の液晶演出
- RUSH中の液晶演出
- COUNTDOWN 専用カウントダウンアニメ
- RUSH継続抽選の期待度演出
- PREMIUM_BIG 専用演出
- ガコッ音 (Web Audio API、v7.2 #7 で実装済み)
- MAXBET / レバー / 停止ボタンの効果音
- リール停止音
- 払い出し音
- AUTO速度調整UI
- デバッグパネルUI

---

### 30-19. 実装優先順位

```
Priority 1 (まず動くプロトタイプ):
  筐体背景 / リール3本 / MAXBET / レバー / 停止ボタン3つ
  コイン・ゲーム数・払い出し表示

Priority 2 (Webスロットとして成立):
  JACKランプ off/on
  BONUS_NOTICE 表示
  ボーナス中獲得枚数表示
  AUTO中の押下表示

Priority 3 (本機の体験を再現):
  サイドランプ
  液晶切替 (LCDMode 7種)
  RUSH表示・COUNTDOWN表示

Priority 4 (リッチ化):
  blink / rainbow / サウンド / 派手な演出
  ネオン表現
```

---

### 30-20. 実装ルール (Don't list)

- core層に画像やCSS処理を書かない
- UI層は GameState / UIState のみを参照する
- ボタンの押下状態は内部フェーズと連動させる
- 停止ボタンは第3停止後の払い出し完了まで pressed 保持
- リール停止位置は core 側で決定
- UI側は停止位置に合わせて表示するだけ
- AUTO中も通常操作と同じUI遷移を通す
- 光る演出は初期実装では off/on の簡易表現でよい
- 素材差し替えで core ロジックが壊れない構成にする
- 座標調整は CSS変数または `layout.ts` で管理する

---

### 30-21. Claude Code 向け実装指示テンプレ

```
NEON JACK v7.3 仕様書 (docs/neon_jack_v7_3.md) の §30 に従い、
内部ゲームロジックと筐体UIを統合してください。

方針:
- core ロジック (src/core/) は画像/DOMに依存させない
- GameState から UIState を派生 (src/ui/deriveUIState.ts)
- UI側 (src/components/) は UIState を参照して画像表示を切り替える
- 筐体は base.png を背景として absolute 配置
- MAXBET, レバー, 停止ボタン×3, PUSH, JACKランプ, サイドランプ, リール
  を透明PNGパーツとして重ねる
- リールは 21コマ縦長strip を overflow:hidden の窓内で translateY で動かす
- 停止ボタンは押された順に pressed を保持し、第3停止後の払い出し完了まで戻さない
- MAXBET とレバーは一瞬 pressed/down に切り替える (約150ms)
- JACKランプは jackLampState に応じて off/on/blink/rainbow を表示
- AUTO中も同じUI状態遷移を通す
- 初期実装では光る演出は off/on のみでよい (Priority 1+2)

ファイル配置: §30-2 を参照
画像配置: §30-3 を参照
レイアウト座標: src/ui/layout.ts で管理 (§30-4)

まずは Priority 1+2 までを実装し、動くプロトタイプを作ってください。
```

---

## 移行ロードマップ

### 推奨実装順序

| フェーズ | 内容 | 工数目安 | 並行可能 |
|---|---|---:|:---:|
| **1. 仕様確定** | v7.3 を Claude Code に読ませて理解させる | 0.5日 | - |
| **2. シミュレーション** | A1/A3 確定値で 100万G テスト、機械割確認 | 1〜2日 | ✔ (3 と並行可) |
| **3. TS型定義整備** | D1〜D7 を `src/types/` に配置、tsconfig 適用 | 1日 | ✔ |
| **4. core 移行** | lottery / reels / paylines / payout を .ts へ | 2〜3日 | - |
| **5. core 移行 続** | stateMachine / bonus / rush を .ts へ | 2日 | - |
| **6. UIState 派生** | `deriveUIState.ts` 実装 + コンポーネント側で参照 | 1日 | - |
| **7. §30 Priority 1+2** | 背景・リール・操作系・JACKランプ・カウンタ | 3〜5日 | - |
| **8. §30 Priority 3** | サイドランプ・LCD切替・COUNTDOWN/RUSH表示 | 2〜3日 | - |
| **9. §30 Priority 4** | サウンド・派手演出・blink/rainbow | 任意 | - |
| **10. テスト** | E2E (AUTO で1万G 回し続けて状態破綻なし) | 1日 | - |

#### 合計工数目安: 約 2〜3週間 (Priority 1+2 まで)

---

### 最優先の確認事項 (Kai 側で要判断)

| 項目 | 確認内容 | 影響 |
|---|---|---|
| **B3 補足** | COUNTDOWN突入率は 100% (本仕様書の前提) で確定するか? | 機械割 |
| **画像素材** | base.png 等の準備状況。仮素材で進めるか? | 実装着手 |
| **シミュレーション環境** | 100万G テストは Node.js で実行する? それとも別環境? | テスト工数 |
| **設定変更UI** | 現状デバッグパネルのみ。本番UIは別途必要か? | スコープ |

---

## 残課題リスト (v7.4 候補)

v7.3 で確定しなかった項目を v7.4 以降の検討材料として記載。

| ID | 内容 | 優先度 |
|---|---|---|
| F1 | サウンド設計の詳細仕様 (BGM / SE のタイミングとピッチ定義) | 低 |
| F2 | スマホ対応 (タッチイベント、レスポンシブ筐体) | 中 |
| F3 | 設定変更の本番UI (現状デバッグパネルのみ) | 低 |
| F4 | シミュレーション結果の自動集計ツール | 中 |
| F5 | 中段CHERRY+REG (CHERRY_REG) の出現率設計 | 中 |
| F6 | ボーナス入賞ゲームでの中段CHERRY出現有無 | 低 |
| F7 | ペイテーブル表示 (画面内に役一覧を表示するUI) | 低 |

---

## v7.2 → v7.3 差分一覧 (チェンジログ)

### 削除

- §11-3 / §18-2: ボーナス中の中段CHERRY演出 (A1)
- §11-5 マトリクスの「ボーナス中」行 (A1)
- §28-12 PAYOUT 状態 (B5)
- §28-13-2 PAYOUT 入力ロック行 (B5)
- §28-12 RUSH_RESULT 状態 (v7.2 #1 で既に削除済み、明文化)

### 変更

- §27-3: 中段CHERRYの最強感を「通常時・継続抽選フェーズ」に限定 (A1)
- §21: 復活ペカ → 遅延復活ペカ / LATE_REVIVAL (A2)
- §14-4: 復活 → COUNTDOWN復活 / COUNTDOWN_REVIVAL (A2)
- §10-4: BIG分配 → 中段CHERRY設定別固定 + 残り按分 (A3)
- §3-2: 液晶表示優先度の明文化 (A4)
- §13-2 / §28-8: ボーナス入賞ゲーム → 中段ライン固定 (B4)
- §19-4 / §19-5: 6G目 STOP_L で中段CHERRY 出現 (B2)
- §14 全体: COUNTDOWN は3G構造、突入率100% (B3)
- §28-13-2: 入力ロック表を v7.2 状態に合わせて全面更新 (B1)

### 追加

- §29 (継続): `deferredBonusNotice` フラグ (LATE_REVIVAL 用、A2)
- C群 全項目: エッジケース確定値 (C1〜C6)
- D群 全項目: TypeScript 型定義 (D1〜D8)
- **§30 筐体UI・ガワ連携仕様 (21節、新規)**

---

## 巻末: ファイル構成総まとめ

```
neon-jack/
├── docs/
│   ├── neon_jack_v7_2.md        # 本体仕様書
│   └── neon_jack_v7_3.md        # 本ドキュメント (差分パッチ+§30+型定義)
├── src/
│   ├── core/                    # ロジック層
│   │   ├── lottery.ts
│   │   ├── reels.ts
│   │   ├── paylines.ts
│   │   ├── stateMachine.ts
│   │   ├── payout.ts
│   │   ├── bonus.ts
│   │   └── rush.ts
│   ├── types/                   # 型定義 (D群)
│   │   ├── domain.ts
│   │   ├── phase.ts
│   │   ├── bonus.ts
│   │   ├── notify.ts
│   │   ├── lines.ts
│   │   ├── events.ts
│   │   └── state.ts
│   ├── ui/                      # UI派生・レイアウト
│   │   ├── deriveUIState.ts
│   │   ├── UIState.ts
│   │   └── layout.ts
│   └── components/              # UIコンポーネント (§30)
│       ├── SlotMachine.tsx
│       ├── Cabinet.tsx
│       ├── ReelWindow.tsx
│       ├── Controls.tsx
│       ├── Lamps.tsx
│       ├── Counters.tsx
│       └── LCD.tsx
├── public/
│   └── assets/slot/             # 画像素材 (§30-3)
│       ├── cabinet/  reels/  symbols/  buttons/
│       ├── lever/    lamps/  lcd/
├── tsconfig.json
├── package.json
└── index.html
```

---

**仕様書 v7.3 完全版 — 以上**

機械割計算 → TS移行 → §30 UI統合の順で進めれば、デッドロックなく開発が走るはず。

