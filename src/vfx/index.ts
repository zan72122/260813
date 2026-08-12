// src/vfx/index.ts
// Barrel export for the VFX factory group Worker B owns (src/vfx/**). See
// docs/CONTRACTS.md wiring conventions: the Integrator wires these onto
// Worker A's SceneAnchors (src/scenes/anchors.ts); factories here stay
// parameter-driven and never reach into scene/game state themselves.

export { createWaterJet } from './waterJet';
export type { WaterJet, WaterJetKind } from './waterJet';

export { createPipeFlow } from './pipeFlow';
export type { PipeFlow } from './pipeFlow';

export { createBasinWater } from './basinWater';
export type { BasinWater } from './basinWater';

export { createFinaleRainbow } from './rainbow';
export type { FinaleRainbow } from './rainbow';

export { globalParticleBudget, GLOBAL_PARTICLE_BUDGET } from './particlePool';
export { DropletEmitter } from './droplets';
