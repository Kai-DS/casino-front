# リール並び・成立役ズレ修正 仕様書

## 背景 / 症状

`src/core/reels.ts` の `REEL_STRIPS`（図柄配列）と停止位置テーブルが正しい並びと食い違っているため、払い出し計算（コード基準）と画面表示（画像基準）が不一致になっている。
（例: BLUE_GEM 成立で 8 枚払い出しなのにリール画面では揃っていない）

**画像は変更しない。コード側（`REEL_STRIPS` と停止位置テーブル）を正しい並びに一致させる。**

> インデックス規約は既存どおり **0 始まり**（コマ1 = index 0、コマ21 = index 20）。本仕様書の数値はすべて 0〜20 のコード値。行オフセット規約も既存どおり: `top = stop+1 / center = stop / bottom = stop-1`（mod 21）。

---

## 修正1: `REEL_STRIPS` を以下に完全差し替え

`src/core/reels.ts` の `REEL_STRIPS` を下記に書き換える。

```ts
export const REEL_STRIPS: Readonly<Record<ReelColumn, readonly GameSymbol[]>> = {
  left: [
    S.BELL,     S.SEVEN,    S.REPLAY,   S.BLUE_GEM, S.REPLAY,   // 0-4
    S.BLUE_GEM, S.BAR,      S.CHERRY,   S.BLUE_GEM, S.REPLAY,   // 5-9
    S.SEVEN,    S.JACK,     S.BLUE_GEM, S.REPLAY,   S.BLUE_GEM, // 10-14
    S.CHERRY,   S.BAR,      S.BLUE_GEM, S.BLUE_GEM, S.CHERRY,   // 15-19
    S.BLUE_GEM,                                                   // 20
  ],
  center: [
    S.REPLAY,   S.SEVEN,    S.BLUE_GEM, S.CHERRY,   S.REPLAY,   // 0-4
    S.BELL,     S.CHERRY,   S.REPLAY,   S.BLUE_GEM, S.BAR,      // 5-9
    S.CHERRY,   S.REPLAY,   S.BELL,     S.BLUE_GEM, S.REPLAY,   // 10-14
    S.BLUE_GEM, S.BAR,      S.BLUE_GEM, S.CHERRY,   S.BLUE_GEM, // 15-19
    S.JACK,                                                       // 20
  ],
  right: [
    S.BLUE_GEM, S.SEVEN,    S.BAR,      S.BELL,     S.REPLAY,   // 0-4
    S.BLUE_GEM, S.JACK,     S.BELL,     S.REPLAY,   S.BLUE_GEM, // 5-9
    S.BELL,     S.REPLAY,   S.BLUE_GEM, S.JACK,     S.BELL,     // 10-14
    S.REPLAY,   S.BLUE_GEM, S.BELL,     S.BLUE_GEM, S.REPLAY,   // 15-19
    S.BLUE_GEM,                                                   // 20
  ],
} as const;
```

> 右リールに CHERRY は存在しない。チェリーは左リールのみで成立する設計。`paylines.ts` が右リールにチェリーを要求していないことを確認すること。

---

## 修正2: 停止位置テーブルを以下に差し替え

新しい `REEL_STRIPS` に対し、各役が**中段ラインで揃う**停止位置。全組み合わせをスクリプトで検証済み。

| 役 / 用途 | L | C | R | 中段ライン |
|---|---|---|---|---|
| LOSS（ハズレ） | 0 | 0 | 1 | BELL / REPLAY / SEVEN（不一致） |
| REPLAY | 2 | 0 | 4 | REPLAY × 3 |
| BLUE_GEM | 3 | 2 | 5 | BLUE_GEM × 3 |
| BELL | 0 | 5 | 3 | BELL × 3 |
| JACK | 11 | 20 | 6 | JACK × 3 |
| ENTRY BIG（7-7-7） | 1 | 1 | 1 | SEVEN × 3 |
| ENTRY REG（7-7-BAR） | 1 | 1 | 2 | SEVEN / SEVEN / BAR |
| BONUS GAME（BELL × 3） | 0 | 5 | 3 | BELL × 3（BELL と同一でよい） |

### チェリー停止位置

| 役 | L | C | R | 左の状態 |
|---|---|---|---|---|
| CENTER_CHERRY（中段チェリー） | 7 | 0 | 1 | 左中段=CHERRY、左下段=BAR |
| ANGLE_CHERRY（角＝左下段チェリー） | 8 | 0 | 1 | 左中段=BLUE_GEM、左下段=CHERRY |

