# NEON JACK 統合仕様書 ver1

version: ver1（2026-06 時点の実装を正とする統合版）

本書は、これまで分散していた以下の仕様書を **現行コードの実装内容に合わせて 1 本化** したものである。
矛盾がある場合は **本書（＝実装）を正** とする。

- `docs/neon_jack_v7_2.md` / `v7_3.md`（旧・全体仕様）
- `docs/reel.md`（リール配列の暫定修正メモ）
- `reel_fix_spec.md` / `reel_fix_spec-2.md`（リール並び・成立役ズレ修正）
- `docs/reel_move.md`（コマ滑り方式への移行 = reel-control-v1）

> 旧仕様の節番号（§5-1 等）は履歴のために一部残すが、数値・挙動は本書を参照すること。

---

## 1. 概要

ジャグラー風の Web スロット。レバーON で内部抽選 → 停止ボタンで目押し（コマ滑り引き込み／蹴飛ばし）→ 入賞判定 → ボーナス／RUSH へ。

### 1-1. 技術スタック

- TypeScript（strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes 等フル）
- React 18（`useReducer` で `transition` を駆動、`StrictMode`）
- Vite（dev: `npm run dev`、build: `npm run build` → `dist/`）
- 状態は純粋な discriminated union。副作用（音・乱数アニメ）は UI 層。

### 1-2. ディレクトリ構成

```
src/
├── core/                  # ゲームロジック（画像非依存）
│   ├── stateMachine.ts    # フェーズ遷移レデューサー transition()
│   ├── lottery.ts         # 内部抽選（確率テーブル・天井）
│   ├── reels.ts           # リール配列・回転タイミング・停止位置ヘルパー
│   ├── reelControl.ts     # コマ滑り停止制御（引き込み／蹴飛ばし）★reel-control-v1
│   ├── paylines.ts        # 5ライン評価・CHERRY 検出
│   ├── payout.ts          # 役別払い出し枚数
│   ├── bonus.ts           # ボーナス種別判定・コンテキスト生成
│   └── rush.ts            # RUSH / 継続抽選
├── types/                 # 型定義（domain / state / phase / bonus / notify ...）
├── ui/
│   ├── deriveUIState.ts   # GameState → 表示用 UIState
│   ├── uiSettings.ts      # AUTO速度・ペカ停止・ボーナス手動の設定
│   ├── layout.ts          # 色・寸法定数
│   └── sounds.ts          # 効果音（SFX）
└── components/
    ├── SlotMachine.tsx     # ルート。useReducer + 回転クロック + 各種 effect
    ├── Cabinet.tsx         # 筐体画像・リール・ボタンオーバーレイ・当たり判定
    ├── Controls.tsx        # AUTO / SETTINGS バー
    ├── Counters.tsx        # コイン・払い出し・ゲーム数
    ├── SettingsModal.tsx   # 設定モーダル
    ├── DevPanel.tsx        # DEV: コイン/設定/RUSH強制/状態表示
    └── ForcedFlagPanel.tsx # DEV: 強制フラグ（選択→APPLY 方式）

public/assets/slot/   # 筐体・リール・ボタン画像
public/assets/sounds/ # 効果音 m4a
```

---

## 2. ドメイン定義

### 2-1. 図柄（GameSymbol）

`SEVEN` / `BAR` / `JACK` / `BLUE_GEM` / `BELL` / `CHERRY` / `REPLAY` の 7 種。

### 2-2. 設定（SettingLevel）

`1 | 4 | 5 | 6`。設定変更時は通常ゲーム数・pendingFlag・各種 debug をリセット（`resetForSettingChange`）。

### 2-3. 内部抽選フラグ（Flag）

| フラグ | 視覚 | 結果 |
|---|---|---|
| `LOSS` | ハズレ目 | なし |
| `REPLAY` / `BLUE_GEM` / `BELL` / `JACK` | 各小役の3つ揃い | 小役払い出し |
| `ANGLE_CHERRY` | 左下段 CHERRY（角） | 2枚 |
| `NORMAL_BIG` | ロス目 → 告知 → 入賞G で 7-7-7 | BIG |
| `NORMAL_REG` | ロス目 → 告知 → 入賞G で 7-7-BAR | REG |
| `ANGLE_CHERRY_BIG` | 角CHERRY + BIG | BIG → COUNTDOWN |
| `ANGLE_CHERRY_REG` | 角CHERRY + REG | REG → 通常 |
| `CENTER_CHERRY_BIG` | 左中段 CHERRY（プレミア） | BIG → RUSH直行 |
| `PREMIUM_BIG` | ロス目のまま（隠れ激熱） | BIG → RUSH直行 |
| `CEILING_BIG` | ロス目 | BIG（天井）→ COUNTDOWN |

