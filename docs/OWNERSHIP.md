# OWNERSHIP — 担当所有権

## 編集権限マトリクス

| 役割 | 編集可 | 編集禁止 |
|---|---|---|
| Fable 5 (control plane) | docs/**, .claude/**, オーケストレーション設定 | src/**, tests/**, public/**, package.json 等アプリ実装・ビルド設定 |
| Sonnet Integrator (長寿命) | scaffold全体, src/contracts/**, src/main.ts, src/app/**, package.json, vite設定, 統合時の競合解消 | worker所有領域の実質的な書き換え（競合解消の最小変更は可） |
| Worker A: gameplay-camera | src/game/**, src/scenes/**, src/camera/** | 左記以外 |
| Worker B: rendering-audio | src/render/**, src/vfx/**, src/audio/**, public/generated/** | 左記以外 |
| Worker C: mobile-qa | src/input/**, src/ui/**, src/accessibility/**, tests/**, scripts/** | 左記以外 |

- 所有範囲外に触りたい場合: コードを変えず、handoff の未解決事項として Integrator へ変更要求。
- src/contracts/** は全員 read-only（Integrator のみ書ける）。
- ASSET_MANIFEST.md（ルート）は Worker B が生成アセットを、Worker C が生成スクリプトを追記可。

## Sonnet 予算

同時実行最大3。制作全体で最大5（Integrator=1, Worker A/B/C=2..4, Verifier=5）。
Wave 5 の修正は既存 worker への SendMessage 継続で行い、新規 Sonnet を起こさない。
nested subagent 禁止。Agent Teams 禁止。

## Handoff 形式（全 Sonnet 共通・30行以内）

```
## HANDOFF <役割名>
Branch/Worktree: <ブランチ名>
Changed: <主要変更ファイル列挙（ディレクトリ単位可）>
Commands run: <実行したコマンドと結果要約（成功/失敗）>
Working: <実際に動作確認できたこと（証拠: コマンド出力/スクショパス）>
Open issues: <未解決事項・契約変更要求>
Integration needs: <統合時に必要な作業>
```

長い実装ログ・コード引用を handoff に含めない。
