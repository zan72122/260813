// シミュレーションの調整用。ブラウザなしで走らせて数字を見る。
//   node tools/probe.mjs [scenario...]
import { createCity, TT, idx } from '../src/city.js';
import { createSim, resetWater, stepSim, openDrain, setWall, RUN_TICKS, rainRate } from '../src/sim.js';

function landWater(sim) {
  let s = 0;
  for (let i = 0; i < sim.d.length; i++) if (sim.city.type[i] !== TT.RIVER) s += sim.d[i];
  return s;
}

function roadWater(sim) {
  let s = 0;
  for (let i = 0; i < sim.d.length; i++) {
    const t = sim.city.type[i];
    if ((t === TT.ROAD || t === TT.CROSS) && sim.d[i] > 0.004) s++;
  }
  return s;
}

function plazaWater(sim) {
  let s = 0, mx = 0;
  for (let i = 0; i < sim.d.length; i++) {
    const t = sim.city.type[i];
    if (t === TT.PLAZA || t === TT.CURB || t === TT.RAMP) { s += sim.d[i]; if (sim.d[i] > mx) mx = sim.d[i]; }
  }
  return { sum: s, max: mx };
}

function run(sim, label, trace = false) {
  resetWater(sim);
  const marks = {};
  for (let t = 0; t < RUN_TICKS; t++) {
    stepSim(sim);
    if (trace && t % 150 === 0) {
      const p = plazaWater(sim);
      console.log(`  t=${String(t).padStart(4)} land=${landWater(sim).toFixed(1)} roadcells=${roadWater(sim)} plaza=${p.sum.toFixed(1)}/${p.max.toFixed(3)} under=${sim.stats.under.toFixed(2)} drained=${sim.stats.drained.toFixed(1)}`);
    }
  }
  for (const k of Object.keys(sim.flags)) marks[k] = sim.flags[k];
  const p = plazaWater(sim);
  return {
    label,
    under: +sim.stats.under.toFixed(2),
    plazaMax: +sim.stats.plaza.toFixed(3),
    shop: +sim.stats.shop.toFixed(3),
    drained: +sim.stats.drained.toFixed(1),
    wet: sim.stats.wet,
    land: +landWater(sim).toFixed(1),
    plazaPeak: +p.max.toFixed(3),
    marks,
  };
}

const city = createCity();
const sim = createSim(city);

const args = process.argv.slice(2);
const scenarios = args.length ? args : ['base', 'clean', 'bigdrain', 'wallN', 'wallE'];
const out = [];

for (const s of scenarios) {
  // 街の状態をもとにもどす
  for (const d of city.drains) {
    d.state = d.id === 'plaza' ? 'clogged' : d.id === 'big' ? 'closed' : 'open';
    d.flow = 0;
    if (d.id === 'plaza') d.leaves = 9;
  }
  setWall(sim, null);

  if (s === 'clean') openDrain(sim, 'plaza');
  if (s === 'bigdrain') openDrain(sim, 'big');
  if (s === 'wallN') setWall(sim, { x: 40, y: 51, horizontal: true, len: 11 });
  if (s === 'wallE') setWall(sim, { x: 54, y: 65, horizontal: false, len: 11 });
  out.push(run(sim, s, s === 'base' || args.length === 1));
}

console.table(out.map((o) => ({
  scenario: o.label, under: o.under, plazaMax: o.plazaMax, shop: o.shop,
  drained: o.drained, wetCells: o.wet, leftOnLand: o.land,
})));
for (const o of out) console.log(o.label, 'marks:', JSON.stringify(o.marks));
console.log('rain total(approx):', (() => { let s = 0; for (let t = 0; t < RUN_TICKS; t++) s += rainRate(t); return Math.round(s); })(), 'drops');
