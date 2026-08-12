// tests/e2e/helpers/viewports.ts
// Re-exports the ACCEPTANCE.md viewport/state matrix from scripts/ so specs
// only need one import path.

export {
  ACCEPTANCE_VIEWPORTS,
  KEY_STATES,
  captureState,
  type AcceptanceViewport,
  type KeyState,
} from '../../../scripts/screenshotMatrix';
