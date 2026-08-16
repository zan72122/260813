// Crowd simulation core for the scramble-crossing game.
// Pure JS, no rendering dependencies — runs in the browser and in Node
// (tools/verify.mjs) so behaviour can be tuned and regression-tested headlessly.
//
// Coordinates: x = east(+)/west(-), z = south(+)/north(-), metres.
// The two roads cross at the origin; corners are the four quadrants.

export const ROAD_W = 18;          // width of each road
export const CROSSWALK_MIN = 3.5;  // narrow baseline crosswalk width
export const CROSSWALK_MAX = 9.5;  // widest a child can drag it
export const DIAG_W = 9.0;         // diagonal crossing corridor width (fixed)
export const CORNER_EXTENT = 26;   // how far the sidewalk corners reach
export const GREEN_SHORT = 11;     // seconds
export const GREEN_LONG = 20;      // seconds
export const FLASH_TIME = 3;       // blinking green before red

const HALF = ROAD_W / 2;

// Corner quadrants: index -> sign of (x, z)
export const CORNERS = [
  { sx: 1, sz: 1 },   // 0: south-east
  { sx: -1, sz: 1 },  // 1: south-west
  { sx: -1, sz: -1 }, // 2: north-west
  { sx: 1, sz: -1 },  // 3: north-east
];