---

## 3. リール配列（reels.ts）

**画像が正。** 各リール 21 コマ、index 0 = 画像最上段。`reel_fix_spec-2.md` を実機目視で補正した確定値。

```
left:   BELL  SEVEN REPLAY GEM  REPLAY GEM  BAR  CHERRY REPLAY GEM
        GEM   SEVEN JACK   GEM  REPLAY GEM  CHERRY BAR   GEM    REPLAY  GEM
center: REPLAY SEVEN GEM   CHERRY REPLAY BELL GEM CHERRY REPLAY BAR
        GEM   CHERRY REPLAY BELL GEM CHERRY REPLAY BAR  GEM    CHERRY  JACK
right:  GEM   SEVEN BAR    BELL REPLAY GEM  JACK BELL  REPLAY GEM
        JACK  BELL  REPLAY GEM  JACK BELL  REPLAY GEM  JACK   BELL    REPLAY
```

- 右リールに CHERRY は無い（チェリーは左リール単独成立）。
- 回転速度 `SPIN_FRAME_MS = 750/21`（≈35.7ms/コマ = **80回転/分**）。
- 図柄は**下方向へ流れる**（中段コマ index は時間とともに減少）。
- `liveCenterIndex(startPos, startTime, now)` で「今中段に最も近いコマ」を算出（round 基準）。

---

## 4. 内部抽選（lottery.ts）

レバーON 時に `selectFlag(gs)` が設定別テーブルから1フラグを抽選。**フラグ抽選ロジックは reel-control 移行後も不変。**

### 4-1. 設定別パラメータ（確定値）

| 設定 | BIG合算 | REG | BLUE GEM | 角CHERRY | 中段CHERRY+BIG |
|---|---|---|---|---|---|
| 1 | 1/218 | 1/272 | 1/6.10 | 1/36 | 1/8192 |
| 4 | 1/210 | 1/270 | 1/5.90 | 1/35 | 1/7281 |
| 5 | 1/205 | 1/255 | 1/5.75 | 1/34.5 | 1/6553 |
| 6 | 1/195 | 1/235 | 1/5.55 | 1/34 | 1/5957 |

- BIG 内訳: 中段CHERRY+BIG を固定分離 → 残りを 75:22 で 単独BIG / 角CHERRY+BIG に按分 → 単独BIG プールの 1% を PREMIUM_BIG に変換。
- REG 内訳: 75% NORMAL_REG / 25% 角CHERRY+REG。
- 共通: REPLAY 1/7.30、BELL 1/1024、JACK 1/1024。
- 1G連 `draw1GRen()` = 1/110、RUSH継続 `drawRushContinue()` ≈ 0.677、COUNTDOWN 突入 `drawCountdownSuccess()` = 100%。

### 4-2. 天井

通常ゲーム数 `normalGameCount >= 500`（`CEILING_THRESHOLD`）で `CEILING_BIG` を強制（RUSH中は加算しない）。

### 4-3. 強制フラグ（DEV）

`debugForcedFlag`（1回消費）が最優先。次いで天井、次いで通常抽選。

---

## 5. 役と払い出し（payout.ts）

| 役 | 払い出し |
|---|---|
| BIG / REG | 0（消化Gで払い出し） |
| BELL | 14 |
| JACK | 10 |
| BLUE_GEM | 8 |
| ANGLE_CHERRY / CENTER_CHERRY | 2 |
| REPLAY | 0（再遊技） |

- BET = 3 枚。
- ボーナス払い出し: BIG = 168枚（14×12G）、REG = 56枚（14×4G）、消化1Gあたり 14 枚。
- 評価は 5 ライン（TOP / CENTER / BOTTOM / ASC / DESC）。CHERRY は左リール単独（中段=CENTER、上下段=ANGLE）。

---

## 6. フェーズ遷移（stateMachine.ts）

### 6-1. フェーズ一覧

`SPIN` / `BONUS_NOTICE` / `BONUS_ENTRY` / `BONUS_GAME` / `COUNTDOWN(1-3)` / `RUSH_JUDGE(1-6)` / `RUSH_END`。
`SPIN`系は サブフェーズ `WAIT_BET → WAIT_LEVER → STOP_L → STOP_C → STOP_R` を持つ。

### 6-2. 1ゲームの流れ

```
WAIT_BET ─BET─▶ WAIT_LEVER ─LEVER─▶（抽選確定・回転開始）
  STOP_L ─停止─▶ STOP_C ─停止─▶ STOP_R ─停止─▶（評価）
    小役/ハズレ → WAIT_BET へ
    ボーナス成立 → BONUS_NOTICE → BONUS_ENTRY（7揃え）→ BONUS_GAME（消化）→ 後続へ
```

