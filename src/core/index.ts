/**
 * Internal barrel for src/core — engine loop, quality manager, resize and
 * context-recovery plumbing. Not the Wave-3 public API surface (that is
 * src/render/index.ts); this just keeps intra-owner imports tidy across
 * core/render/scene/visual.
 */
export * from './engineLoop';
export * from './qualityManager';
export * from './resize';
export * from './contextRecovery';
export * from './debounce';
