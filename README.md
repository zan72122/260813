# ネオンサイン職人

4歳児向けの iPhone / iPad モバイル Web ゲーム。
やさしい職人と一緒にガラス管を炎で温め、指でなぞって曲げ、暗くした工房で通電すると——
自分の作った線がネオンサインとして「パッ」と光る。

**熱する → 柔らかくなる → 曲げる → 形が残る → 暗くする → 光る** という因果を、
文字を使わず一本道の体験として伝える。

## 遊び方

1. **かたちを選ぶ** — 星・ハート・花・虹のボタンをタップ
2. **温める** — 手のマークで長押し。トーチの炎が管をオレンジに温める
3. **曲げる** — 光るガイド線に沿って指でなぞる。冷えたらまた温める
4. **暗くする** — 月のボタンを長押しして工房を暗転
5. **通電する** — 電源ボタンを長押し。ジジッ…パッ！と点灯
6. **もう一つ作る** — 完成品は工房の壁に飾られていく（localStorageに保存）

操作は一指のドラッグ・スワイプ・長押しのみ。失敗も採点も制限時間もない。

## 技術

- Three.js (WebGL) / esbuild。CSS疑似3Dではなく透視投影・遮蔽・実ジオメトリの3D空間
- 曲げは物理計算ではなく「形状パス上の進捗 t で TubeGeometry を再生成」する偽装
- ネオンはガラス管(MeshPhysicalMaterial) + 発光コア + 彩度ハローの3層シェーダー + UnrealBloom
- 点灯時はネオン色 PointLight ×4 と加算グロープレーンで床・壁への色反射を表現
- カメラは自動チェーン（全景→加熱接写→曲げ→完成全景→暗転→点灯接写→鑑賞）のみ
- 子どもの手ぶれは横ずれとして記録し、完成品に3割残す

## 開発

```bash
npm install
npm run build      # dist/app.js を生成（本番・minify）
npm run build:dev  # sourcemap付き
npm run serve      # http://localhost:8080
```

## 自動試遊テスト

Playwright + SwiftShader で実際に一連の操作（選択→加熱→なぞり曲げ→暗転→点灯）を行い、
各段階のスクリーンショットと輝度・コンソールエラーを検証する。

```bash
node test/playtest.mjs --shape=star            # 縦画面
node test/playtest.mjs --shape=heart --landscape
node test/tune.mjs --shape=rainbow --stage=lit # 見た目の高速確認
```