> C / R の値は「チェリー以外のラインで他役が誤成立しない」安全な組み合わせ。`paylines.ts` の評価ロジックと照らし合わせて、角チェリー・中段チェリーの判定がこの停止位置で正しく発動するか確認すること。`ANGLE_CHERRY` / `ANGLE_CHERRY_BIG` / `ANGLE_CHERRY_REG` は同一の停止位置でよい（ビジュアルは共通、フラグの違いはボーナス抽選ロジック側で処理）。

実装イメージ（`getNormalSpinStops`）:

```ts
export function getNormalSpinStops(flag: Flag): ReelPositions {
  switch (flag) {
    case FLAG.REPLAY:            return pos(2,  0,  4);
    case FLAG.BLUE_GEM:          return pos(3,  2,  5);
    case FLAG.BELL:              return pos(0,  5,  3);
    case FLAG.JACK:              return pos(11, 20, 6);
    case FLAG.ANGLE_CHERRY:      return pos(8,  0,  1); // 左下段 CHERRY
    case FLAG.ANGLE_CHERRY_BIG:  return pos(8,  0,  1);
    case FLAG.ANGLE_CHERRY_REG:  return pos(8,  0,  1);
    case FLAG.CENTER_CHERRY_BIG: return pos(7,  0,  1); // 左中段 CHERRY → RUSH直行
    default:                     return pos(0,  0,  1); // LOSS
  }
}

export function getBonusEntryStops(isREG: boolean): ReelPositions {
  return isREG
    ? pos(1, 1, 2)  // 中段 SEVEN-SEVEN-BAR
    : pos(1, 1, 1); // 中段 SEVEN-SEVEN-SEVEN
}

export function getBonusGameStops(): ReelPositions {
  return pos(0, 5, 3); // 中段 BELL-BELL-BELL
}
```

---

## 修正3: `getCenterCherryStopPositionLeft()` の更新

§B2（RUSH 6G目 STOP_L で中段 CHERRY 強制）が使う関数。

```ts
export function getCenterCherryStopPositionLeft(): ReelIndex {
  return 7 as ReelIndex; // left[7] = CHERRY → 中段
}
```

`src/core/rush.ts` の `onRushStopL` がこの値を使っていることを確認し、新値 7 で左中段に CHERRY が来ることを動作確認すること。

---

## 修正4: `reels.ts` 内コメントの停止位置メモを更新

既存コードの「各停止位置は CENTER ラインで所定図柄が揃うことを事前検証済み」コメントブロックを、修正2 の新しい数値・図柄に書き換える。コメントとコードの乖離が今回のバグの遠因のため、必ず同期させること。

---

## 検証手順（実装後に必ず実施）

1. **ビルド確認**: `tsc` がエラーなく通ること。
2. **各役の目視確認**: `SET_DEBUG_FLAG` で各フラグを 1 つずつ強制し、LEVER → STOP_L/C/R 後に
   - 中段の図柄が表どおりに揃うこと
   - 払い出し枚数が図柄と一致すること（払い出しと画面の不整合が解消）
   - 特に **BLUE_GEM**（症状が出ていた役）を最優先で確認
3. **LOSS 確認**: ハズレ時に中段・上段・下段すべてで 3 つ揃いが発生しないこと。
4. **ENTRY BIG / REG**: BONUS_ENTRY フェーズで中段に 7-7-7 / 7-7-BAR が出ること。
5. **BONUS GAME**: 毎ゲーム中段に BELL-BELL-BELL（14枚）が出ること。
6. **チェリー**: CENTER_CHERRY（L=7）で左中段に CHERRY、ANGLE_CHERRY（L=8）で左下段に CHERRY が出ること。
7. **RUSH 6G目**: `onRushStopL` 経由で左中段に CHERRY が出ること（`getCenterCherryStopPositionLeft` = 7）。

---

## 触らないもの（スコープ外）

- リール画像ファイル
- `Cabinet.tsx` の表示寸法
- `stateMachine.ts` のフェーズ遷移ロジック
- `payout.ts` の払い出し枚数定義

---

# ボタン操作音 仕様書

## 概要

MAXBETボタン・レバー・停止ボタン1〜3の押下時に効果音を再生する。小役成立時の第三停止のみ専用の音を使う。音は重ねて再生する（前の音を止めない）。

## 音声ファイル

以下のパスに mp3 ファイルを配置すること。

