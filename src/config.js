// Global tuning + runtime profile.
// Everything that a 4-year-old's fingers touch is intentionally over-forgiving.

const params = new URLSearchParams(globalThis.location?.search ?? '');

/** Deterministic, cheap mode used by E2E on software rendering. */
export const FAST =
  params.get('fast') === '1' ||
  globalThis.__E2E_FAST__ === true;

export const QUALITY = FAST
  ? { grid: 48, texSize: 128, dpr: 1, particles: false, shadows: false, gummyCap: 18 }
  : { grid: 144, texSize: 256, dpr: 2, particles: true, shadows: false, gummyCap: 40 };

// `?dpr=1` keeps full geometry quality while cutting fill cost - handy on a
// software rasteriser, harmless on a real device.
const dprOverride = Number(params.get('dpr'));
if (Number.isFinite(dprOverride) && dprOverride > 0) QUALITY.dpr = dprOverride;

/** Fixed seed so tests (and the powder lumps) are reproducible. */
export const SEED = 1337;

// ---------------------------------------------------------------------------
// Palette. The world starts achromatic on purpose: the first colour the child
// ever sees is the juice in the nozzles.
// ---------------------------------------------------------------------------
export const WHITE_WORLD = {
  bg: '#f0ece4',
  bgDeep: '#d5cbbb', // the table: darker than the starch so the heap reads
  powder: '#fdfbf7',
  powderShade: '#c2b8a8',
  tray: '#b9b2a8',
  trayDark: '#8d867c',
};

export const JUICE = [
  { id: 'red', hex: '#ef3b5b', name: 'あか' },
  { id: 'yellow', hex: '#ffc93c', name: 'きいろ' },
  { id: 'orange', hex: '#ff8a3d', name: 'だいだい' },
  { id: 'green', hex: '#57c95b', name: 'みどり' },
  { id: 'pink', hex: '#ff79b0', name: 'ぴんく' },
];

// ---------------------------------------------------------------------------
// Tray / powder geometry (world units, 1 unit ~= 1cm of a toy factory)
// ---------------------------------------------------------------------------
export const TRAY = {
  w: 12,
  d: 8,
  rim: 0.55,
  powderTop: 0.0,
  lumpAmp: 0.42, // height of the unflattened lumps
  cavityDepth: 0.95, // how deep the stamp bites
  moundAmp: 1.95, // height of the powder mountain after the flip
  // The heap is wider than the tray: turned-out gummies must sit well inside
  // it, never poking through the tapered edge before the child has brushed.
  moundW: 15.5,
  moundD: 11,
  turnOutSpread: 0.72, // how far the gummies scatter when the tray is lifted
};

/** Cavity grid inside the tray (stamp presses all of them at once). */
export const LAYOUT = { cols: 5, rows: 3, padX: 1.5, padZ: 1.35 };

// ---------------------------------------------------------------------------
// Forgiveness. These numbers are the accessibility budget for small hands.
// ---------------------------------------------------------------------------
export const FORGIVE = {
  nozzleSnapRadius: 4.2, // world units - "near enough" is enough
  brushRadiusPx: 62, // fat brush
  // The brush runs ahead of the finger so a small hand never covers the find.
  // Specified in SCREEN pixels and converted to a world offset per frame, so
  // the gap looks the same on a narrow phone and a wide tablet.
  brushLeadPx: 84,
  brushLeadWorldRange: [0.7, 3.6],
  brushLeadMinPx: 40, // the floor the E2E suite holds us to
  swipeToFlatten: 1.0,
  flipSwipePx: 90,
  idleHintMs: 6500,
  idleAssistMs: 22000,
};

export const TIMING = {
  stampSlamMs: 260,
  stampLiftMs: 620,
  setCureMs: 2600, // time-compressed curing
  flipMs: 1500,
  polishMs: 900,
};
