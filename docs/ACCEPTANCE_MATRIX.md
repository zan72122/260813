# ACCEPTANCE_MATRIX — definition of done

Every row must be ✅ (with evidence noted in VERIFICATION.md) before release.
Status values: ☐ untested / ✅ pass / ❌ fail.

## Final status — release judgment 2026-08-13

All rows below judged ✅ after fix round 1. Evidence: `docs/VERIFICATION.md`
(initial run + "Fix round 1" section). Machine-verified rows: A1–A6, B1–B6
(via full-loop real-gesture e2e + screenshots), C1, C4, C6, C7, D1–D6,
E1–E3, E5, F1, F2 (peak 112 ≤ 120), F4, F5, F6. Verified by code review +
targeted tests rather than a dedicated automated assertion: C2 (72px CSS +
padded raycast, reviewer-confirmed), C3 (hint timers reviewer-confirmed;
reduced-motion gating machine-tested in `e2e/reduced-motion.spec.ts`),
C5 (icon-only UI, screenshot review), E4 (no flashing sources in code,
particles modest), F3 (hot-path allocations hoisted in fix round 1;
bounded-heap machine-tested in `e2e/shuffle-leak.spec.ts`).

Environment limitations (recorded, not waived): Chromium only — WebKit
binary and real iPhone/iPad hardware unavailable in this container; iOS
Safari behavior (audio unlock, safe-area, orientation) implemented to spec
but not exercised on real Safari.

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
