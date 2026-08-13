# 四本の脚をぴたり――エッフェル塔の1ミリ

砂箱から砂を少しずつ抜いて巨大な脚を下げ、油圧ジャッキで少しだけ持ち上げ、四本の脚と第一層の大桁をぴたりと合わせて楔で固定する——1888年のエッフェル塔建設で実際に行われた「1ミリの位置決め」を、4歳の子どもが一本指で体験できるモバイルWebゲームです。

- 対象: 4歳〜。iPhone / iPad(mobile Safari優先)、縦横両対応、一本指、読字不要(ゲーム内に文字は一切ありません)
- 一回のプレイ: 3〜5分。失敗・時間切れ・減点・ゲームオーバーはありません
- 史実背景: [docs/HISTORICAL_NOTES.md](docs/HISTORICAL_NOTES.md)(砂箱・油圧ジャッキ・1mm精度・恒久楔は一次資料で確認済み)

## 遊び方(文字なしで完結します)

1. 巨大な四本脚と、まだ繋がっていない第一層が見える
2. 砂箱のgateを下へ引くと砂が流れ、脚がゆっくり下がる(目標のわずか下で砂が尽きる)
3. ジャッキのレバーを上下にこすると脚が少しずつ上がる(近づくほど細かく動く。行き過ぎない)
4. 丸と丸が重なると「カコン」——脚が吸い付く
5. 楔をみぞへ運び、ハンマーでトン。脚が永遠に固定される
6. 四本目が固定されると、真上から四本脚と第一層がひとつになる瞬間が見られる

迷ったら3秒でハンドルが光り、5秒で半透明の手がやり方を見せてくれます。

## 起動

```bash
npm install
npm run dev        # 開発サーバ
npm run build      # 本番ビルド (dist/)
npm run preview    # ビルドのプレビュー
```

## 検証

```bash
npm run verify     # typecheck → lint → unit → build → e2e smoke → e2e full loop
npm run test:unit  # Vitest (310+ tests)
npm run test:e2e:full  # Playwright 完全経路 + QAスクリーンショット再生成(4 viewport)
```

QAスクリーンショットは `artifacts/qa/{phone,tablet}-{portrait,landscape}/` に生成されます。

## URLパラメータ

| param | 用途 |
|---|---|
| `?seed=N` | 決定論モード(同じseed=同じ初期ずれ・砂量・カメラ方位) |
| `?fixedStep=1` | RAF自走停止。`window.__eiffel.step(n)`でのみ進行(テスト用) |
| `?quality=low\|medium\|high` | 品質階層の固定(既定は自動降格つきhigh) |

## 技術

Vite / TypeScript strict / Three.js (WebGL2) / Vitest / Playwright / ESLint。全ジオメトリ・テクスチャ・音は手続き生成で、実行時の外部通信はありません。物理エンジンは使わず、砂と脚は純関数のパラメータモデル(単調性・overshoot不可・no-softlockを不変条件テストで保証)で動きます。設計は [docs/ARCHITECTURE_CONTRACT.md](docs/ARCHITECTURE_CONTRACT.md)、品質証跡は [docs/QUALITY_REPORT.md](docs/QUALITY_REPORT.md) を参照してください。

内部モデルの1 unitは史実の1mmに対応し、snap許容値=1 unitが「1ミリの精度」の表現です。ただし子どもに数値は一切見せません——見えるのは「この丸と、この丸をぴったり合わせる」ことだけです。
