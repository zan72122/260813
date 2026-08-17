# The Mystery Animal — a word-morphing 3D picture book

A tap-through 3D animation (Three.js) that explains this English sentence
so a 4-year-old can feel what it means:

> **"Putting it all together, I'd say it's a medium-sized female who hops
> every few steps!"**

Every single word of the sentence — articles and contractions included —
appears as big 3D text, then morphs into an object that acts out its
meaning. Scene by scene the objects build the answer: a medium-sized
female kangaroo (joey in her pouch) who walks a few steps, then… HOP!

| # | Word | Becomes |
|---|------|---------|
| 1 | Putting | a hand putting blocks down |
| 2 | it | a wobbling mystery box “?” |
| 3 | all | puzzle pieces raining down (all the clues) |
| 4 | together, | the pieces snapping into one ball |
| 5 | I'd | a little detective (splits into “I” + “'d”) |
| 6 | say | a speech bubble |
| 7 | it's | the mystery box glowing in the bubble (splits “it” + “'s”) |
| 8 | a | one single spotlight |
| 9 | medium-sized | small / MEDIUM / large silhouettes — medium stays |
| 10 | female | pouch appears, joey pops out |
| 11 | who | a “?” that orbits her, then an arrow pointing at her |
| 12 | hops | a spring — and she hops! |
| 13 | every | footprints appearing in rhythm |
| 14 | few | counting 1-2-3 on the footprints |
| 15 | steps! | a foot stamping the whole trail |
| 16 | ! | confetti finale: walk-walk-walk-HOP across the path |

## Run it

Open **`index.html`** in any browser. No server, no network needed —
Three.js is inlined. Tap / click / press space to advance.

## Develop

- `src/app.js` — all animation code
- `src/template.html` — page shell + UI styles
- `vendor/three.min.js` — Three.js r147 (UMD)
- `./build.sh` — inlines everything into `index.html`

## Test

```bash
npm install
npm test        # Playwright Chromium smoke test
```

The smoke test loads `index.html?test=1` (fixed random seed, ~25× speed,
state exposed on `window.__state`) and advances all 16 scenes, asserting
no page errors.
