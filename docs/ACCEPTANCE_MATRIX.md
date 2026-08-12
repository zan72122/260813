# ACCEPTANCE_MATRIX — definition of done

Every row must be ✅ (with evidence noted in VERIFICATION.md) before release.
Status values: ☐ untested / ✅ pass / ❌ fail.

## A. Play loop completeness

| ID | Criterion | How verified |
|----|-----------|--------------|
| A1 | Title → cleanup → lunch setup → lunch cleanup → nap → wake → replay completes end-to-end with no dead ends | Playwright full-loop test |
| A2 | First meaningful interaction possible < 10 s after load (dev-server & prod build) | Playwright timing |
| A3 | No placeholder screens, TODOs, dead buttons anywhere | grep + manual screenshot review |
| A4 | Replay "same day" reachable in ≤ 2 taps from REPLAY | Playwright |
| A5 | Shuffle replay uses a new seed; free play mode lets room morph freely | Playwright + manual |
| A6 | 3 curated seeds (?seed=1/2/3) produce visibly different toy layout / mat colors / weather | Screenshots diff |

## B. Signature moments

| ID | Criterion |
|----|-----------|
| B1 | Toy magnet-snap: sloppy drop near correct basket succeeds; bounce + per-material sound + basket wiggle |
| B2 | Wrong-basket drop returns toy gently, no penalty |
| B3 | Lunch transform is 2–4 separate finger operations; room light/sound shifts; NPCs seat |
| B4 | Mat unroll follows long swipe progressively (not a single tap-to-play animation) |
| B5 | Nap reveal: curtain closes, warm dim light, quiet soundscape, ceiling stars |
| B6 | Wake restore returns room to bright playroom; framing echoes title for before/after |

## C. Input & kid-UX

| ID | Criterion |
|----|-----------|
| C1 | Entire game playable with one finger; tap/drag/swipe/trace/hold only |
| C2 | Touch targets ≥ 72 CSS px (HTML) / padded raycast (3D) |
| C3 | 3 s idle → wiggle hint; 7 s idle → ghost gesture trail |
| C4 | Camera locked during drags; no cut at cause→effect moments |
| C5 | No text reading required anywhere in the flow |
| C6 | No timers, scores, stars, fail states |
| C7 | Misdrops never soft-lock progress |

## D. Platform & responsive

| ID | Criterion |
|----|-----------|
| D1 | Playable at 393×852, 852×393, 834×1194, 1194×834 (Chromium; WebKit if available) |
| D2 | Orientation change mid-phase preserves game state and re-lays-out camera + UI |
| D3 | Reload lands back on a working title screen (no broken persisted state) |
| D4 | safe-area-inset respected (no UI under notch/home bar) |
| D5 | Zero console errors / unhandled rejections across the full loop in all viewports |
| D6 | Production build succeeds; preview serves a playable game |

## E. Audio & accessibility

| ID | Criterion |
|----|-----------|
| E1 | AudioContext starts only after first user gesture; no autoplay warnings break audio |
| E2 | Mute toggle works and persists; game fully playable muted |
| E3 | Reduced-motion (OS pref or toggle) simplifies motion; game still completable |
| E4 | No flashing > 3 Hz; particles modest by default |
| E5 | localStorage stores only settings + seed |

## F. Performance & quality

| ID | Criterion |
|----|-----------|
| F1 | DPR capped; adaptive quality path exists |
| F2 | Peak draw calls ≤ ~120 (measured via renderer.info in test harness) |
| F3 | No per-frame allocations in hot paths (spot-check), stable frame time in Chromium trace |
| F4 | Render loop throttled when tab hidden |
| F5 | lint, typecheck, unit tests, e2e tests, prod build all green |
| F6 | THIRD_PARTY_NOTICES.md lists all deps/licenses; no external asset hotlinks |
