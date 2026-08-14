# しろい こなの こうじょう — a powder factory for four-year-olds

A mobile web game for iPhone and iPad. A child levels a tray of white starch,
presses a big stamp into it, pours coloured juice into the holes it leaves,
turns the whole tray over, and then **digs the result back out of the powder
with a brush**.

The thing that comes out is a tray of gummies. The game never says so, and
never shows one, until the child uncovers it.

```
まっしろ。なにこれ？
  → 粉を平らにする → 型を押す → 穴ができる
  → 「穴に色のジュースを入れるんだ」 → 固まる
  → トレイをひっくり返す → 「どこに行った？」
  → ブラシで払う → 色 → 輪郭 → 形 → 「グミだ！」
```

## Running it

```bash
npm install
npm run dev       # http://localhost:5173  (open it on the phone over LAN)
npm run build && npm run preview
```

Useful query flags:

| flag | effect |
| --- | --- |
| `?fast=1` | deterministic low-cost profile (small grid, no particles, dpr 1) |
| `?dpr=1` | full geometry, cheap fill — for software rasterisers |

## The rule that outranks every other rule

**No colour, no gummy silhouette, no product name before the child pours.**

* The page title, the icon and the opening screen say `しろい こな` — *white
  powder*. Nothing else.
* Tray, stamp, scraper, brush, HUD accent and background are all achromatic
  greys until stage 5.
* The first colour in the world is the juice inside the nozzle the child picks
  up. `--accent` in the HUD only turns colourful at that moment.
* After the flip, every gummy is forced back to `dust = 1`, which paints it
  starch-white and softens its silhouette — the world is monochrome again right
  before the reveal.
* `__GAME__.state().colorsVisible` reports every gummy colour currently legible
  on screen. The E2E suite asserts it is empty at boot, empty after the flip,
  and empty at the start of every free-play round.

## Stages, gestures and camera

| # | stage | gesture | camera |
| --- | --- | --- | --- |
| 1 | `title` | tap | 斜め上方 `tray` |
| 2 | `flatten` | swipe sideways with the scraper | `tray` |
| 3 | `stamp` | drag the stamp **down** | 低めの接写 `stamp` |
| 4 | `lift` | (auto) the holes are left behind | `stamp` |
| 5 | `pour` | pick a colour, press near a hole | macro `pour`, follows the hole |
| 6 | `cure` | (auto, time-compressed) liquid → springy solid | `tray` |
| 7 | `flip` | one big arc swipe turns the tray over | pulled back `flip` |
| 8 | `dig` | **rub with the brush** | very close oblique `dig` — never cut |
| 9 | `polish` | roll / rub | `polish` |
| 10 | `finale` | (auto) the table fills up | 全景 `finale` |
| 11 | `free` | brush only, new shapes and colours each round | `dig` |

Shots are declared as *a direction plus how much world must be in frame*
(`src/view.js`); the rig solves the distance. The same presets therefore frame
correctly on a 390×844 phone in portrait and a 1080×810 tablet in landscape,
with no per-device numbers.

During `dig` the camera is set once and left alone. The finger, the retreating
powder and the emerging gummy stay in one continuous frame — that causal link
is the whole point of the game.

## How the powder is faked

There is **no powder simulation**. Three grayscale canvases drive one
displacement shader (`src/powder.js`):

| channel | meaning | written by |
| --- | --- | --- |
| `rough` (alpha) | how lumpy the surface still is | flatten swipes, `destination-out` |
| `cavity` (red) | the holes bitten by the stamp | `Path2D` fills of the same polygons the gummies are extruded from |
| `cover` (alpha) | how much powder is still lying there | brush strokes, `destination-out` |

The vertex shader displaces a plane by `heightAt(uv)` and derives its normal
from finite differences of the *same* function, so a brush stroke becomes a
visible groove in one frame. The fragment shader discards where `cover` falls
below a noise-dithered threshold, which gives a crumbly grain edge rather than
a cut polygon.