// The four straight crosswalks. Each crosses one road arm just outside the
// central box and connects two adjacent corners.
//   axis 'x': band lies along x (east/west arm), pedestrians walk along z.
//   axis 'z': band lies along z (south/north arm), pedestrians walk along x.
export const CROSSWALKS = [
  { id: 'E', axis: 'x', side: 1, corners: [3, 0] },  // east arm,  NE <-> SE
  { id: 'W', axis: 'x', side: -1, corners: [2, 1] }, // west arm,  NW <-> SW
  { id: 'S', axis: 'z', side: 1, corners: [1, 0] },  // south arm, SW <-> SE
  { id: 'N', axis: 'z', side: -1, corners: [2, 3] }, // north arm, NW <-> NE
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which crosswalk joins corners a<->b, or null if they are diagonal.
export function crosswalkBetween(a, b) {
  for (const cw of CROSSWALKS) {
    if ((cw.corners[0] === a && cw.corners[1] === b) ||
        (cw.corners[0] === b && cw.corners[1] === a)) return cw;
  }
  return null;
}

export const SHIRT_COLORS = [
  0xef5350, 0x42a5f5, 0xffca28, 0x66bb6a, 0xab47bc,
  0xff7043, 0x26c6da, 0xec407a, 0x8d6e63, 0x9ccc65,
  0x5c6bc0, 0xffee58,
];
export const SKIN_COLORS = [0xffd5b3, 0xe8b48c, 0xc68e5f];
export const HAT_COLORS = [0xfff176, 0xf06292, 0x4dd0e1, 0xff8a65];

export function createSim(options = {}) {
  const cfg = {
    seed: options.seed ?? 12345,
    agentCount: options.agentCount ?? 150,
    greenDuration: options.greenDuration ?? GREEN_SHORT,
    crosswalkWidths: {
      E: CROSSWALK_MIN, W: CROSSWALK_MIN, S: CROSSWALK_MIN, N: CROSSWALK_MIN,
      ...(options.crosswalkWidths || {}),
    },
    instantGather: options.instantGather ?? false,
    diagonalFraction: options.diagonalFraction ?? 0.32,
  };

  const rng = mulberry32(cfg.seed);
  const agents = [];

  // ---- agent creation (fixed for the lifetime of the sim; reset() reuses it)
  for (let i = 0; i < cfg.agentCount; i++) {
    const from = Math.floor(rng() * 4);
    let to;
    if (rng() < cfg.diagonalFraction) {
      to = (from + 2) % 4; // diagonal
    } else {
      to = (from + (rng() < 0.5 ? 1 : 3)) % 4; // adjacent
    }
    agents.push({
      id: i,
      from, to,
      u: rng() * 2 - 1,               // lateral position inside the corridor, [-1,1]
      row: 0,                          // queue row, assigned below
      col: 0,
      baseSpeed: 1.15 + rng() * 0.5,   // m/s
      startDelay: 0,                   // reaction time after light turns green
      enterDelay: i * 0.1 + rng() * 0.35, // stagger of the gather stream
      wobblePhase: rng() * Math.PI * 2,
      shirt: SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)],
      skin: SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)],
      hat: rng() < 0.22 ? HAT_COLORS[Math.floor(rng() * HAT_COLORS.length)] : 0,
      scale: 0.92 + rng() * 0.16,
      // dynamic state, filled in reset():
      x: 0, z: 0, vx: 0, vz: 0,
      phase: 'wait', // enter | wait | cross | arrive | done
      squeeze: 0,
      speed: 0,
      heading: 0,
      gate: null, exitGate: null, waitSpot: null, dissolveSpot: null,
      spawnSpot: null,
      progress: 0,
    });
  }

  // Reaction stagger: agents closer to the curb (low row) leave first.
  // Assign queue rows per (corner, journey-kind) group so the crowd packs up.
  function assignQueues() {
    const groups = new Map();
    for (const a of agents) {
      const key = a.from * 8 + journeyKind(a);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }
    for (const list of groups.values()) {
      const perRow = Math.max(3, Math.ceil(Math.sqrt(list.length * 1.6)));
      list.forEach((a, i) => {
        a.row = Math.floor(i / perRow);
        a.col = (i % perRow) / Math.max(1, perRow - 1) - 0.5; // -0.5..0.5
        a.startDelay = a.row * 0.22 + (a.id % 5) * 0.05;
      });
    }
  }

  function journeyKind(a) {
    const cw = crosswalkBetween(a.from, a.to);
    return cw ? CROSSWALKS.indexOf(cw) : 4 + (a.from % 2); // 4/5 = diagonals
  }

  // Gate = the point on the curb where the agent steps onto the road.
  function computeGates(a) {
    const cw = crosswalkBetween(a.from, a.to);
    const cFrom = CORNERS[a.from];
    const cTo = CORNERS[a.to];
    if (cw) {
      const w = cfg.crosswalkWidths[cw.id];
      const margin = 0.45;
      const off = a.u * Math.max(0.1, w / 2 - margin);
      const bandCenter = cw.side * (HALF + w / 2 + 0.3);
      if (cw.axis === 'x') {
        // walking along z, band position along x
        const gx = bandCenter + off;
        a.gate = { x: gx, z: cFrom.sz * HALF };
        a.exitGate = { x: gx, z: cTo.sz * HALF };
        a.corridor = { axis: 'x', center: bandCenter, halfW: Math.max(0.4, w / 2 - 0.25) };
      } else {
        const gz = bandCenter + off;
        a.gate = { x: cFrom.sx * HALF, z: gz };
        a.exitGate = { x: cTo.sx * HALF, z: gz };
        a.corridor = { axis: 'z', center: bandCenter, halfW: Math.max(0.4, w / 2 - 0.25) };
      }
    } else {
      // Diagonal through the middle of the box.
      const tip = HALF - 0.4;
      const off = a.u * (DIAG_W / 2 - 0.5);
      // Perpendicular of the diagonal direction:
      const dx = cTo.sx - cFrom.sx, dz = cTo.sz - cFrom.sz;
      const len = Math.hypot(dx, dz);
      const px = -dz / len, pz = dx / len;
      a.gate = { x: cFrom.sx * tip + px * off, z: cFrom.sz * tip + pz * off };
      a.exitGate = { x: cTo.sx * tip + px * off, z: cTo.sz * tip + pz * off };
      a.corridor = { axis: 'diag', px, pz, off, halfW: DIAG_W / 2 - 0.3 };
    }
    // Wait spot: from the gate, step back into the corner, stacked by queue row.
    const bx = cFrom.sx, bz = cFrom.sz; // direction into the corner (away from roads)
    const backX = a.gate.x + bx * (1.0 + a.row * 0.75);
    const backZ = a.gate.z + bz * (1.0 + a.row * 0.75);
    // Spread columns sideways (perpendicular to "into corner" is ambiguous on a
    // corner, use the direction along the curb).
    let tx, tz;
    if (cw) {
      if (cw.axis === 'x') { tx = 1; tz = 0; } else { tx = 0; tz = 1; }
    } else { tx = -bz * 0.7071, tz = bx * 0.7071; }
    a.waitSpot = { x: backX + tx * a.col * 2.2, z: backZ + tz * a.col * 2.2 };
    a.dissolveSpot = {
      x: cTo.sx * (HALF + 4 + ((a.id * 7) % 10)),
      z: cTo.sz * (HALF + 4 + ((a.id * 13) % 10)),
    };
    a.spawnSpot = {
      x: cFrom.sx * (CORNER_EXTENT - ((a.id * 5) % 8)),
      z: cFrom.sz * (CORNER_EXTENT - ((a.id * 11) % 8)),
    };
  }

  // ---------------------------------------------------------------- state
  const sim = {
    cfg,
    agents,
    time: 0,
    light: 'red',            // red | green | flash
    lightTimer: 0,
    state: 'gather',         // gather | ready | crossing | clearing | done
    runCount: 0,
    metrics: null,
    lastRun: null,           // metrics of the last completed run
    baselineRun: null,       // metrics of run #1, for comparison
    onEvent: null,           // callback(name, payload)
  };

  function freshMetrics() {
    return {
      greenAt: 0, clearAt: 0, clearTime: 0,
      crossed: 0, leftBehind: 0,
      speedSum: 0, speedSamples: 0, avgSpeed: 0,
      jamSum: 0,               // integral of badly-squeezed walkers (person-seconds)
      peakJam: 0,              // max simultaneous squeezed walkers
      complete: false,
    };
  }

  function emit(name, payload) { if (sim.onEvent) sim.onEvent(name, payload); }

  sim.reset = function reset() {
    assignQueues();
    for (const a of agents) {
      computeGates(a);
      a.phase = 'wait';
      a.x = a.waitSpot.x; a.z = a.waitSpot.z;
      a.vx = 0; a.vz = 0; a.speed = 0; a.squeeze = 0;
      const c = CORNERS[a.from];
      a.heading = Math.atan2(-c.sx, -c.sz);
      a.progress = 0;
    }
    sim.time = 0;
    sim.light = 'red';
    sim.lightTimer = 0;
    sim.state = 'ready';
    sim.metrics = freshMetrics();
    emit('reset');
  };

  sim.beginGather = function beginGather() {
    assignQueues();
    for (const a of agents) {
      computeGates(a);
      a.phase = 'enter';
      a.x = a.spawnSpot.x; a.z = a.spawnSpot.z;
      a.vx = 0; a.vz = 0; a.progress = 0; a.squeeze = 0;
    }
    sim.time = 0;
    sim.light = 'red';
    sim.state = 'gather';
    sim.metrics = freshMetrics();
    emit('gather');
  };

  sim.pressGo = function pressGo() {
    if (sim.light !== 'red') return false;
    if (sim.state !== 'ready' && sim.state !== 'gather') return false;
    sim.light = 'green';
    sim.lightTimer = cfg.greenDuration;
    sim.state = 'crossing';
    sim.metrics = freshMetrics();
    sim.metrics.greenAt = sim.time;
    sim.runCount++;
    emit('green');
    return true;
  };

  sim.setCrosswalkWidth = function (id, w) {
    cfg.crosswalkWidths[id] = Math.min(CROSSWALK_MAX, Math.max(CROSSWALK_MIN, w));
  };
  sim.setGreenDuration = function (s) { cfg.greenDuration = s; };

  // ------------------------------------------------------------- stepping
  const CELL = 1.6;
  const grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;

  function rebuildGrid() {
    grid.clear();
    for (const a of agents) {
      if (a.phase === 'done') continue;
      const cx = Math.round(a.x / CELL), cz = Math.round(a.z / CELL);
      const k = key(cx, cz);
      let list = grid.get(k);
      if (!list) { list = []; grid.set(k, list); }
      list.push(a);
    }
  }

  const neighborsOut = [];
  function neighborsOf(a, radius) {
    neighborsOut.length = 0;
    const r2 = radius * radius;
    const cx = Math.round(a.x / CELL), cz = Math.round(a.z / CELL);
    const span = Math.ceil(radius / CELL);
    for (let ix = cx - span; ix <= cx + span; ix++) {
      for (let iz = cz - span; iz <= cz + span; iz++) {
        const list = grid.get(key(ix, iz));
        if (!list) continue;
        for (const b of list) {
          if (b === a) continue;
          const dx = b.x - a.x, dz = b.z - a.z;
          if (dx * dx + dz * dz < r2) neighborsOut.push(b);
        }
      }
    }
    return neighborsOut;
  }

  function seek(a, tx, tz, h, speedScale, avoid) {
    let dx = tx - a.x, dz = tz - a.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    dx /= dist; dz /= dist;

    let fx = dx, fz = dz;
    let squeeze = 0;

    if (avoid) {
      const nbs = neighborsOf(a, 2.0);
      let crowd = 0;
      for (const b of nbs) {
        const ox = b.x - a.x, oz = b.z - a.z;
        const d = Math.hypot(ox, oz) || 1e-6;
        if (d < 1.05) {
          const push = (1.05 - d) / 1.05;
          fx -= (ox / d) * push * 2.6;
          fz -= (oz / d) * push * 2.6;
          crowd++;
        }
        // Anticipatory sidestep for people ahead of us moving against us.
        const ahead = (ox * dx + oz * dz) / d;
        if (d < 2.0 && ahead > 0.35) {
          const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
          const closing = -(rvx * ox + rvz * oz) / d;
          if (closing > 0.25) {
            // Step to our left/right depending on which side they are on,
            // with a small right-hand bias so opposing streams form lanes.
            const side = (dx * oz - dz * ox) > -0.08 ? -1 : 1;
            const mag = 0.9 * (1 - d / 2.0);
            fx += (-dz) * side * mag;
            fz += (dx) * side * mag;
          }
        }
      }
      squeeze = Math.max(0, Math.min(1, (crowd - 1) / 4));
      speedScale *= 1 / (1 + 0.65 * Math.max(0, crowd - 1));
    }
    a.squeeze += (squeeze - a.squeeze) * Math.min(1, h * 6);

    // Corridor spring while on the road.
    if (a.phase === 'cross' && a.corridor) {
      const c = a.corridor;
      let lat = 0, lx = 0, lz = 0;
      if (c.axis === 'x') { lat = a.x - c.center; lx = 1; lz = 0; }
      else if (c.axis === 'z') { lat = a.z - c.center; lx = 0; lz = 1; }
      else { lat = a.x * c.px + a.z * c.pz - c.off; lx = c.px; lz = c.pz; }
      const over = Math.abs(lat) - c.halfW;
      if (over > 0) {
        const pull = Math.min(2.5, over * 2.0) * (lat > 0 ? -1 : 1);
        fx += lx * pull; fz += lz * pull;
      }
    }

    const fl = Math.hypot(fx, fz) || 1e-6;
    const targetSpeed = a.baseSpeed * speedScale;
    const tvx = (fx / fl) * targetSpeed;
    const tvz = (fz / fl) * targetSpeed;
    const k = Math.min(1, h * 5);
    a.vx += (tvx - a.vx) * k;
    a.vz += (tvz - a.vz) * k;
    a.x += a.vx * h;
    a.z += a.vz * h;
    a.speed = Math.hypot(a.vx, a.vz);
    if (a.speed > 0.05) a.heading = Math.atan2(a.vx, a.vz);
    return dist;
  }

  function stepOnce(h) {
    sim.time += h;
    rebuildGrid();

    // Traffic light
    if (sim.light === 'green') {
      sim.lightTimer -= h;
      if (sim.lightTimer <= FLASH_TIME) { sim.light = 'flash'; emit('flash'); }
    } else if (sim.light === 'flash') {
      sim.lightTimer -= h;
      if (sim.lightTimer <= 0) { sim.light = 'red'; emit('red'); }
    }

    const canEnter = sim.light === 'green';
    const hurry = sim.light !== 'green' ? 1.3 : 1;
    let anyoneEntering = false;
    let jammed = 0;

    for (const a of agents) {
      switch (a.phase) {
        case 'enter': {
          anyoneEntering = true;
          if (sim.time < a.enterDelay) break;
          const d = seek(a, a.waitSpot.x, a.waitSpot.z, h, 1.05, true);
          // If the crowd already blocks the exact spot, join the back of it.
          a.stall = (a.speed < 0.25 && d < 6) ? (a.stall || 0) + h : 0;
          if (d < 0.5 || a.stall > 1.5) { a.phase = 'wait'; a.vx = a.vz = 0; }
          break;
        }
        case 'wait': {
          if (canEnter && sim.time - sim.metrics.greenAt >= a.startDelay) {
            // Shuffle toward our own gate through the crowd; only agents who
            // physically reach the curb start crossing. The queue drains at a
            // rate set by how wide the crosswalk mouth is — that is what makes
            // narrow crossings strand the back rows on a short green.
            const d = seek(a, a.gate.x, a.gate.z, h, 0.7, true);
            // The curbside crush counts as congestion too — with a narrow
            // mouth this is where the visible "gyu-gyu" happens.
            if (a.squeeze > 0.5) jammed++;
            sim.metrics.speedSum += a.speed;
            sim.metrics.speedSamples++;
            if (d < 1.1) { a.phase = 'cross'; a.progress = 0; }
          } else {
            // Keep seeking the wait spot at low speed — the separation force
            // stays active so waiters yield to people pushing past.
            seek(a, a.waitSpot.x, a.waitSpot.z, h, 0.35, true);
          }
          break;
        }
        case 'cross': {
          // Head for our own exit gate; once past the curb, aim deeper in.
          const goal = a.exitGate;
          const d = seek(a, goal.x, goal.z, h, hurry, true);
          if (a.squeeze > 0.5) jammed++;
          sim.metrics.speedSum += a.speed;
          sim.metrics.speedSamples++;
          // Crossed the destination curb line?
          const cTo = CORNERS[a.to];
          const pastX = a.x * cTo.sx > HALF - 0.2;
          const pastZ = a.z * cTo.sz > HALF - 0.2;
          const cw = crosswalkBetween(a.from, a.to);
          const arrived = cw
            ? (cw.axis === 'x' ? pastZ : pastX)
            : (pastX && pastZ);
          if (arrived || d < 0.6) {
            a.phase = 'arrive';
            sim.metrics.crossed++;
          }
          break;
        }
        case 'arrive': {
          const d = seek(a, a.dissolveSpot.x, a.dissolveSpot.z, h, 0.9, true);
          // If the sidewalk crowd blocks the way, just stop and stand there.
          a.stall = a.speed < 0.25 ? (a.stall || 0) + h : 0;
          if (d < 1.4 || a.stall > 1.5) {
            a.phase = 'done'; a.vx = a.vz = 0; a.speed = 0;
          }
          break;
        }
        case 'done':
          break;
      }
    }

    sim.metrics.jamSum += jammed * h;
    if (jammed > sim.metrics.peakJam) sim.metrics.peakJam = jammed;
    sim.jamNow = jammed;

    // State transitions
    if (sim.state === 'gather' && !anyoneEntering) {
      sim.state = 'ready';
      emit('ready');
    }
    if (sim.state === 'crossing' || sim.state === 'clearing') {
      const crossing = agents.some(a => a.phase === 'cross' || a.phase === 'arrive');
      if (sim.light === 'red' && sim.state === 'crossing') sim.state = 'clearing';
      if (!crossing && (sim.light === 'red' || !agents.some(a => a.phase === 'wait'))) {
        finishRun();
      }
    }
  }

  function finishRun() {
    const m = sim.metrics;
    m.clearAt = sim.time;
    m.clearTime = sim.time - m.greenAt;
    m.leftBehind = agents.filter(a => a.phase === 'wait' || a.phase === 'enter').length;
    m.avgSpeed = m.speedSamples ? m.speedSum / m.speedSamples : 0;
    m.complete = true;
    sim.lastRun = m;
    if (!sim.baselineRun) sim.baselineRun = m;
    sim.state = 'done';
    sim.light = 'red';
    emit('runEnd', m);
  }

  const H = 1 / 60;
  let acc = 0;
  sim.step = function step(dt) {
    acc += Math.min(dt, 0.12);
    let n = 0;
    while (acc >= H && n < 8) { stepOnce(H); acc -= H; n++; }
  };
  // Advance exactly `s` simulated seconds (deterministic; used by tests).
  sim.stepSeconds = function stepSeconds(s) {
    const steps = Math.round(s / H);
    for (let i = 0; i < steps; i++) stepOnce(H);
  };

  // Density sampling for the heat overlay: counts per cell over the
  // intersection area. gridN x gridN cells spanning [-extent, extent].
  sim.sampleDensity = function (out, gridN, extent) {
    out.fill(0);
    const scale = gridN / (2 * extent);
    for (const a of agents) {
      if (a.phase !== 'cross') continue;
      const gx = Math.floor((a.x + extent) * scale);
      const gz = Math.floor((a.z + extent) * scale);
      if (gx < 0 || gz < 0 || gx >= gridN || gz >= gridN) continue;
      out[gz * gridN + gx] += 1;
    }
    return out;
  };

  if (cfg.instantGather) sim.reset();
  else sim.beginGather();

  return sim;
}
