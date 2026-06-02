リール並び・成立役ズレ修正 仕様書
背景 / 症状
差し替え後のリール画像（reel_left.png / reel_center.png / reel_right.png、各 21 コマ・高さ 3528px・1コマ 168px）の実際の図柄の並びが、src/core/reels.ts の REEL_STRIPS（コード上の図柄配列）と完全に食い違っている。
その結果、evaluateLines(gs.reelPos) → computeNormalPayout はコード上の REEL_STRIPS を信じて役を判定し払い出すが、画面は画像の実際の並びを表示するため、「払い出しは成立しているのに画面では図柄が揃っていない」（例: 宝石=BLUE_GEM 成立で 8 枚払い出しなのにリールは揃わない）という不整合が発生している。
本仕様書の目的は、画像を「正」として、コード側（REEL_STRIPS と停止位置テーブル）を画像の実際の並びに一致させること。画像ファイルは変更しない。

インデックス規約は既存どおり 0 始まり（reels.ts コメント「コマ1 = index 0, コマ21 = index 20」）。本仕様書の数値はすべて 0〜20 のコード値。


確定事項（前提）

コマ数: 21（REEL_SIZE = 21、N_SYM = 21 は変更不要）
行オフセット規約（既存 rowOffset どおり）: top = stopIndex + 1 / center = stopIndex / bottom = stopIndex - 1（mod 21）
上記の数値・並びは、差し替え後の画像から 1 コマずつ読み取り、各停止位置で中段に所定図柄が揃うことをスクリプトで検証済み。


修正1: REEL_STRIPS を画像どおりに置き換える
src/core/reels.ts の REEL_STRIPS を、以下の並び（index 0 → 20）に完全に差し替える。
left（左リール）
0:BELL  1:SEVEN  2:REPLAY  3:BLUE_GEM  4:REPLAY
5:BLUE_GEM  6:BAR  7:CHERRY  8:REPLAY  9:BLUE_GEM
10:BLUE_GEM  11:SEVEN  12:JACK  13:BLUE_GEM  14:REPLAY
15:BLUE_GEM  16:CHERRY  17:BAR  18:BLUE_GEM  19:REPLAY
20:BLUE_GEM
center（中リール）
0:SEVEN  1:CHERRY  2:BLUE_GEM  3:CHERRY  4:REPLAY
5:BELL  6:BLUE_GEM  7:CHERRY  8:REPLAY  9:BAR
10:BLUE_GEM  11:CHERRY  12:REPLAY  13:BELL  14:BLUE_GEM
15:CHERRY  16:REPLAY  17:BAR  18:BLUE_GEM  19:CHERRY
20:JACK
right（右リール）
0:BELL  1:SEVEN  2:BAR  3:BELL  4:REPLAY
5:BLUE_GEM  6:BELL  7:REPLAY  8:JACK  9:BLUE_GEM
10:BELL  11:BELL  12:REPLAY  13:BLUE_GEM  14:JACK
15:BELL  16:BELL  17:REPLAY  18:BLUE_GEM  19:BELL
20:REPLAY

注意: right（右リール）に CHERRY は存在しない。チェリーは左リールの角/中段でのみ成立させる設計（後述）。paylines.ts がチェリーを右リールに要求していないことを確認すること。

実装イメージ（SYMBOL エイリアス S を使用、既存の書式に合わせる）:
tsexport const REEL_STRIPS: Readonly<Record<ReelColumn, readonly GameSymbol[]>> = {
  left: [
    S.BELL, S.SEVEN, S.REPLAY, S.BLUE_GEM, S.REPLAY,
    S.BLUE_GEM, S.BAR, S.CHERRY, S.REPLAY, S.BLUE_GEM,
    S.BLUE_GEM, S.SEVEN, S.JACK, S.BLUE_GEM, S.REPLAY,
    S.BLUE_GEM, S.CHERRY, S.BAR, S.BLUE_GEM, S.REPLAY,
    S.BLUE_GEM,
  ],
  center: [
    S.SEVEN, S.CHERRY, S.BLUE_GEM, S.CHERRY, S.REPLAY,
    S.BELL, S.BLUE_GEM, S.CHERRY, S.REPLAY, S.BAR,
    S.BLUE_GEM, S.CHERRY, S.REPLAY, S.BELL, S.BLUE_GEM,
    S.CHERRY, S.REPLAY, S.BAR, S.BLUE_GEM, S.CHERRY,
    S.JACK,
  ],
  right: [
    S.BELL, S.SEVEN, S.BAR, S.BELL, S.REPLAY,
    S.BLUE_GEM, S.BELL, S.REPLAY, S.JACK, S.BLUE_GEM,
    S.BELL, S.BELL, S.REPLAY, S.BLUE_GEM, S.JACK,
    S.BELL, S.BELL, S.REPLAY, S.BLUE_GEM, S.BELL,
    S.REPLAY,
  ],
} as const;

修正2: 停止位置テーブルを置き換える
新しい REEL_STRIPS に対し、各役が中段ライン（CENTER）で揃う停止位置に差し替える。下表はすべて検証済み（mod 21、top=stop+1 / center=stop / bottom=stop-1）。
役 / 用途LCR中段ライン結果LOSS（ハズレ）000BELL / SEVEN / BELL（不一致＝何も揃わない）REPLAY244REPLAY / REPLAY / REPLAYBLUE_GEM325BLUE_GEM ×3BELL050BELL ×3JACK12208JACK ×3ENTRY BIG（入賞 7-7-7）101SEVEN ×3ENTRY REG（入賞 7-7-BAR）102SEVEN / SEVEN / BARBONUS GAME（消化 BELL ×3）050BELL ×3（BELL と同一）
チェリー（角/中段）について — 要確認ポイント
旧コードは角チェリー（左下段）と中段チェリーを別位置（pos(5,0,0) / pos(4,0,0)）で区別していた。新しい左リールで CHERRY は index 7 と 16 にある。