```
public/assets/sounds/
  btn_maxbet.m4a       ← MAXBETボタン押下
  btn_lever.m4a        ← レバー押下
  btn_stop1.m4a        ← 停止ボタン1（左）押下
  btn_stop2.m4a        ← 停止ボタン2（中）押下
  btn_stop3.m4a        ← 停止ボタン3（右）通常押下
  btn_stop3_win.m4a    ← 停止ボタン3（右）小役成立時
```

## 再生タイミング

| 操作 | 再生する音 | 発火タイミング |
|---|---|---|
| MAXBETボタン押下 | `btn_maxbet.m4a` | `onBet` が状態を更新した直後 |
| レバー押下 | `btn_lever.m4a` | `onLever` が状態を更新した直後 |
| 停止ボタン1（左）押下 | `btn_stop1.m4a` | `onStop` で reel='L' が処理された直後 |
| 停止ボタン2（中）押下 | `btn_stop2.m4a` | `onStop` で reel='C' が処理された直後 |
| 停止ボタン3（右）通常 | `btn_stop3.m4a` | `onStop` で reel='R' が処理され、払い出し=0 だった場合 |
| 停止ボタン3（右）小役成立 | `btn_stop3_win.m4a` | `onStop` で reel='R' が処理され、払い出し>0 だった場合 |

### 小役成立の判定方法

`stateMachine.ts` の `onStopR` 内で `computeNormalPayout(evalResult)` が確定する。この値（`normalPayout`）が **> 0** であれば小役成立とみなし `btn_stop3_win.m4a` を再生する。

ボーナス入賞（`BONUS_NOTICE` 遷移）は払い出し 0 なので `btn_stop3.m4a` が鳴る。BONUS_GAME中（BELL×3固定）も同様に払い出し判定で分岐してよい。

## 実装方針

音の再生は UI 層（React 側）で行う。`stateMachine` 自体は副作用を持たないため、音声再生ロジックを `transition` の中に書かない。

### 推奨実装パターン

`useGameState`（または `App.tsx` 等のゲームループ部分）で `dispatch` をラップした関数を用意し、アクション種別と結果の状態変化に応じて音を鳴らす。

```ts
// src/audio/sounds.ts
const cache: Record<string, HTMLAudioElement> = {};

export function playSound(path: string) {
  if (!cache[path]) cache[path] = new Audio(path);
  // 重ねて再生するため clone して play
  const audio = cache[path].cloneNode() as HTMLAudioElement;
  audio.play().catch(() => {}); // autoplay policy エラーを握り潰す
}

export const SFX = {
  maxbet:    () => playSound('/assets/sounds/btn_maxbet.m4a'),
  lever:     () => playSound('/assets/sounds/btn_lever.m4a'),
  stop1:     () => playSound('/assets/sounds/btn_stop1.m4a'),
  stop2:     () => playSound('/assets/sounds/btn_stop2.m4a'),
  stop3:     () => playSound('/assets/sounds/btn_stop3.m4a'),
  stop3Win:  () => playSound('/assets/sounds/btn_stop3_win.m4a'),
};
```

呼び出し側（`dispatch` ラッパーの例）:

```ts
function dispatchWithSound(action: Action) {
  const next = transition(gameState, action);

  // 音の発火
  if (action.type === 'BET'   && next !== gameState) SFX.maxbet();
  if (action.type === 'LEVER' && next !== gameState) SFX.lever();
  if (action.type === 'STOP') {
    if (action.reel === 'L' && next !== gameState) SFX.stop1();
    if (action.reel === 'C' && next !== gameState) SFX.stop2();
    if (action.reel === 'R' && next !== gameState) {
      // lastNormalPayout が更新されていれば小役成立
      const isWin = next.lastNormalPayout > 0;
      isWin ? SFX.stop3Win() : SFX.stop3();
    }
  }

  setGameState(next);
}
```

> `next !== gameState` のチェックは「入力が無視されたとき（フェーズが合わなくて状態が変わらなかったとき）は音を鳴らさない」ための guard。ボタンが無効状態のときに音が鳴るのを防ぐ。

> `lastNormalPayout` は `stateMachine.ts` の SPIN フェーズの `onStopR` で更新される（`lastNormalPayout: normalPayout`）。BONUS_GAME・BONUS_ENTRY フェーズでは更新されないため、この判定はボーナス中に誤発火しない。

## 注意事項

- ブラウザの autoplay policy により、ユーザーが最初にページを操作するまで音が鳴らない場合がある。MAXBETボタンが最初の操作になるので、実用上は問題なし。
- `cloneNode` で毎回新しい `Audio` インスタンスを生成するため、連打しても音が重なって再生される。
- 音量調整が必要な場合は `audio.volume = 0.8` 等を `playSound` 内に追加する。

