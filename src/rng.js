// 決定論的な擬似乱数。
// 「まったく同じ雨」をもう一度降らせる必要があるので、
// Math.random() はゲーム中いっさい使わない。

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return function rng() {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function rngRange(rng, a, b) {
  return a + (b - a) * rng();
}

export function rngInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

export function rngPick(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}
