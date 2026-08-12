# PRODUCT_SPEC — 四本の脚をぴたり――エッフェル塔の1ミリ

## 一文定義

砂箱から砂を少しずつ抜いて巨大な脚を下げ、油圧ジャッキで少しだけ持ち上げ、四本の脚と第一層の大桁をぴたりと合わせて楔で固定するゲーム。

## 看板体験(絶対に守る2点)

1. **小さな砂粒を流しただけで、巨大なエッフェル塔の脚がゆっくり動く** — 砂の流れと脚の下降を同一カットで見せる。
2. **最後の一本が合った瞬間、四本脚と巨大な第一層が一体化する** — 真上寄りカメラで四接合点が順に光り、第一層がわずかに沈み込み、四方向の金属音が一つへ収束する。

slider puzzle・数値合わせにしない。砂・油圧・巨大鉄骨・位置一致・楔・沈み込みの物理的因果を連続カメラで見せる。

## 対象・制約

- 4歳女児。iPhone/iPad(mobile Safari優先)。縦横対応。原則一指。読字不要(ゲーム内に文字を出さない)。
- 一回3〜5分。失敗・時間切れ・減点・ゲームオーバーなし。
- 1mm操作を指に要求しない。大雑把な指操作をゲーム内部で精密制御へ変換する(adaptive gain + magnifier + snap)。

## ゲームフロー(グローバル)

```
boot(loading + audio unlock)
→ establish(全体提示: 四本脚・未接続の第一層・砂箱・ジャッキ・作業員・足場)
→ leg[0..3] それぞれ:
    legIntro(カメラが対象脚へ)
    → sand(gate引き下げ→砂流下→脚下降。目標のわずか下で砂が尽きる)
    → jack(pump handleスワイプ→ピストン伸長→脚上昇。目標へ漸近)
    → snap(許容域到達→スロー→磁気吸着→カコン)
    → wedge(楔ドラッグ→吸着→hammerで一打→lock表示)
    → orbit(中央を回り込み次の脚へ)
→ finalReveal(真上寄り→四接合点が順に光る→第一層沈み込み→音の収束→引きで全体)
→ completeMenu(もう一回=最優先の大ボタン)
```

### 一本の脚の設計(因果を保証する仕掛け)

- 初期状態: 脚は目標より **上** にある(seedで +18〜+30 units)。砂箱の砂が脚を支えている。
- **sand phase**: gateの開度に比例して砂が流下し、砂面と支持部と脚が単調に下降する。目標に近づくほど流下速度が自動低下する。砂の総量はseedで「目標のわずか下(−2〜−5 units)」で尽きるように決まっている。つまり砂だけでは必ず少し下がり過ぎで終わる(それ以上は行き過ぎない)。
- **jack phase**: pump一往復ごとにピストンが伸び、脚が単調上昇。残距離に応じて一回の移動量が縮小(adaptive gain)し、**目標を超えない**(連打してもovershootなし)。許容域(snapTolerance)へ入った瞬間snapへ。
- この構成により、4歳児は必ず「砂=下がる」「ジャッキ=上がる」の両方の因果を毎回体験する。
- units は内部mm相当の抽象値。数値・座標・「1mm」表示は一切画面に出さない。子が見るのは「この丸とこの丸をぴったり合わせる」だけ。

### ずれの提示

- 通常の全景 + 誇張されたalignment pin(脚側) + 半透明target ring(第一層大桁側)。
- 残距離が閾値以下になったら画面の一部に機械式magnifier(真鍮の丸枠)が自然に出て、同じ3D接合部をrender-to-textureで拡大表示。抽象的な別画面にしない。
- 近接でring glow、一致でalignment glow。

### seedによる4本の変化

seedから各脚に: 初期ずれ量、砂量(=undershoot量)、必要pump回数、カメラ方位、足場小物の配置、音のピッチ変化を決める。同じseedなら同じ初期ずれ(deterministic)。

## 4歳児UX規則(全ownerが遵守)

- 一場面一動詞。sand中はgateのみ、jack中はpumpのみ、wedge中は楔のみが操作対象。
- 「下げる」「上げる」を色ではなく道具と動きで区別(砂箱=木+砂、ジャッキ=黒鉄+真鍮)。
- primary touch target ≥ 72 CSS px。drag corridorは太く(±60px以上ずれても追従)。
- 近接吸着: 操作ハンドルの近く(半径96px)を触れば掴んだ扱い。
- 無操作3秒で対象ハンドルが軽くpulse(hint)。5秒で半透明の手がdemonstration animation。操作開始で即消える。
- 間違い(逆方向スワイプ・連打・途中で指を離す・画面外へドラッグ)を罰しない。全て安全に回復。
- 目標に近いほど制御が易しくなる(速度低下・gain縮小・吸着)。
- completeMenuは「もう一回」を最大・中央に。文字なし(↻ pictogram)。
- 全pictogram、文字を隠しても完全ループ可能。

## 必須の製品機能

loading画面 / 初回タップでのaudio unlock / pause・resume(visibilitychange含む) / safe area対応 / portrait・landscape両layout / orientation途中変更で状態保持 / prefers-reduced-motion対応(カメラ移動を短縮・粒子減) / sound toggle / deterministic mode(?seed=N) / WebGL失敗時のerror fallback表示 / console errorゼロ / placeholder・TODO・debug UIなし。

## 完成条件(出荷ゲート)

1. 文字を読まずに一周(4本+finale+replay)できる
2. 砂→下降、jack→上昇の因果が同一画面で明瞭
3. snapの瞬間が気持ちよい(スロー+共鳴音+カコン)
4. 四本目完成が最大の報酬になっている
5. 縦横両方で全操作可能
6. replay 20回でWebGLリソースリークなし
7. `npm run verify` exit 0(typecheck/lint/unit/build/e2e)
8. 4 viewportのQAスクリーンショット
9. 重大レビュー指摘ゼロ
10. `docs/QUALITY_REPORT.md` に証拠つきで記録