### 6-3. ボーナス後の遷移（bonus.ts）

| ボーナス種別 | 後続 |
|---|---|
| NORMAL_BIG / CEILING_BIG | COUNTDOWN |
| PREMIUM_BIG（中段CHERRY含む） | RUSH 直行 |
| NORMAL_REG | 通常 |
| RUSH_BIG / RUSH_REG | RUSH 次セット / 判定 |

### 6-4. COUNTDOWN

3G 消化後、突入抽選（実装は 100%、`debugForcedRushResult` で上書き可）。成功で RUSH へ。

### 6-5. RUSH（rush.ts）

- 1セット = `RUSH_JUDGE` 6G。開始時に継続抽選（≈67.7%）を先行実施し `rushInternalContinueFlag` に保持。
- 毎ゲーム 1G連抽選（1/110）。いずれか true で **6G目 STOP_L に左中段 CHERRY の継続演出**（reel-control のゴールで実現）。
- 6G完了で継続なら次セット、非継続なら `RUSH_END`。
- RUSH 中の BIG/REG は `RUSH_BIG`/`RUSH_REG` として消化。

---

## 7. リール制御 — コマ滑り方式（reelControl.ts）★reel-control-v1

旧「目押し不要の自動整列」（v7.2 §5-1/§5-2/§28-8）は**廃止**。以下が現行仕様。

### 7-1. 基本

- レバーON では停止位置を確定しない。**回転開始のみ**（成立役 `pendingFlag` は保持）。
- 停止ボタンを押した瞬間の中段コマ位置 `pressPos` を起点に、**すべり 0〜4コマ**で停止位置を決定。
- **引き込みは取りこぼしあり**: 成立役の構成図柄がすべり4コマ以内に無ければ揃わない（＝目押し失敗で取りこぼし。実機準拠）。
- **蹴飛ばしは100%**: 非成立ボーナスは絶対に有効ライン上に揃えない（必要なら停止位置を全域から選び直す。見えない停止調整）。
- **ボーナスは持ち越し**: BONUS_ENTRY で7（または7-7-BAR）を取りこぼした場合、揃うまで BONUS_ENTRY を再スピン（§6-2 参照）。BET は消費しない。
- 停止順は **左→中→右 固定**（任意順押し＝reel_move §2-5/§8-6 は未対応）。

### 7-2. ゴール（reelGoals）

| 状況 | 左 | 中 | 右 |
|---|---|---|---|
| 小役（REPLAY/BELL/JACK/GEM） | その図柄 | その図柄 | その図柄 |
| 角チェリー系 | 上 or 下段 CHERRY | avoid | avoid |
| 中段チェリー / RUSH 6G継続 | 中段 CHERRY | avoid | avoid |
| ハズレ・各BIG/REG（通常スピン） | avoid | avoid | avoid |
| BONUS_ENTRY | 7 | 7 | 7（REGは右BAR） |
| BONUS_GAME | BELL | BELL | BELL |

> BIG/REG はジャグラー方式に従い、通常スピンでは **ロス目**（avoid）。7-7-7 は `BONUS_ENTRY` で目押しして揃える。

### 7-3. 停止位置決定（decideStop）

`pressPos` から回転方向（index 減少方向）に探索：
- **引き込みゴール（小役・チェリー・7）**: `k = 0..MAX_SLIP(=4)` のみ探索。条件を満たす最小 k を採用。見つからなければ**取りこぼし**（pressPos 付近で停止、誤ボーナスだけは回避）。
- **蹴飛ばしゴール（avoid＝ハズレ/ボーナス視覚）**: 役を作らない位置を全域から探索（100%回避）。
- 最終停止（3つ目）では追加検証：ハズレ時は全役を揃えない／小役時はボーナスを別ラインで誤完成させない。

### 7-4. 入力精度

- 手動停止は `pressPos` 算出時に**入力遅延 45ms を巻き戻し**、目で見た図柄と一致させる。
- 表示（rAF）と `liveCenterIndex` は同一式で同期。
- 払い出し・成立役は**実際のリール出目**（`evaluateLines`）から算出。目押し結果が直接反映される。

### 7-5. AUTO 時

人間が押さないため、`autoAimPos` で**ゴールを確実に満たす位置を全域から算出して完璧に目押し**する（ランダム押下だとボーナス7が揃わず詰むため）。これにより AUTO は成立役を取りこぼさず、ボーナスもスムーズに消化する。

---

