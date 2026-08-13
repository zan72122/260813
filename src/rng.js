// ちいさな決定論的乱数（テストでシードを固定できるように）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const rand = mulberry32(seed);
  return {
    seed,
    next: rand,
    range: (a, b) => a + (b - a) * rand(),
    int: (a, b) => Math.floor(a + (b - a + 1) * rand()),
    pick: (arr) => arr[Math.floor(rand() * arr.length) % arr.length],
    sign: () => (rand() < 0.5 ? -1 : 1),
  };
}
