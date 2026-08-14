# どうぶつチョコビスケットこうじょう

**Animal Chocolate Biscuit Factory** — a mobile web toy for four year olds.
Roll a drum, print animal faces onto a long beige band, cut it, bake it, plug a
nozzle into the back, squeeze the chocolate in, and finally break one open.

Built with [three.js](https://threejs.org/); no art assets — every texture is
drawn with Canvas2D at boot, so the whole thing is one small bundle.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run lint
npm run test:e2e   # Playwright play-through, portrait and landscape
```

`?stage=N` jumps straight into a step (used by the tests). `?fast=1` forces the
low-cost render path.

## The shape of the game

The whole design is a slow reveal. A four year old does not know what they are
making until roughly three quarters of the way through: every camera up to that
point is a close-up, and the finished product simply is not on screen. The wide
shot in step 11 is the first time they see a tray of biscuits, and the break in
step 13 is the first time they see the chocolate.

```
watch  → a long pale band flows in from a roll.  "What is this?"
turn   → a drum prints cat, dog, rabbit, elephant, giraffe, panda, bear, lion
turn   → a blade drum chops the band into small pieces
push   → the pieces travel through an oven and turn golden and puffy
plug   → the camera dips underneath: there is a little hole down there
press  → chocolate spreads inside, seen through a temporary cutaway
         (then it cools, and the biscuit goes solid and secretive again)
reveal → the camera pulls back for the first time: a whole tray of them
break  → pull one apart: crumb outside, glossy chocolate inside
```

## One module, one verb

Each step of the line is a module in `src/modules/`, and each module owns
exactly one verb, one gesture and one camera shot:

| module             | verb            | gesture              |
| ------------------ | --------------- | -------------------- |
| `watch-band`       | 見る            | tap to start         |
| `print-roller`     | 回す → 印刷     | circle the drum      |
| `cut-roller`       | 回す → 型抜き   | circle the drum      |
| `bake-oven`        | 通す → 焼き色   | drag along the belt  |
| `dock-nozzle`      | 差す → 接続     | drag the nozzle up   |
| `fill-choco`       | 押す → 注入     | press and hold       |
| `reveal-lineup`    | 引き            | (cinematic)          |
| `snap-biscuit`     | 割る → 断面     | tap, then pull sideways |

Modules never touch each other. They talk to a shared context (`src/game.js`)
that hands them the world, the camera rig, the wordless HUD and the sound kit,
and they call `finish()` when their verb is done.

## Notes on the build

**Camera chain, never a free camera.** `src/core/camera-rig.js` takes a point to
look at, a direction to look from and the smallest box that must stay on screen,
then solves the distance for the current aspect ratio. That is what makes
portrait and landscape both work without a second set of hand-tuned numbers:
portrait gets extra height (machine tops, conveyor legs, crates in the
foreground), landscape gets extra width along the line.

**The band and the biscuits share one texture.** `src/art/textures.js` keeps a
single 2048×256 canvas of eight cells. The print roller reveals a cell at a time
as the band rolls out from under the drum; the cut biscuits, the whole tray and
the biscuit you finally break all sample the same cells through a per-instance
`aCell` attribute. The cat you printed first really is the cat you break open.

**Instancing.** The eight biscuits on the line and the ~54 on the tray are two
`InstancedMesh`es, one draw call each. Baking is a shader effect — a bake line
in world X that tints and puffs each biscuit as it crosses — so browning a whole
batch costs one uniform, not 8 material updates.

**Chocolate.** The filling is a real mesh with a radial cutoff in the shader,
growing outwards from the injection hole. While the finger is down the shell's
two flat faces fade to a cutaway and the crumbly rim stays solid, so the biscuit
keeps its silhouette; the moment it is full, it goes opaque again.

**The break.** An intact biscuit is one seamless mesh. It is swapped for two
overlapping halves at the instant it snaps, which is why nothing on screen ever
hints at a seam beforehand, and why the halves can overlap enough for the
chocolate to stand proud of the crumb at the cut face.

**No words anywhere.** Every instruction is an animated finger drawn in SVG
(`src/ui/hud.js`): a circling dot for the rollers, an arrow for the drag, a
pulsing ring for the hold, two arrows pulling apart for the break. The only
buttons are a speaker and a "again" arrow.

**Sound** is synthesised on the fly with WebAudio (`src/core/audio.js`), created
after the first touch so iOS lets it play.

## Performance

Aimed at a mid-range iPhone: MeshPhongMaterial throughout, no shadow maps (soft
blob shadows instead), device pixel ratio capped at 2 (1.5 on low-end devices,
detected by core count), the printed band's canvas uploaded at most 30 times a
second and only when a face is actually being printed.