## 8. 効果音（ui/sounds.ts）

`public/assets/sounds/` に m4a を配置。`cloneNode` で重ね再生。

| ファイル | タイミング |
|---|---|
| `btn_maxbet.m4a` | BET 成立時 |
| `btn_lever.m4a` | LEVER 成立時 |
| `btn_stop1/2/3.m4a` | 各停止時 |
| `btn_stop3_win.m4a` | 第3停止で払い出し>0（小役成立） |

`dispatchWithSound` が `transition` の結果（状態が変化したか／払い出し）を見て発火。無効入力時は鳴らさない。

---

## 9. 筐体UI・レイアウト（Cabinet.tsx）

- 筐体実寸 773×1444、表示は `SCALE = 0.55`。
- 筐体画像 `cabinet.png` を重ね、リール窓（透過）からリールストリップを表示。
- リールストリップ画像 165×1764（1コマ ≈ 84px）、窓は 3 コマ分。
  - リール位置: 左 x143 / 中 x300 / 右 x470、y414。
- ボタンは **未押下状態を cabinet.png に内包**、押下時のみ pressed 画像をオーバーレイ。
  - MAXBET (120,883) / PUSH (317,883) / レバー (82,994) / 停止1 (226,1007) / 停止2 (325,1007) / 停止3 (425,1007)、各 140×140。
- 透明な当たり判定（HitZone）をボタン位置に重ねてクリック検知。

### 9-1. ボタン pressed の表示時間

| ボタン | 挙動 |
|---|---|
| MAXBET | 押下〜次のLEVERまで pressed |
| レバー | 押下〜第1停止まで down |
| 停止1/2/3 | 押した順に保持、次ゲーム WAIT_BET で解除 |

---

## 10. 操作・モード（SlotMachine.tsx）

- **手動**: 各ボタン（HitZone）クリック。
- **画面クリック**: 筐体背景クリックで現フェーズの次アクションを発火。
- **AUTO**: 速度設定（等速600 / 倍速300 / 超高速80ms）で自動進行。ペカ時 AUTO 停止オプションあり。
- **ボーナス自動消化**: `bonusManualMode=false` の時、AUTO とは独立に BONUS_ENTRY/GAME を自動進行（`AUTO_TICK`）。
- **設定モーダル（⚙）**: AUTO速度 / ペカ停止 / ボーナス手動 を切替（`uiSettings`、useState 管理）。

---

## 11. DEV ツール（本番ビルドからは tree-shake）

- **DevPanel**: コイン +10000 / 設定 1·4·5·6 切替 / RUSH継続強制（SUCCESS·FAIL）/ 状態表示。即時反映。
- **ForcedFlagPanel**: フラグを選択 → **APPLY** で `debugForcedFlag` にセット（次LEVERで1回消費）。SEL/ARMED 表示。
- いずれも `import.meta.env.DEV` ガードで囲む。

---

## 12. 既知の制約・未対応（スコープ外）

1. **停止順は左→中→右固定**。任意順押し（順押し/ハサミ/逆押し）は未対応（reel_move §2-5/§8-6）。
2. **引き込みすべりは厳密に 0〜4コマ**。希少図柄（BELL/JACK/SEVEN）は目押しが効きにくく取りこぼしやすい（各リールに1〜2個のみ）。ボーナスの取りこぼしは持ち越しで救済（§7-1）。
3. ランプ（JACK LAMP / SIDE LAMP）・液晶演出は簡易表示（仮）。
4. PUSH ボタンは演出用（ゲーム進行に未使用）。

---

## 13. ビルド・デプロイ

- `npm run build` → `tsc`（`noEmit: true`、型チェックのみ）+ `vite build` → `dist/`。
- `dist/` を静的ホスティングに配置。SPA なので必要に応じて全リクエストを `index.html` へフォールバック。
- 注意: 以前 `tsc` が `src/` に `.js` を出力し Vite が `.tsx` より優先して読む不具合があった。`tsconfig.json` の `noEmit: true` で再発防止済み。`src/**/*.js` は生成しないこと。

---

## 14. 旧仕様書との対応

| 旧 | 本書での扱い |
|---|---|
| v7.2/v7.3 全体仕様 | フェーズ・確率・払い出しの土台。リール制御部のみ §7 で上書き |
| reel.md / reel_fix_spec(-2).md | §3 のリール配列・停止に統合（実機目視で確定値を補正） |
| reel_move.md | §7 reel-control-v1 として採用（任意順押しは未対応） |
| ボタン操作音 仕様 | §8 に統合 |
| 停止位置ランダム化 仕様 | §7 のコマ滑りに発展的に統合（押下位置起点に変更） |
