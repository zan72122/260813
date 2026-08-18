# 引き継ぎ資料 — GPT-5.6 Sol へ

初代ディレクター（Claude）より。この作品のDNAは
`DESIGN_CONSTITUTION.md` / `STYLE_LOCK.json` / `CAMERA_AND_TIMING.md` に固定済み。
あなたの仕事は**広げること**であって、**塗り替えること**ではない。

## 実装済み（動作確認済み）

- 60〜120秒の垂直スライス全編:
  導入 → ウォーターフォール編み（cross/drop/pick ×3周＋最終cross）→
  花びら広げ（5ループ、操作痕跡保存）→ 螺旋で花に巻く → 宝石ピン →
  Reveal → もう一度（完全リセットで再プレイ可能）
- 一指操作のみ。誤タッチ無罰。ヒントは光る束＋経路をなぞる蛍（文章ゼロ）
- カメラ文法一式（縦横別構図、操作中フリーズ、呼吸、回転時再構図）
- 髪システム: スプライン掃引チューブ/リボン、drawRangeによる編み成長、
  in-place頂点更新による落下・花びら・コイルのライブモーフ
- 実行時合成オーディオ（水琴窟＋オルゴール、Aペンタトニック）
- prefers-reduced-motion 対応（STYLE_LOCK.motionReduction）
- 決定的テストAPI `window.__whg`、ジェスチャーE2E（tools/playtest.mjs）、
  ゴールデンスクリーンショット（tests/visual/golden/、tools/screenshots.mjs）
- vitest による編み込み数学のユニットテスト（tests/braidMath.test.ts）

## 未実装（今後の拡張候補、優先順）

1. **触感の磨き込み**: cross中の束の"締まる"瞬間の接写演出強化、
   落下束が既存の滝に触れたときの二次揺れ
2. **キャラクターの生命**: 完成時にわずかに振り向く頭の動き（顔は見せない）、
   環境音（風、遠い水音）の層
3. 2人目のキャラクター／髪色（材質パラメータはSTYLE_LOCKに追加してから）
4. 別の完成形（花以外: 蝶、雫 など。シグネチャーアクション2つは共通のまま）
5. iOS実機での発熱・fps計測とrenderScale自動調整

## 技術構成

- Vite + TypeScript + Three.js（r168）。バックエンド・ログイン・分析SDKなし
- `npm run dev` / `npm run build`（tsc --noEmit + vite build）/ `npm test`（vitest）
- `npm run shots`（要 dev サーバー起動中）… ゴールデン再生成
- `node tools/playtest.mjs` … 実ジェスチャーでの全ループE2E
- Playwright は同梱 Chromium（/opt/pw-browsers/chromium、env WHG_CHROMIUM で差し替え）

## 状態遷移

```
intro → braid(BRAID_SCRIPT: C D P C D P C D P C) → petal → coil → gem → reveal
                                                                        ↓ もう一度
intro（短縮版） ←──────────────────────────────────────────────────────┘
```

状態はすべて `Game`（src/game/game.ts）のメモリ内。画面回転はリサイズのみで
状態に触れない。セーブは存在しない（意図的）。

## 主要モジュール

| ファイル | 責務 |
|---|---|
| `src/style.ts` | STYLE_LOCK.json の唯一のimport口 |
| `src/game/game.ts` | フェーズ状態機械・ジェスチャー判定・コミットアニメ（詩の本体） |
| `src/hair/braidMath.ts` | 純粋数学: 編みスパイン、weave、滝、花びら、コイル写像（要ユニットテスト） |
| `src/hair/hairSystem.ts` | 全髪メッシュの生成と毎フレーム更新 |
| `src/hair/geo.ts` | sweepTube / updateSweep / 平行移動フレーム / ref フレーム |
| `src/hair/materials.ts` | Hero材質（髪・宝石）と揺らぎshader注入、glowテクスチャ |
| `src/core/camera.ts` | ショット辞書とカメラ規律（hold / 再構図 / 呼吸） |
| `src/core/stage.ts` | renderer / ライト / ドーム / 光の粒 |
| `src/core/input.ts` | 一指ポインタ（2本目以降は無視） |
| `src/core/audio.ts` | 合成音の語彙 |
| `src/ui/hud.ts` | タイトルと「もう一度」だけの2D層 |
| `src/scene/character.ts` | 少女（手続き生成、アセット無し） |

## 追加しやすい箇所

- 新しい完成形: `braidMath.ts` に写像を1つ足し、`hairSystem.refreshTail` の
  対応分岐を追加（coilPoint と同型のシグネチャで）
- 新キャラ/髪色: STYLE_LOCK.palette に色セットを追加 → materials.ts に流す
- 新しい音: `Chimes` にメソッド追加（ペンタトニック内で）
- ショット追加: STYLE_LOCK.camera.shots に縦横2構図を必ず両方定義

## 変更禁止に近い箇所

- STYLE_LOCK の明度序列・カメラ規律（hold）・タイミング値
- `Input` の「最初の一指だけ」ポリシー
- ヒントの文章非依存原則（Hint クラスの蛍以外の誘導UIを足さない）
- `sweepTube` の頂点順序（drawRange成長が依存。並びを変えると編みが壊れる）
- ゲーム中核をDOMで作らないこと

## 既知の問題

- SwiftShader（ヘッドレスCI）では実時間の約2倍遅く再生される。
  スクリーンショット系スクリプトは `__whg.snapCamera()` で吸収済み。
  実機/GPUでは正常速度。**FPSや滑らかさをSwiftShaderで判定しないこと**
- コイル進行 0.4〜0.7 の中間形状は結び目に見える瞬間がある。動いている間は
  気にならないが、静止画で改善するなら coilPoint の lift とブレンド窓を調整
- 束の交差部で稀に小さな貫通がある（許容済み。z-fight ではない）
- 音はユーザー初回タッチまで無音（モバイル自動再生規制。仕様）

## 性能上の注意

- pixelRatio 上限 2、shadow map 無し、透過は halo/hint/粒のみ
- 毎フレーム頂点更新は「アニメ中の1〜4メッシュ」だけに限定してある。
  新機能でも**全髪の毎フレーム再構築は禁止**（updateSweep を使い、
  対象メッシュ数を増やさない）
- テクスチャは実行時生成の glow 1枚のみ。画像アセットを足す前に再考する

## 新しい美術判断が必要になったら

1. まず `DESIGN_CONSTITUTION.md` §13 の判断原則に通す
2. STYLE_LOCK 内の既存値の**補間**で表現できないか試す（新値の発明より先に）
3. それでも決められない場合は、最も**暗く・静かで・少ない**選択肢を選ぶ。
   この作品は足すほど壊れ、引くほど強くなる
4. 変更した値は必ず STYLE_LOCK に書き戻し、`npm run shots` で
   ゴールデンを再生成して差分を目で確認する
