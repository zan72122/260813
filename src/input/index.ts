// src/input/index.ts
// Barrel export for the input layer. See docs/CONTRACTS.md wiring conventions
// ("Worker C: registerInput(ctx)").

export { registerInput } from './pointer';
export {
  createCircularGestureTracker,
  type CircularGestureTracker,
  type CircularGestureTrackerOptions,
  type GestureSample,
  type GestureDelta,
} from './circularGesture';
export {
  getWhistleHotspot,
  isInsideHotspot,
  FALLBACK_WHISTLE_HOTSPOT,
  type Hotspot,
  type VersaillesHotspots,
} from './hotspots';
