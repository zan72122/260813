# OWNERSHIP — ファイル所有権

所有外のファイルは読取専用。編集は所有者のみ。違反はGate審査で差し戻す。
共有契約（src/core/**）の変更は **Integratorのみ**。他agentは変更が必要なら30行以内のhandoffで依頼する。

## Fable 5（control plane）
- docs/**、.claude/**
- src/**, tests/**, public/**, package.json等の本番構成は**編集禁止**（読取とコマンド実行は可）。

## Integrator（長寿命Sonnet）
- src/core/**（全契約・EventBus・GameState・TRANSFORM_TIMELINE）
- src/main.ts、src/app/**、index.html
- package.json、package-lock.json、tsconfig.json、vite.config.ts、vitest.config.ts、.gitignore
- 統合修正時、他領域の軽微な接続修正は可（ただし該当ownerのhandoff趣旨を尊重）
- git commit / branch管理はIntegratorと Fable 5 の指示による

## A. gameplay-camera（Sonnet）
- src/game/**（phase遷移、progress管理、transform choreography、hint logic）
- src/scenes/**（三景のSceneModule、舞台・客席・地下のシーングラフ構築）
- src/camera/**（CameraDirector、CinematicBeat実行、断面構図、orientation対応）

## B. rendering-audio（Sonnet）
- src/render/**（renderer設定、QualityTier、DPR cap、材質、照明、手続きテクスチャ生成）
- src/vfx/**（粉塵particle、木漏れ日gobo、footlights、小鳥billboard）
- src/audio/**（WebAudio手続き合成: ノック、カチン、ロープ張力、滑車、カタカタ、コトン、小鳥、拍手。unlock、mute）
- public/generated/**（事前生成アセットを置く場合）
- ASSET_MANIFEST.md（リポジトリ直下。全アセットの出所を記録。権利不明素材の取込禁止）

## C. mobile-qa（Sonnet）
- src/input/**（pointer events、ropeドラッグ→ActionIntent、scroll抑止、斜め補正）
- src/ui/**（文字なしアイコンUI、choice画面、mute/低品質/Reduce Motionトグル）
- src/accessibility/**（Reduce Motion検出、設定永続化）
- tests/**（vitest unit＋Playwright e2e）
- scripts/**（スクリーンショット取得スクリプト等）
- playwright.config.ts

## 検証専用 verifier（fresh-context Sonnet）
- 全ファイル読取専用。編集ゼロ。レポートのみ。

## 規律
- 最大同時3 agent、総数最大5。nested subagent禁止。Agent Teams禁止。
- 各handoffは30行以内。詳細はdocs参照で伝える。
- 並列作業中はgit操作をIntegratorに集約（owner agentはファイル編集のみ、commitしない）。
