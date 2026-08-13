# 偏光レインボー工場 — Polarisation Rainbow Factory

とうめいな プラスチックを リングで まわすと、なかから にじが でてきます。
よんさいの こどもが、ゆびいっぽんで あそべます。

A one-finger toy for four-year-olds. A piece of clear, colourless plastic sits
on a light box. Turn the big ring and the light behind it goes dark while the
plastic blazes into magenta, cyan, emerald and gold. Press it and the rainbow
bends around your finger.

No words, no timer, no score, no way to lose.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview
```

## How it plays

1. A clear part rides in on the workshop rail. Tap to set it on the light stage.
2. Turn the big ring with one finger. The first turns show almost nothing —
   then faint violets, then pastels, then the field behind the part goes dark
   and the part fills with colour. Keep turning; it never stops changing.
3. Press the part. Stress spreads from your fingertip and the rainbow ripples
   outward from it.
4. Two more parts arrive. Tap to set them down beside the first.
5. Turn the giant polarising window and the entire workshop becomes stained
   glass.
6. 🔁 the same piece again, or ✨ a brand new one.

Nothing blocks: if a child waits, the part pulses, the ring shivers, a hand
appears — and after a few more seconds the game does the step itself.

## Why the colours look like that

They are not an HSV rainbow. They are computed the way the real effect works.

Squeeze a transparent polymer and it becomes birefringent: the two
polarisation components travel at different speeds and come out with a
retardation `δ` (nanometres) between them. Between a polariser at `θp` and an
analyser at `θa`, with the local slow axis at `φ`, the transmitted intensity at
wavelength `λ` is

```
I(λ) = cos²(θa−θp) − sin(2(φ−θp))·sin(2(φ−θa))·sin²(π·δ/λ)
```

The wavelength-dependent part factors out cleanly, so the shader only needs

```
colour = A·white + B·ML(δ)      A = cos²(θa−θp)
                                B = −sin(2(φ−θp))·sin(2(φ−θa))
```

`ML(δ)` is the Michel-Lévy colour: `sin²(πδ/λ)` integrated against the CIE 1931
colour matching functions. It is baked once on the CPU into a 1024-entry
lookup (`src/spectrum.js`), so the whole thing costs one texture fetch.

This is what buys the beauty, and every bullet the design asked for falls out
of it for free:

- **fine local fringes** where `δ` changes fast (the rim band)
- **large soft colour fields** where it changes slowly (the thickness dome)
- **dark boundaries** — the isogyre brushes where `sin(2(φ−θ))` crosses zero,
  which *sweep across the piece as you turn the ring*
- **colours that mix**, because it is a real spectral integral
- **transparent → vivid**, because `A = cos²` starts at 1 (parallel, white,
  invisible) and falls to 0 (crossed, dark field, full colour)

Two more real-optics tricks do a lot of work:

- Each piece carries a uniform retardation bias — a petrographer's *first-order
  tint plate*. It parks the flat areas on a saturated magenta or cyan so small
  stress changes swing the colour hard, and it gives every piece its own hero
  colour instead of everything landing on yellow.
- The analyser disc darkens the backlight across the whole aperture, not just
  through the part. That is what a real polariscope does, and it is what makes
  the reveal land: the room dims and the plastic lights up.

The stress field itself (`drawObject` in `src/shaders/scene.js`) is procedural
and modelled on injection-moulded plastic: a thickness dome, a stress band
hugging the rim, spokes radiating from the moulding gate, slow blobs, and
whatever the player's finger is adding.

## Structure

| file | what it does |
| --- | --- |
| `src/spectrum.js` | CIE fits → Michel-Lévy LUT |
| `src/shaders/scene.js` | the whole optical scene in one pass |
| `src/shaders/post.js` | bright-pass, blur, composite (tonemap, sparkle, dither) |
| `src/renderer.js` | WebGL2 with a WebGL1 fallback, HDR targets when available |
| `src/game.js` | stage machine, camera springs, uniform packing |
| `src/shapes.js` | seeded piece recipes and their stress character |
| `src/main.js` | input assist, hints, adaptive resolution |
| `src/audio.js` | synthesised pentatonic chimes and pad |

Everything transparent is composited inside one fragment shader, so there is no
transparency sorting anywhere.

## Mobile

- WebGL2 preferred, WebGL1 supported; half-float render targets when the
  device offers them, 8-bit with a prescale when it does not.
- `devicePixelRatio` capped at 2 *and* at a 2.6 MP budget.
- Adaptive resolution scale and a three-step quality ladder (two blur passes →
  one → bloom and sparkles off) driven by measured frame time.
- Portrait and landscape are both first-class: the subject is sized against the
  short edge, so the ring and the part stay large either way. Rotating the
  device never resets anything.
- Safe-area insets respected; every touch target is at least 52 px.
- One pointer only — extra fingers are ignored rather than fighting the first.
- The ring accepts sloppy input: near the rim it uses the tangential component,
  near the middle it falls back to plain left/right, and it blends between
  them. Releasing mid-spin leaves a flywheel.

## Checking it

```bash
npm run build
npm run test:smoke     # 7 state/render smoke tests, Chromium, workers=1
npm run shots          # stills of the whole chain at 4 device sizes → shots/
node scripts/variety.mjs   # the same beat across 8 seeds → shots/variety/
node scripts/montage.mjs shots/variety shots/_variety.png
```

The smoke tests cover: it boots and draws; it starts colourless and ends
colourful; every 15° of rotation changes the picture; the whole chain reaches
the finale; 🔁 keeps the piece and ✨ replaces it; rotating the device keeps all
state; and a sloppy one-finger swipe anywhere turns the ring.

Software WebGL (SwiftShader) runs far slower than wall-clock, so the harness
waits on *rendered frames* rather than timers. Frame rate, smoothness and final
visual quality must be judged on real hardware — not from these runs.
