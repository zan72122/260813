# CAMERA_STORYBOARD

自由カメラ禁止。全カメラはCinematicBeat（id、duration、開始/終了pose、easing）として定義し、
CameraDirectorが順に実行する。操作フェーズ中はカメラをほぼ固定し、ロープと舞台の対応を壊さない。
Reduce Motion時: beat時間を50%短縮し、揺れ系モーションを無効化。

## 空間レイアウト（ワールド座標の約束）

- 舞台面 y=0。客席はz+側、舞台奥はz−。
- 地下機構室: y=-3.2 〜 0 の空間。舞台床の客席寄り一部が断面（cutaway）として開く。
- 舞台袖flats: x=±2.2〜±3.5 に3対。背景plane: z=-6。前景props: z=-1〜-2。
- プロセニアムアーチ（青白金）が舞台を額縁として囲む。

## 必須カメラ鎖

| Beat | 内容 | 構図 |
|------|------|------|
| B1 establish | 客席中央からSalon舞台全景。ゆっくり僅かに前進(6s)。 | 舞台が額縁内に収まる。青白金の客席が両脇に見切れる。 |
| B2 approach | 舞台床の光る箇所へ寄る(3s)。 | 床のハッチ/断面線が画面中央下。 |
| B3 tilt-down | 床を突き抜けず、断面が開いて地下へtilt+下降(3s)。 | 舞台床が「模型の断面」として切れ、地下が現れる。 |
| B4 mechanism-action | **最重要・pull中固定。** 地下と舞台を同時に見る断面ビュー。 | 下記「断面構図」参照。 |
| B5 audience reveal | progress=1後、客席側へ戻り新しい景を披露(4s)。 | B1と同アングルで before/after が比較できる。 |
| B6 lateral move | 左右へゆっくり平行移動(4s)。 | 袖・背景・前景の層のparallaxが見える。flatsらしさが少し分かる。 |
| B7 finale | やや引いてfootlights・カーテンを収める。 | 額縁全体。 |

## B4 断面構図（ViewportProfileで切替）

### 縦画面（優先構図）
- 一台のカメラで一枚の断面図: 上半分=舞台（袖・背景が動く）、下半分=地下（ロープ・滑車・ドラム）。
- カメラはz+側からやや見下ろし、FOVと距離をaspectから算出して両方を確実にフレームイン。
- ロープゾーンは画面下半分。指と舞台の重なりを避ける。

### 横画面
- 同一シーンのまま、カメラを引いて横構図の断面: 左=地下機構が見える断面、右=舞台。
- またはカメラ位置をx−側へオフセットし、機構を左、舞台を右に配置。
- 操作対象（ロープ）が指やUIで隠れないこと。

二重render pass（2 viewport分割render）は使わず、単一カメラの断面構図で成立させる（性能予算のため）。

## 画面回転・resize

orientation change時: GamePhase、StageTransformProgress、ロープ把持状態を維持し、
現在のbeatを新しいViewportProfileのposeへ0.3sで補間。進捗・位置の喪失は不合格。

## before/after比較

B1（Salon）とB5（Forest/Rustic）は同一アングル。E2Eスクリーンショットで直接比較できることが受入条件。