---

# 停止位置ランダム化 仕様書

## 概要

各役が成立するとき、その役で中段が揃う停止位置を**全候補から実行時にランダム選択**する。これにより同じ役が出るたびに毎回異なる停止位置になる。

## パターン数（参考）

| 役 | 中段3つ揃いパターン数 |
|---|---|
| REPLAY | 100 |
| BLUE_GEM | 336 |
| BELL | 10 |
| JACK | 2 |
| SEVEN (ENTRY_BIG) | 2 |
| ENTRY_REG (7-7-BAR) | 2 |
| チェリー系 | 単一（左リール固定） |
| BONUS_GAME | BELL と同じ 10 |

## 実装方針

**全パターンをハードコードせず、`REEL_STRIPS` から実行時に候補を導出する。**

`src/core/reels.ts` に `getCandidateStops` 関数を追加する。

```ts
/** 指定の組み合わせ条件で中段が揃う全停止位置を返す */
export function getCandidateStops(
  leftSym:   GameSymbol,
  centerSym: GameSymbol,
  rightSym:  GameSymbol,
): ReelPositions[] {
  const candidates: ReelPositions[] = [];
  for (let l = 0; l < REEL_SIZE; l++) {
    if (REEL_STRIPS.left[l] !== leftSym) continue;
    for (let c = 0; c < REEL_SIZE; c++) {
      if (REEL_STRIPS.center[c] !== centerSym) continue;
      for (let r = 0; r < REEL_SIZE; r++) {
        if (REEL_STRIPS.right[r] !== rightSym) continue;
        candidates.push(pos(l, c, r));
      }
    }
  }
  return candidates;
}
```

## 停止位置の選択

`src/core/reels.ts` に `pickRandom` ヘルパーを追加し、`getNormalSpinStops` で使う。

```ts
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
```

`getNormalSpinStops` を以下のように書き換える。

```ts
export function getNormalSpinStops(flag: Flag): ReelPositions {
  switch (flag) {
    case FLAG.REPLAY:
      return pickRandom(getCandidateStops(S.REPLAY, S.REPLAY, S.REPLAY));

    case FLAG.BLUE_GEM:
      return pickRandom(getCandidateStops(S.BLUE_GEM, S.BLUE_GEM, S.BLUE_GEM));

    case FLAG.BELL:
      return pickRandom(getCandidateStops(S.BELL, S.BELL, S.BELL));

    case FLAG.JACK:
      return pickRandom(getCandidateStops(S.JACK, S.JACK, S.JACK));

    // チェリー系: 左リールのみ固定、中・右は LOSS と同じ安全位置
    case FLAG.ANGLE_CHERRY:
    case FLAG.ANGLE_CHERRY_BIG:
    case FLAG.ANGLE_CHERRY_REG:
      return pos(8, 0, 1);  // 左下段 CHERRY

    case FLAG.CENTER_CHERRY_BIG:
      return pos(7, 0, 1);  // 左中段 CHERRY → RUSH直行

    // LOSS・各BIG/REG（ロス演出）
    default:
      return pos(0, 0, 1);
  }
}
```

## ボーナス系の扱い

```ts
export function getBonusEntryStops(isREG: boolean): ReelPositions {
  const sym = isREG ? S.BAR : S.SEVEN;
  const candidates = isREG
    ? getCandidateStops(S.SEVEN, S.SEVEN, S.BAR)
    : getCandidateStops(S.SEVEN, S.SEVEN, S.SEVEN);
  return pickRandom(candidates);
}

export function getBonusGameStops(): ReelPositions {
  return pickRandom(getCandidateStops(S.BELL, S.BELL, S.BELL));
}
```

## 注意事項

- **チェリーは左リール固定**のまま（右リールに CHERRY が存在しないため全候補を動的導出できない）。左 L=7（中段）または L=8（下段）を固定し、中・右は安全位置を維持する。
- **パフォーマンス**: BLUE_GEM の 336 パターンでも三重ループは 21×21×21 = 9261 回のみで、LEVER 押下時に一度走るだけなので体感できる遅延にはならない。
- **シード固定が必要な場合**（再現性のあるテスト等）は `Math.random` を差し替えられるよう `pickRandom` の乱数源を引数で渡せる形に拡張すること。
- `getCandidateStops` は将来的にペイライン検証テストにも流用できる。