The brush paints three passes — widest and faintest first. That is what stages
the reveal: powder *thins* over a gummy (colour bleeds through, silhouette
still soft) before it is *gone* (outline, then whole shape). Per-gummy `dust`
is sampled from the `cover` mask and lagged, so the last of the starch visibly
wipes off.

Gummies are `InstancedMesh` — one per silhouette, six silhouettes, a few draw
calls for the whole table. Bounce is squash/stretch baked into the instance
matrix. Liquid rising in a cavity is the same instance scaled in Y from zero.

## Forgiveness for small hands

Everything in `FORGIVE` (`src/config.js`) is an accessibility budget:

* **The nozzle snaps.** Anywhere within `4.2` world units of a hole (a third of
  the tray) counts as aiming at it; if the nearest empty hole is further than
  that the nozzle still leans towards it. Juice is never wasted. When a hole
  fills, the nozzle re-snaps to the next one so a child can fill the tray with
  one continuous drag.
* **The reveal happens above the fingertip.** The brush contact point sits
  `brushLeadPx: 84` *screen pixels* further from the camera than the touch, so
  a small hand never covers the thing it is uncovering. The pixel figure is
  converted to a world offset every frame (`Game.brushLeadWorld`) — a tall
  phone frames the reveal on width, which makes a world unit worth far fewer
  pixels there than on a tablet, and a fixed world offset would look wrong on
  one of them.
* **The brush is fat** — much wider than a four-year-old's aim.
* **Multi-touch never jams it.** The most recently pressed pointer wins; the
  others are ignored.
* **Nothing is a dead end.** After `idleHintMs` (6.5 s) an animated finger
  demonstrates the gesture; after `idleAssistMs` (22 s) the game quietly does a
  little of the work itself, every stage, so the child is never stranded.
* **No reading required.** One short hiragana line, big icons, and sound.

## Sound

Synthesised with WebAudio at runtime (`src/audio.js`) — no downloads, nothing
to preload, nothing loud. Resumed from a real touch handler for iOS. There is a
mute button in the corner.

## Tests

```bash
npm run lint
npm run test:unit          # shape + budget invariants (vitest)
npm run test:e2e           # Chromium, iPhone/iPad, portrait + landscape
E2E_FAST=1 npm run test:smoke
```

The device descriptors keep their viewport, DPR and user agent but are forced
to Chromium (`browserName: 'chromium'`), and Chromium is taken from
`PLAYWRIGHT_BROWSERS_PATH` when the runner ships a pre-installed build.

`tests/e2e/smoke.spec.js` plays the entire line with synthetic gestures and
asserts the colour discipline at each step. `tests/e2e/reveal.spec.js` encodes
the four questions the brief asks to check on device:

1. is the powder too heavy? → a handful of strokes must uncover gummies
2. does the reveal come in stages? → some gummy must sit strictly between
   buried and clean after a single stroke
3. does the finger hide the find? → the contact point must be >40 px above the
   touch, on every device in the matrix
4. is it obviously a gummy too early? → `colorsVisible` must be empty until the
   child acts

### What these tests cannot tell you

They run on SwiftShader in a headless container. **They do not measure frame
rate, animation smoothness, or final visual quality**, and no assertion here
should be read as evidence about any of those. Judge the feel of the brush,
the weight of the powder and the gloss pass on a real iPhone/iPad, or on a
runner with hardware acceleration.

## Layout

```
src/config.js     tuning, palette, quality profiles, forgiveness budget
src/shapes.js     the six silhouettes, one source for mesh + mask + icon
src/powder.js     height-map / mask / decal starch surface
src/gummies.js    instanced gummies, liquid -> jelly -> gloss shader
src/props.js      tray, stamp, nozzle, brush, scraper, roller
src/particles.js  starch puffs
src/view.js       renderer + the automatic camera rig
src/ui.js         the (very small) DOM HUD
src/input.js      one forgiving pointer
src/game.js       the stage machine
src/main.js       bootstrap + the __GAME__ test surface
```
