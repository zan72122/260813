// Headless behaviour verification for the crowd sim.
// Runs baseline vs. intervention scenarios and checks that the differences
// a four-year-old is supposed to *see* actually exist in the numbers.
//
//   node tools/verify.mjs

import { createSim, GREEN_SHORT, GREEN_LONG, CROSSWALK_MIN, CROSSWALK_MAX } from '../src/sim.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

function run(label, opts) {
  const sim = createSim({ seed: 42, agentCount: 150, instantGather: true, ...opts });
  sim.pressGo();
  sim.stepSeconds(90);
  const m = sim.lastRun ?? sim.metrics;
  const stuck = sim.agents.filter(a => a.phase === 'cross' || a.phase === 'arrive').length;
  console.log(
    `${label.padEnd(26)} clear=${m.clearTime.toFixed(1).padStart(5)}s ` +
    `crossed=${String(m.crossed).padStart(3)} left=${String(m.leftBehind).padStart(3)} ` +
    `avgSpd=${m.avgSpeed.toFixed(2)} peakJam=${String(m.peakJam).padStart(3)} ` +
    `jamSum=${m.jamSum.toFixed(0).padStart(4)} done=${m.complete} stuck=${stuck}`
  );
  return { m, stuck, sim };
}

const wide = { E: CROSSWALK_MAX, W: CROSSWALK_MAX, S: CROSSWALK_MAX, N: CROSSWALK_MAX };

console.log('--- scenarios (seed 42, 150 agents) ---');
const base = run('baseline (narrow+short)', {});
const wideR = run('wide crosswalks', { crosswalkWidths: wide });
const longR = run('long green', { greenDuration: GREEN_LONG });
const both = run('wide + long', { crosswalkWidths: wide, greenDuration: GREEN_LONG });

// Determinism: same seed twice -> identical positions.
{
  const a = createSim({ seed: 7, agentCount: 120, instantGather: true });
  const b = createSim({ seed: 7, agentCount: 120, instantGather: true });
  a.pressGo(); b.pressGo();
  a.stepSeconds(20); b.stepSeconds(20);
  let same = true;
  for (let i = 0; i < a.agents.length; i++) {
    if (Math.abs(a.agents[i].x - b.agents[i].x) > 1e-9 ||
        Math.abs(a.agents[i].z - b.agents[i].z) > 1e-9) { same = false; break; }
  }
  check('deterministic replay', same);
}

// Reset determinism: run, reset, run again -> same result.
{
  const s = createSim({ seed: 9, agentCount: 130, instantGather: true });
  s.pressGo(); s.stepSeconds(90);
  const first = s.lastRun;
  s.reset(); s.pressGo(); s.stepSeconds(90);
  const second = s.lastRun;
  check('reset replays identically',
    first.crossed === second.crossed &&
    Math.abs(first.clearTime - second.clearTime) < 1e-6 &&
    Math.abs(first.jamSum - second.jamSum) < 1e-6);
}

console.log('--- checks ---');
check('baseline run completes', base.m.complete && base.stuck === 0);
check('baseline has visible jam', base.m.peakJam >= 12, `peakJam=${base.m.peakJam}`);
check('baseline leaves people behind', base.m.leftBehind >= 10, `left=${base.m.leftBehind}`);
check('wide reduces jam', wideR.m.peakJam <= base.m.peakJam * 0.6,
  `${base.m.peakJam} -> ${wideR.m.peakJam}`);
check('wide raises avg speed', wideR.m.avgSpeed > base.m.avgSpeed * 1.08,
  `${base.m.avgSpeed.toFixed(2)} -> ${wideR.m.avgSpeed.toFixed(2)}`);
check('long green strands fewer', longR.m.leftBehind < base.m.leftBehind * 0.5,
  `${base.m.leftBehind} -> ${longR.m.leftBehind}`);
check('wide+long crosses nearly everyone', both.m.leftBehind <= 5,
  `left=${both.m.leftBehind}`);
check('everyone accounted for', base.m.crossed + base.m.leftBehind === 150,
  `${base.m.crossed}+${base.m.leftBehind}`);

process.exit(failures ? 1 : 0);