左リール停止位置 7 → 中段に CHERRY（center=index7=CHERRY）。中段チェリー用。
左リール停止位置 8 → 下段に CHERRY（bottom=index7=CHERRY）。角（下段）チェリー用。

中・右リールは「チェリー以外のラインを誤って揃えない」位置にすればよい。検証済みの安全な組み合わせ例:
役LCR左の CHERRY 位置CENTER_CHERRY（中段チェリー）720左中段ANGLE_CHERRY（角チェリー＝左下段）820左下段

実装時の必須確認: src/core/paylines.ts の evaluateLines がチェリーをどのライン（中段のみ / 角＝下段 / 上下二段）で判定しているかを読み、上記 L 位置（7=中段, 8=下段）が評価ロジックと一致するか確認すること。ペイライン定義が「左の上段/下段でもチェリー成立」を含む場合は、中・右リールの停止位置がそのラインで他役を誤成立させていないことも併せて確認する。旧コードは角・BIG・REG で同一ビジュアル（pos(5,0,0)）を使っていたため、ANGLE_CHERRY / ANGLE_CHERRY_BIG / ANGLE_CHERRY_REG は同じ停止位置で良い。

実装イメージ（getNormalSpinStops）:
tsexport function getNormalSpinStops(flag: Flag): ReelPositions {
  switch (flag) {
    case FLAG.REPLAY:            return pos(2,  4,  4);
    case FLAG.BLUE_GEM:          return pos(3,  2,  5);
    case FLAG.BELL:              return pos(0,  5,  0);
    case FLAG.JACK:              return pos(12, 20, 8);
    case FLAG.ANGLE_CHERRY:      return pos(8,  2,  0); // 左下段 CHERRY
    case FLAG.ANGLE_CHERRY_BIG:  return pos(8,  2,  0);
    case FLAG.ANGLE_CHERRY_REG:  return pos(8,  2,  0);
    case FLAG.CENTER_CHERRY_BIG: return pos(7,  2,  0); // 左中段 CHERRY → RUSH直行
    default:                     return pos(0,  0,  0); // LOSS / 各BIG/REG → ロス演出
  }
}

export function getBonusEntryStops(isREG: boolean): ReelPositions {
  return isREG
    ? pos(1, 0, 2)   // 中段 SEVEN-SEVEN-BAR
    : pos(1, 0, 1);  // 中段 SEVEN-SEVEN-SEVEN
}

export function getBonusGameStops(): ReelPositions {
  return pos(0, 5, 0); // 中段 BELL-BELL-BELL
}
getCenterCherryStopPositionLeft() の更新
旧値は 4。新しい左リールで中段に CHERRY が来る停止位置は 7。
tsexport function getCenterCherryStopPositionLeft(): ReelIndex {
  return 7 as ReelIndex; // Left[7] = CHERRY → 中段
}

§B2（RUSH 6G目 STOP_L で中段 CHERRY 強制）の onRushStopL（src/core/rush.ts）がこの関数を使っているはず。新値 7 で中段に CHERRY が来ることを確認すること。


修正3: コメントの停止位置メモを更新
reels.ts 内の「停止位置テーブル」コメント（LOSS (0,0,0) 等の一覧）は旧並び前提なので、修正2 の新しい値・図柄に書き換える。コメントとコードの乖離は今回のバグの遠因なので必ず同期させる。

検証手順（実装後に必ず実施）

型チェック / ビルド: tsc がエラーなく通ること。
各役の目視確認: デバッグ機能（SET_DEBUG_FLAG）で各フラグを 1 つずつ強制し、LEVER→STOP_L/C/R 後に

中段ラインの図柄が表に揃っていること
払い出し枚数が役と一致すること（払い出しと画面の不整合が解消）
を確認。特に BLUE_GEM（症状の出ていた役） と ENTRY BIG/REG、チェリー2種 を重点確認。


LOSS 確認: ハズレ時に中段はもちろん上段・下段でも 3 つ揃いが発生しないこと。
ボーナス入賞: BONUS_ENTRY で 7-7-7 / 7-7-BAR が中段に正しく出ること。
ボーナス消化: BONUS_GAME で毎ゲーム BELL-BELL-BELL（14枚）が中段に出ること。
RUSH 6G目: onRushStopL 経由で左中段に CHERRY が出ること。


触らないもの（スコープ外）

リール画像ファイル（差し替え済み・これが「正」）
Cabinet.tsx の表示寸法（STRIP_W/STRIP_H 等）— 比率を保った縮小であり表示は正常に動作している。今回の不整合は表示ではなく並びデータの問題なので、Cabinet は変更不要。
ステートマシンのフェーズ遷移ロジック（stateMachine.ts）— フラグ→停止位置の対応表（reels.ts）のみ修正対象で、遷移そのものは変えない。
払い出し額の定義（payout.ts の枚数）— 役そのものの枚数は仕様どおりと仮定。今回直すのは「どの停止位置でどの図柄が揃うか」のみ。


まとめ（このバグの根本原因）
リール画像を 24 コマ版 → 21 コマ版に差し替えた際、コード側の REEL_STRIPS（図柄配列）と停止位置テーブルが旧並びのまま残っていたため、払い出し計算（コード配列基準）と画面表示（画像基準）が食い違った。本修正で両者を画像基準に統一する。