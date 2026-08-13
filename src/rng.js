// 決定的な擬似乱数（毎回すこしだけ違う庭・虹をつくるため）。
// E2E テストでは seed を固定できる。

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const rng = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * rng()) ;
  rng.pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  return rng;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
