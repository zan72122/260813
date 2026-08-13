// Seeded RNG so a session can be reproduced (?seed=123) for tests, while normal
// play gets a fresh pool, light, flowers and finale every time.

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Everything that changes between plays. The star of the show never changes. */
export function makeSession(seed) {
  const rng = makeRng(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const range = (a, b) => a + rng() * (b - a);

  // Floor palettes: deliberately dark and desaturated so the light net is the
  // brightest thing on screen by a wide margin.
  const floors = [
    { name: 'sand',    base: [0.085, 0.098, 0.115], warm: [0.16, 0.135, 0.10], deep: [0.020, 0.045, 0.075] },
    { name: 'aqua',    base: [0.055, 0.098, 0.115], warm: [0.08, 0.15, 0.155], deep: [0.012, 0.038, 0.070] },
    { name: 'rose',    base: [0.100, 0.078, 0.100], warm: [0.17, 0.115, 0.135], deep: [0.030, 0.030, 0.068] },
    { name: 'violet',  base: [0.070, 0.070, 0.120], warm: [0.11, 0.105, 0.175], deep: [0.020, 0.026, 0.075] },
    { name: 'jade',    base: [0.060, 0.100, 0.092], warm: [0.10, 0.155, 0.125], deep: [0.014, 0.042, 0.062] },
  ];

  // Caustic tints: white-hot core plus a faint gold / cyan / pink cast.
  const tints = [
    { warm: [1.00, 0.90, 0.70], cool: [0.62, 0.86, 1.00] },
    { warm: [1.00, 0.84, 0.86], cool: [0.68, 0.92, 1.00] },
    { warm: [1.00, 0.93, 0.78], cool: [0.72, 0.88, 0.98] },
    { warm: [0.99, 0.87, 0.95], cool: [0.60, 0.90, 0.96] },
  ];

  const bloomTypes = [0, 1, 2]; // 0 flower, 1 star, 2 shell
  const bloomCount = 5 + Math.floor(rng() * 3); // 5..7
  const blooms = [];
  for (let i = 0; i < bloomCount; i++) {
    // Poisson-ish scatter: retry a few times to keep them apart.
    let x = 0, z = 0, ok = false;
    for (let t = 0; t < 24 && !ok; t++) {
      const a = rng() * Math.PI * 2;
      const r = 0.18 + Math.sqrt(rng()) * 0.72;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      ok = blooms.every((b) => (b.x - x) ** 2 + (b.z - z) ** 2 > 0.115);
    }
    blooms.push({
      x, z,
      type: pick(bloomTypes),
      size: range(0.085, 0.135),
      phase: rng() * 6.283,
      hue: rng(),
      petals: 5 + Math.floor(rng() * 4),
      energy: 0,
      open: 0,
      opened: false,
      rang: false,
    });
  }

  return {
    seed,
    floor: pick(floors),
    tint: pick(tints),
    // Light comes from a low-ish angle so the net has direction and drama.
    lightAzimuth: range(0, Math.PI * 2),
    lightElevation: range(0.95, 1.30), // radians from horizon
    damping: range(0.74, 0.90),   // amplitude kept per second
    finalePetals: 5 + Math.floor(rng() * 4),
    finaleRings: range(12, 16),
    finaleSpin: rng() < 0.5 ? -1 : 1,
    ambient: range(0.82, 1.15),
    bubbleCount: 6 + Math.floor(rng() * 5),
    blooms,
    rng,
  };
}
