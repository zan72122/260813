'use strict';
/* game.js — 螺鈿(らでん)きらきら
   One-finger craft game: place shell chips, watch them vanish under the
   coating, polish them back to iridescent life, then tilt in the light. */
(function () {
  const glCanvas = document.getElementById('gl');
  const fxCanvas = document.getElementById('fx');
  const fxCtx = fxCanvas.getContext('2d');
  let gl = null;

  // ---------------- constants ------------------------------------------
  const BRUSH_R = 0.30;          // polish brush radius in object units
  const MASK_SIZE = 512;
  const GRID_N = 40;             // progress grid over [-1.2,1.2]^2
  const DONE_AT = 0.90;          // coverage that triggers auto-finish
  const FINGER_LIFT = 26;        // px: brush/drag point above the finger

  const S = {
    SELECT: 'select', ZOOM: 'zoom', TRAY_IN: 'trayin', PLACE: 'place',
    SHIMMER: 'shimmer', COAT: 'coat', WONDER: 'wonder', POLISH: 'polish',
    FINISH: 'finish', ADMIRE: 'admire',
  };

  // ---------------- gl helpers -----------------------------------------
  let progs = {}, meshCache = new Map(), maskTex = null, bgBuf = null;

  function makeProgram(vsSrc, fsSrc) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    return { prog: p, u: {}, a: {} };
  }
  function uloc(P, name) {
    if (!(name in P.u)) P.u[name] = gl.getUniformLocation(P.prog, name);
    return P.u[name];
  }
  function aloc(P, name) {
    if (!(name in P.a)) P.a[name] = gl.getAttribLocation(P.prog, name);
    return P.a[name];
  }
  function U1(P, n, v) { const l = uloc(P, n); if (l) gl.uniform1f(l, v); }
  function U2(P, n, x, y) { const l = uloc(P, n); if (l) gl.uniform2f(l, x, y); }
  function U3(P, n, x, y, z) { const l = uloc(P, n); if (l) gl.uniform3f(l, x, y, z); }

  function meshBuffers(mesh) {
    let mb = meshCache.get(mesh);
    if (!mb) {
      mb = { vbo: gl.createBuffer(), ibo: gl.createBuffer(), n: mesh.indices.length };
      gl.bindBuffer(gl.ARRAY_BUFFER, mb.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mb.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      meshCache.set(mesh, mb);
    }
    return mb;
  }

  /* draw a mesh with an entity program; ent = transform + uniforms */
  function drawMesh(P, mesh, ent) {
    gl.useProgram(P.prog);
    const mb = meshBuffers(mesh);
    gl.bindBuffer(gl.ARRAY_BUFFER, mb.vbo);
    const ap = aloc(P, 'aPos'), al = aloc(P, 'aLocal');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 16, 0);
    if (al >= 0) {
      gl.enableVertexAttribArray(al);
      gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 16, 8);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mb.ibo);
    U2(P, 'uPivot', ent.pivot ? ent.pivot[0] : 0, ent.pivot ? ent.pivot[1] : 0);
    U2(P, 'uEntPos', ent.x || 0, ent.y || 0);
    U1(P, 'uEntScale', ent.scale === undefined ? 1 : ent.scale);
    U1(P, 'uEntRot', ent.rot || 0);
    U2(P, 'uStretch', ent.sx === undefined ? 1 : ent.sx, ent.sy === undefined ? 1 : ent.sy);
    U2(P, 'uCam', cam.x, cam.y);
    U2(P, 'uViewScale', 2 * cam.z / (W * DPR) * DPR, 2 * cam.z / (H * DPR) * DPR);
    U2(P, 'uTiltShift', ent.tiltShift ? tilt.x * ent.tiltShift : 0,
      ent.tiltShift ? tilt.y * ent.tiltShift * 0.7 : 0);
    if (ent.set) ent.set(P);
    gl.drawElements(gl.TRIANGLES, mb.n, gl.UNSIGNED_SHORT, 0);
  }

  // ---------------- world / camera -------------------------------------
  let W = 0, H = 0, DPR = 1;
  const cam = { x: 0, y: 0, z: 200 };
  const camT = { x: 0, y: 0, z: 200 };
  const tilt = { x: 0, y: 0 };
  const tiltT = { x: 0, y: 0 };
  let bgFocus = 0, bgFocusT = 0, bgSpot = 0, bgSpotT = 0;

  function s2w(sx, sy) { return [cam.x + (sx - W / 2) / cam.z, cam.y - (sy - H / 2) / cam.z]; }
  function w2s(wx, wy) { return [W / 2 + (wx - cam.x) * cam.z, H / 2 - (wy - cam.y) * cam.z]; }

  // ---------------- items & pieces -------------------------------------
  const quad = Shapes.quadMesh(1.28);
  const unitQuad = Shapes.quadMesh(1.0);
  let items = [];             // the five products on the shelf
  let item = null;            // chosen one
  let pieces = [];            // draggable shell chips
  let state = S.SELECT, stateT = 0;
  let time = 0;
  let coatEdge = -2.5, polishAll = 0, sweep = 99;
  let dragging = null, dragOff = [0, 0], dragOffT = [0, 0];
  let strokeLast = null, strokeActive = false;
  let lastInputT = 0, lastStampObj = [0, 0];
  let finishPhase = 0, finishT = 0;
  let handHint = null;        // {mode:'drag'|'rub', t}
  let placedCount = 0;
  let progress = 0, progressCheckT = 0;
  let revealSoundT = 0;
  let craftsmanAlpha = 0;

  function buildItems() {
    items = Shapes.ITEM_DEFS.map((def, i) => {
      const slots = def.build().map((s, j) => {
        const mesh = Shapes.buildMesh(s.pts);
        return { mesh, centroid: mesh.centroid, group: s.group, seed: s.seed,
          filled: false, idx: j };
      });
      return { def, shape: def.shape, slots, i,
        pos: [0, 0], shelfPos: [0, 0], scale: 0.44, alpha: 1, chosen: false };
    });
  }

  function shelfLayout() {
    const landscape = W > H * 1.25;
    if (landscape) {
      items.forEach((it, i) => { it.shelfPos = [(i - 2) * 1.5, 0.05]; it.scale = 0.5; });
      return { bw: 8.0, bh: 2.6, cy: 0.0 };
    }
    const top = [-1.35, 0, 1.35], bot = [-0.75, 0.75];
    items.forEach((it, i) => {
      it.shelfPos = i < 3 ? [top[i], 0.85] : [bot[i - 3], -0.85];
      it.scale = 0.46;
    });
    return { bw: 4.15, bh: 4.0, cy: 0.02 };
  }

  function trayLayout() {
    if (!item) return { rows: [], bounds: { bw: 3, bh: 4, cy: -1 } };
    const n = pieces.length;
    const landscape = W > H * 1.25;
    const cols = landscape ? n : (n <= 4 ? 2 : 3);
    const rows = Math.ceil(n / cols);
    const cellW = landscape ? 1.15 : 1.05;
    const cellH = 1.0;
    const y0 = -1.85;
    pieces.forEach((p, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      p.trayPos = [(c - (inRow - 1) / 2) * cellW, y0 - r * cellH];
    });
    const trayW = Math.min(n, cols) * cellW + 0.4;
    const trayH = rows * cellH + 0.35;
    const topY = 1.32, botY = y0 - (rows - 1) * cellH - 0.62;
    return {
      trayW, trayH, trayCY: y0 - (rows - 1) * cellH / 2,
      bounds: { bw: Math.max(2.85, trayW + 0.15), bh: topY - botY, cy: (topY + botY) / 2 },
    };
  }

  function fitZoom(bw, bh) { return Math.min(W / bw, H / bh); }

  function setCamTarget() {
    const minD = Math.min(W, H);
    if (state === S.SELECT || state === S.ZOOM && !item) {
      const L = shelfLayout();
      camT.x = 0; camT.y = L.cy; camT.z = fitZoom(L.bw, L.bh);
      bgFocusT = 0; bgSpotT = 0;
    } else if (state === S.ZOOM || state === S.TRAY_IN || state === S.PLACE) {
      const T = trayLayout();
      camT.x = 0; camT.y = T.bounds.cy; camT.z = fitZoom(T.bounds.bw, T.bounds.bh);
      bgFocusT = 0.55; bgSpotT = 0;
    } else if (state === S.SHIMMER || state === S.COAT || state === S.WONDER ||
               state === S.POLISH || state === S.FINISH) {
      camT.x = 0; camT.y = 0; camT.z = minD / 2.72;
      bgFocusT = 0.8; bgSpotT = state === S.FINISH ? 0.5 : 0;
    } else if (state === S.ADMIRE) {
      camT.x = 0; camT.y = -0.06; camT.z = minD / 3.05;
      bgFocusT = 0.9; bgSpotT = 1;
    }
  }

  // ---------------- polish mask ----------------------------------------
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskCanvas.height = MASK_SIZE;
  const maskCtx = maskCanvas.getContext('2d');
  let maskDirty = true;
  const grid = new Float32Array(GRID_N * GRID_N);
  let insideW = new Float32Array(GRID_N * GRID_N);
  let shellF = new Uint8Array(GRID_N * GRID_N);

  function clearMask() {
    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.fillStyle = '#000';
    maskCtx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    grid.fill(0);
    maskDirty = true;
    progress = 0;
  }

  function computeInsideGrid() {
    insideW.fill(0); shellF.fill(0);
    if (!item) return;
    for (let gy = 0; gy < GRID_N; gy++) {
      for (let gx = 0; gx < GRID_N; gx++) {
        const x = -1.2 + (gx + 0.5) / GRID_N * 2.4;
        const y = -1.2 + (gy + 0.5) / GRID_N * 2.4;
        if (Shapes.sdShape(item.shape, x, y) < -0.03) {
          const k = gy * GRID_N + gx;
          insideW[k] = 1;
          for (const s of item.slots) {
            if (Shapes.pointInPoly(s.mesh.pts, x, y)) { shellF[k] = 1; break; }
          }
        }
      }
    }
  }

  function stamp(ox, oy, strength) {
    if (Shapes.sdShape(item.shape, ox, oy) > 0.25) return;
    lastStampObj = [ox, oy];
    const cx = (ox + 1.2) / 2.4 * MASK_SIZE;
    const cy = (1 - (oy + 1.2) / 2.4) * MASK_SIZE;
    const r = BRUSH_R / 2.4 * MASK_SIZE;
    const g = maskCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${strength})`);
    g.addColorStop(0.55, `rgba(255,255,255,${strength * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    maskCtx.globalCompositeOperation = 'lighter';
    maskCtx.fillStyle = g;
    maskCtx.beginPath();
    maskCtx.arc(cx, cy, r, 0, Math.PI * 2);
    maskCtx.fill();
    maskDirty = true;
    // mirror into the progress grid + reveal chimes
    const gr = BRUSH_R / 2.4 * GRID_N;
    const gx0 = Math.max(0, Math.floor((ox + 1.2) / 2.4 * GRID_N - gr));
    const gx1 = Math.min(GRID_N - 1, Math.ceil((ox + 1.2) / 2.4 * GRID_N + gr));
    const gy0 = Math.max(0, Math.floor((oy + 1.2) / 2.4 * GRID_N - gr));
    const gy1 = Math.min(GRID_N - 1, Math.ceil((oy + 1.2) / 2.4 * GRID_N + gr));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = -1.2 + (gx + 0.5) / GRID_N * 2.4;
        const py = -1.2 + (gy + 0.5) / GRID_N * 2.4;
        const dd = Math.hypot(px - ox, py - oy) / BRUSH_R;
        if (dd > 1) continue;
        const k = gy * GRID_N + gx;
        const before = grid[k];
        grid[k] = Math.min(1, grid[k] + strength * (1 - dd * dd) * 1.15);
        if (shellF[k] && before < 0.5 && grid[k] >= 0.5 && time - revealSoundT > 0.16) {
          revealSoundT = time;
          Sound.reveal((py + 1.2) / 2.4);
        }
      }
    }
  }

  function localPolish(ox, oy) {
    const gx = Math.max(0, Math.min(GRID_N - 1, Math.floor((ox + 1.2) / 2.4 * GRID_N)));
    const gy = Math.max(0, Math.min(GRID_N - 1, Math.floor((oy + 1.2) / 2.4 * GRID_N)));
    return grid[gy * GRID_N + gx];
  }

  function computeProgress() {
    let sum = 0, wsum = 0;
    for (let k = 0; k < grid.length; k++) {
      if (!insideW[k]) continue;
      const w = 1 + shellF[k] * 1.5;
      sum += Math.min(1, grid[k] * 1.12) * w;
      wsum += w;
    }
    progress = wsum ? sum / wsum : 0;
  }

  function worstSpot() {
    let bk = -1, bv = 2;
    for (let k = 0; k < grid.length; k++) {
      if (!insideW[k]) continue;
      const v = grid[k] - shellF[k] * 0.2;   // prefer shell areas
      if (v < bv) { bv = v; bk = k; }
    }
    if (bk < 0) return [0, 0];
    return [-1.2 + (bk % GRID_N + 0.5) / GRID_N * 2.4,
            -1.2 + (Math.floor(bk / GRID_N) + 0.5) / GRID_N * 2.4];
  }

  // ---------------- state machine --------------------------------------
  function setState(s) { state = s; stateT = 0; setCamTarget(); }

  function chooseItem(i) {
    item = items[i];
    item.chosen = true;
    Sound.pick();
    // build pieces from slots
    pieces = item.slots.map((slot, j) => ({
      slot: null, home: slot, mesh: slot.mesh, group: slot.group, seed: slot.seed,
      state: 'hidden', pos: [0, -3.2], vis: 0, dispScale: 1, trayPos: [0, -2],
      appearAt: 0.15 + j * 0.14, popT: 1,
    }));
    placedCount = 0;
    item.slots.forEach(s => { s.filled = false; });
    clearMask();
    coatEdge = -2.5; polishAll = 0; sweep = 99;
    computeInsideGrid();
    // generous display scale so tiny chips stay finger-sized
    pieces.forEach(p => {
      p.dispScale = Math.max(0.62, Math.min(2.6, 0.40 / p.mesh.radius));
    });
    setState(S.ZOOM);
  }

  function resetToSelect() {
    item && (item.chosen = false);
    item = null;
    pieces = [];
    dragging = null;
    Sound.polishStop();
    clearMask();
    coatEdge = -2.5; polishAll = 0; sweep = 99;
    setState(S.SELECT);
  }

  function startCoat() {
    clearMask();
    polishAll = 0; sweep = 99;
    coatEdge = -1.75;
    Sound.swish(2.1);
    setState(S.COAT);
  }

  function pieceWorld(p) {
    if (p.state === 'placed') {
      const c = p.slot.centroid;
      return [c[0], c[1]];
    }
    return p.pos;
  }

  function freeSlotNear(p, wx, wy, maxD) {
    let best = null, bd = maxD;
    for (const s of item.slots) {
      if (s.filled || s.group !== p.group) continue;
      const d = Math.hypot(wx - s.centroid[0], wy - s.centroid[1]);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function updateLoosePieces(dt) {
    pieces.forEach((p, i) => {
      if (p.state === 'tray' || p.state === 'snapping') {
        p.vis = Math.min(1, p.vis + dt * 3.5);
      }
      if (p.state === 'tray') {
        const bob = Math.sin(time * 1.6 + i * 1.7) * 0.02;
        p.pos[0] += (p.trayPos[0] - p.pos[0]) * (1 - Math.exp(-dt * 8));
        p.pos[1] += (p.trayPos[1] + bob - p.pos[1]) * (1 - Math.exp(-dt * 8));
      } else if (p.state === 'snapping') {
        p.popT += dt / 0.24;
        const t = Math.min(1, p.popT);
        const e = 1 - (1 - t) * (1 - t);
        p.pos[0] = p.snapFrom[0] + (p.slot.centroid[0] - p.snapFrom[0]) * e;
        p.pos[1] = p.snapFrom[1] + (p.slot.centroid[1] - p.snapFrom[1]) * e;
        p.dispScaleNow = p.dispScaleNow + (1 - p.dispScaleNow) * e;
        if (t >= 1) {
          p.state = 'placed';
          placedCount++;
          Sound.snap(placedCount);
          FX.spark(p.slot.centroid[0], p.slot.centroid[1],
            { n: 10, size: 12, speed: 1.4 });
          if (placedCount === pieces.length) {
            Sound.shimmer();
            setState(S.SHIMMER);
          }
        }
      }
    });
  }

  function update(dt) {
    time += dt;
    stateT += dt;
    const k = 1 - Math.exp(-dt * 4.2);
    cam.x += (camT.x - cam.x) * k;
    cam.y += (camT.y - cam.y) * k;
    cam.z += (camT.z - cam.z) * k;
    bgFocus += (bgFocusT - bgFocus) * k;
    bgSpot += (bgSpotT - bgSpot) * k;
    const kt = 1 - Math.exp(-dt * 6);
    tilt.x += (tiltT.x - tilt.x) * kt;
    tilt.y += (tiltT.y - tilt.y) * kt;
    FX.update(dt);
    setCamTarget();

    const wantCraftsman = state === S.SELECT || state === S.COAT;
    craftsmanAlpha += ((wantCraftsman ? 1 : 0) - craftsmanAlpha) * (1 - Math.exp(-dt * 3));

    switch (state) {
      case S.SELECT:
        if (Math.random() < dt * 1.2) {
          const it = items[Math.floor(Math.random() * items.length)];
          FX.spark(it.shelfPos[0] + (Math.random() - 0.5) * 0.7,
            it.shelfPos[1] + (Math.random() - 0.5) * 0.7,
            { n: 1, size: 9, speed: 0.1, life: 0.8 });
        }
        break;
      case S.ZOOM: {
        const t = Math.min(1, stateT / 0.9);
        const e = t * t * (3 - 2 * t);
        item.pos = [item.shelfPos[0] * (1 - e), item.shelfPos[1] * (1 - e)];
        item.scaleNow = item.scale + (1 - item.scale) * e;
        items.forEach(it => { if (it !== item) it.alpha = Math.max(0, 1 - t * 2); });
        if (t >= 1) setState(S.TRAY_IN);
        break;
      }
      case S.TRAY_IN: {
        trayLayout();
        let allIn = true;
        pieces.forEach(p => {
          if (stateT > p.appearAt && p.state === 'hidden') {
            p.state = 'tray';
            p.pos = [p.trayPos[0], p.trayPos[1] - 0.5];
            FX.spark(p.trayPos[0], p.trayPos[1], { n: 5, size: 10, speed: 0.9 });
            Sound.tap();
          }
          if (p.state === 'hidden') allIn = false;
        });
        updateLoosePieces(dt);
        if (state !== S.TRAY_IN) break;   // all placed already
        if (allIn && stateT > pieces.length * 0.14 + 0.5) setState(S.PLACE);
        break;
      }
      case S.PLACE: {
        trayLayout();
        updateLoosePieces(dt);
        if (state !== S.PLACE) break;
        // idle guide hand
        if (time - lastInputT > 6 && !dragging) {
          if (!handHint) handHint = { mode: 'drag', t: 0 };
        } else if (handHint && handHint.mode === 'drag' && time - lastInputT < 6) {
          handHint = null;
        }
        if (handHint) handHint.t += dt;
        break;
      }
      case S.SHIMMER:
        if (Math.random() < dt * 14) {
          const s = item.slots[Math.floor(Math.random() * item.slots.length)];
          FX.spark(s.centroid[0], s.centroid[1], { n: 2, size: 10, speed: 0.7 });
        }
        if (stateT > 1.35) startCoat();
        break;
      case S.COAT: {
        const t = Math.min(1, stateT / 2.0);
        coatEdge = -1.75 + t * 3.7;
        if (t >= 1) { coatEdge = 2.5; Sound.wonder(); setState(S.WONDER); }
        break;
      }
      case S.WONDER:
        if (Math.random() < dt * 5) {
          FX.spark((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.6,
            { n: 1, size: 10, speed: 0.25, vy: 0.35, white: 1, life: 1.2 });
        }
        if (stateT > 1.5) {
          setState(S.POLISH);
          handHint = { mode: 'rub', t: 0, spot: [0, 0.1] };
        }
        break;
      case S.POLISH: {
        progressCheckT += dt;
        if (progressCheckT > 0.3) {
          progressCheckT = 0;
          computeProgress();
          if (progress >= DONE_AT) {
            Sound.polishStop();
            strokeActive = false;
            dragging = null;
            finishPhase = 0; finishT = 0;
            setState(S.FINISH);
            break;
          }
        }
        // guide toward untouched areas after a pause
        if (time - lastInputT > 4.5) {
          if (!handHint) handHint = { mode: 'rub', t: 0, spot: worstSpot() };
          if (Math.random() < dt * 3) {
            const sp = handHint.spot || worstSpot();
            FX.spark(sp[0] + (Math.random() - 0.5) * 0.3,
              sp[1] + (Math.random() - 0.5) * 0.3,
              { n: 1, size: 8, speed: 0.15, white: 1, life: 0.9 });
          }
        } else if (handHint && time - lastInputT < 4.5 && handHint.t > 2.5) {
          handHint = null;
        }
        if (handHint) handHint.t += dt;
        break;
      }
      case S.FINISH: {
        finishT += dt;
        if (finishPhase === 0) {
          // expanding shine from the last touched point
          const t = Math.min(1, finishT / 0.85);
          const R = 0.2 + t * 3.2;
          const steps = 10;
          for (let i = 0; i < steps; i++) {
            const a = Math.random() * Math.PI * 2;
            const rr = R * Math.sqrt(Math.random());
            stamp(lastStampObj[0] + Math.cos(a) * rr,
              lastStampObj[1] + Math.sin(a) * rr, 0.5);
          }
          if (t >= 1) {
            maskCtx.globalCompositeOperation = 'source-over';
            maskCtx.fillStyle = '#fff';
            maskCtx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
            grid.fill(1);
            maskDirty = true;
            polishAll = 1;
            finishPhase = 1; finishT = 0;
            Sound.finish();
          }
        } else if (finishPhase === 1) {
          const t = Math.min(1, finishT / 1.1);
          sweep = -1.8 + t * 3.6;
          if (Math.random() < dt * 30) {
            FX.spark((sweep - 0.3) + (Math.random() - 0.5) * 0.4,
              (Math.random() - 0.5) * 2, { n: 1, size: 12, speed: 0.8 });
          }
          if (t >= 1) {
            sweep = 99;
            finishPhase = 2; finishT = 0;
          }
        } else if (finishT > 0.4) {
          setState(S.ADMIRE);
          handHint = null;
        }
        break;
      }
      case S.ADMIRE: {
        // idle sway keeps the nacre alive even without touch
        if (!dragging) {
          tiltT.x = Math.sin(time * 0.55) * 0.30;
          tiltT.y = Math.cos(time * 0.41) * 0.22;
        }
        if (Math.random() < dt * 2.2 && item) {
          const s = item.slots[Math.floor(Math.random() * item.slots.length)];
          FX.spark(s.centroid[0] + (Math.random() - 0.5) * 0.2,
            s.centroid[1] + (Math.random() - 0.5) * 0.2,
            { n: 1, size: 11, speed: 0.12, life: 1.1 });
        }
        break;
      }
    }
  }

  // ---------------- input ----------------------------------------------
  let activePointer = null;
  let pressedButton = null;
  let buttons = [];

  function layoutButtons() {
    buttons = [];
    const safe = 14;
    if (state !== S.SELECT && state !== S.ZOOM) {
      buttons.push({ x: safe + 30, y: safe + 30, r: 27, type: 'home',
        cb: resetToSelect });
    }
    if (state === S.ADMIRE) {
      const landscape = W > H * 1.25;
      buttons.push({
        x: landscape ? W - 84 : W / 2, y: H - 66, r: 40,
        type: 'again', cb: startCoat,
      });
    }
  }

  function onDown(sx, sy) {
    lastInputT = time;
    Sound.ensure();
    handHint = null;
    for (const b of buttons) {
      if (Math.hypot(sx - b.x, sy - b.y) < b.r + 14) {
        pressedButton = b;
        Sound.tap();
        return;
      }
    }
    const [wx, wy] = s2w(sx, sy);
    if (state === S.SELECT) {
      let best = null, bd = 1e9;
      items.forEach(it => {
        const d = Math.hypot(wx - it.shelfPos[0], wy - it.shelfPos[1]);
        if (d < bd) { bd = d; best = it; }
      });
      if (best && bd < best.scale * 1.5 + 40 / cam.z) chooseItem(best.i);
      return;
    }
    if (state === S.PLACE || state === S.TRAY_IN) {
      const [ax, ay] = s2w(sx, sy - FINGER_LIFT * 0.4);
      let best = null, bd = 1e9;
      for (const p of pieces) {
        if (p.state !== 'tray') continue;
        const pr = Math.max(p.mesh.radius * p.dispScale, 48 / cam.z);
        const d = Math.hypot(ax - p.pos[0], ay - p.pos[1]);
        if (d < pr * 1.35 && d < bd) { bd = d; best = p; }
      }
      if (best) {
        dragging = best;
        best.state = 'drag';
        dragOff = [best.pos[0] - wx, best.pos[1] - wy];
        dragOffT = [0, FINGER_LIFT / cam.z];
        Sound.pick();
      }
      return;
    }
    if (state === S.POLISH) {
      strokeActive = true;
      const [ox, oy] = s2w(sx, sy - FINGER_LIFT);
      strokeLast = [ox, oy];
      stamp(ox, oy, 0.30);
      return;
    }
    if (state === S.ADMIRE) {
      dragging = { tiltStart: [sx, sy], t0: [tilt.x, tilt.y], isTilt: true };
      return;
    }
  }

  function onMove(sx, sy, dtMove, speed) {
    lastInputT = time;
    if (pressedButton) return;
    if ((state === S.PLACE || state === S.TRAY_IN) && dragging) {
      const [wx, wy] = s2w(sx, sy);
      const kk = 1 - Math.exp(-(dtMove || 0.016) * 10);
      dragOff[0] += (dragOffT[0] - dragOff[0]) * kk;
      dragOff[1] += (dragOffT[1] - dragOff[1]) * kk;
      let px = wx + dragOff[0], py = wy + dragOff[1];
      const near = freeSlotNear(dragging, px, py, 0.62);
      dragging.nearSlot = near;
      if (near) {
        const d = Math.hypot(px - near.centroid[0], py - near.centroid[1]);
        if (d < 0.45) {          // magnet pull
          const pull = 1 - d / 0.45;
          px += (near.centroid[0] - px) * pull * 0.55;
          py += (near.centroid[1] - py) * pull * 0.55;
        }
      }
      dragging.pos = [px, py];
      return;
    }
    if (state === S.POLISH && strokeActive) {
      const [ox, oy] = s2w(sx, sy - FINGER_LIFT);
      if (strokeLast) {
        const d = Math.hypot(ox - strokeLast[0], oy - strokeLast[1]);
        const steps = Math.max(1, Math.ceil(d / 0.07));
        for (let i = 1; i <= steps; i++) {
          stamp(strokeLast[0] + (ox - strokeLast[0]) * i / steps,
            strokeLast[1] + (oy - strokeLast[1]) * i / steps, 0.16);
        }
        // cloth-trail sparkles
        if (Math.random() < 0.5) {
          FX.spark(ox, oy, { n: 1, size: 7, speed: 0.3, white: 1, life: 0.5 });
        }
      }
      strokeLast = [ox, oy];
      const bright = localPolish(ox, oy);
      Sound.polish(Math.min(0.5, (speed || 0) * 0.0012 + 0.10), bright);
      return;
    }
    if (state === S.ADMIRE && dragging && dragging.isTilt) {
      tiltT.x = Math.max(-0.7, Math.min(0.7,
        dragging.t0[0] + (sx - dragging.tiltStart[0]) / (W * 0.30)));
      tiltT.y = Math.max(-0.7, Math.min(0.7,
        dragging.t0[1] + (dragging.tiltStart[1] - sy) / (H * 0.30) * -1));
      return;
    }
  }

  function onUp(sx, sy) {
    if (pressedButton) {
      const b = pressedButton;
      pressedButton = null;
      if (Math.hypot(sx - b.x, sy - b.y) < b.r + 24) b.cb();
      return;
    }
    if ((state === S.PLACE || state === S.TRAY_IN) && dragging) {
      const p = dragging;
      dragging = null;
      const near = freeSlotNear(p, p.pos[0], p.pos[1], 0.55);
      if (near) {
        near.filled = true;
        p.slot = near;
        p.mesh = near.mesh;
        p.state = 'snapping';
        p.snapFrom = [p.pos[0], p.pos[1]];
        p.dispScaleNow = p.dispScale;
        p.popT = 0;
      } else {
        p.state = 'tray';
        Sound.back();
      }
      return;
    }
    if (state === S.POLISH) {
      strokeActive = false;
      strokeLast = null;
      Sound.polishStop();
      computeProgress();
      if (progress >= DONE_AT) {
        finishPhase = 0; finishT = 0;
        setState(S.FINISH);
      }
      return;
    }
    if (state === S.ADMIRE) { dragging = null; }
  }

  let lastMove = { x: 0, y: 0, t: 0 };
  function bindInput() {
    const opts = { passive: false };
    const down = e => {
      e.preventDefault();
      const pt = e.changedTouches ? e.changedTouches[0] : e;
      const id = e.changedTouches ? pt.identifier : (e.pointerId || 0);
      if (activePointer !== null) return;
      activePointer = id;
      lastMove = { x: pt.clientX, y: pt.clientY, t: performance.now() };
      onDown(pt.clientX, pt.clientY);
    };
    const move = e => {
      e.preventDefault();
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      for (const pt of list) {
        const id = e.changedTouches ? pt.identifier : (e.pointerId || 0);
        if (id !== activePointer) continue;
        const now = performance.now();
        const dtm = Math.max(1, now - lastMove.t);
        const sp = Math.hypot(pt.clientX - lastMove.x, pt.clientY - lastMove.y) / dtm * 1000;
        lastMove = { x: pt.clientX, y: pt.clientY, t: now };
        onMove(pt.clientX, pt.clientY, dtm / 1000, sp);
      }
    };
    const up = e => {
      e.preventDefault();
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      for (const pt of list) {
        const id = e.changedTouches ? pt.identifier : (e.pointerId || 0);
        if (id !== activePointer) continue;
        activePointer = null;
        onUp(pt.clientX, pt.clientY);
      }
    };
    if (window.PointerEvent) {
      window.addEventListener('pointerdown', down, opts);
      window.addEventListener('pointermove', move, opts);
      window.addEventListener('pointerup', up, opts);
      window.addEventListener('pointercancel', up, opts);
    } else {
      window.addEventListener('touchstart', down, opts);
      window.addEventListener('touchmove', move, opts);
      window.addEventListener('touchend', up, opts);
      window.addEventListener('touchcancel', up, opts);
      window.addEventListener('mousedown', down, opts);
      window.addEventListener('mousemove', move, opts);
      window.addEventListener('mouseup', up, opts);
    }
    window.addEventListener('gesturestart', e => e.preventDefault(), opts);
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------------- rendering ------------------------------------------
  function setSurfaceUniforms(P) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    const l = uloc(P, 'uMask');
    if (l) gl.uniform1i(l, 0);
    U1(P, 'uCoatEdge', coatEdge);
    U1(P, 'uPolishAll', polishAll);
    U2(P, 'uTilt', tilt.x, tilt.y);
    U1(P, 'uTime', time);
    U1(P, 'uSweep', sweep);
  }

  function drawObjectAt(it, x, y, scale, alpha) {
    // soft ground shadow
    drawMesh(progs.glow, unitQuad, {
      x: x + 0.05 * scale, y: y - 0.12 * scale, scale: scale * 1.18,
      set(P) { U3(P, 'uColor', 0, 0, 0); U1(P, 'uAlphaF', 0.5 * alpha); U1(P, 'uMode', 1); },
    });
    drawMesh(progs.lacquer, quad, {
      x, y, scale,
      set(P) {
        setSurfaceUniforms(P);
        U1(P, 'uShape', it.shape);
        U1(P, 'uAlpha', alpha);
      },
    });
  }

  function drawPieceMesh(mesh, ent, seed, opts) {
    opts = opts || {};
    drawMesh(progs.piece, mesh, {
      ...ent,
      set(P) {
        setSurfaceUniforms(P);
        if (opts.noCoat) U1(P, 'uCoatEdge', -2.5);
        U1(P, 'uSeed', seed);
        U1(P, 'uGlow', opts.glow || 0);
        U1(P, 'uGhost', opts.ghost === undefined ? 1 : opts.ghost);
      },
    });
  }

  function render() {
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(0.043, 0.031, 0.024, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (maskDirty) {
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
      maskDirty = false;
    }

    // background
    gl.useProgram(progs.bg.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    const ap = aloc(progs.bg, 'aPos');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    U2(progs.bg, 'uRes', glCanvas.width, glCanvas.height);
    U1(progs.bg, 'uTime', time);
    U1(progs.bg, 'uFocus', bgFocus);
    U1(progs.bg, 'uSpot', bgSpot);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const woodEnt = (x, y, hw, hh, rad, a, b) => drawMesh(progs.wood, unitQuad, {
      x, y, scale: 1, sx: hw, sy: hh,
      set(P) {
        U2(P, 'uHalf', hw, hh); U1(P, 'uRad', rad);
        U3(P, 'uColA', a[0], a[1], a[2]); U3(P, 'uColB', b[0], b[1], b[2]);
      },
    });

    if (state === S.SELECT || state === S.ZOOM) {
      // shelf boards under each row
      const landscape = W > H * 1.25;
      const woodA = [0.205, 0.13, 0.085], woodB = [0.30, 0.20, 0.125];
      if (landscape) woodEnt(0, -0.62, 4.1, 0.10, 0.05, woodA, woodB);
      else {
        woodEnt(0, 0.22, 2.35, 0.09, 0.05, woodA, woodB);
        woodEnt(0, -1.48, 1.8, 0.09, 0.05, woodA, woodB);
      }
      for (const it of items) {
        if (it.chosen) continue;
        if (it.alpha <= 0.01) continue;
        drawObjectAt(it, it.shelfPos[0], it.shelfPos[1], it.scale, it.alpha);
        for (const s of it.slots) {           // ghost shimmer of the motif
          drawPieceMesh(s.mesh, {
            x: it.shelfPos[0], y: it.shelfPos[1], scale: it.scale,
          }, s.seed, { ghost: (0.30 + 0.10 * Math.sin(time * 1.8 + it.i)) * it.alpha,
            noCoat: true });
        }
      }
    }

    if (item) {
      const isZoom = state === S.ZOOM;
      const scl = isZoom ? (item.scaleNow || item.scale) : 1;
      const pos = isZoom ? item.pos : [0, 0];
      // work bench
      if (!isZoom || stateT > 0.3) {
        woodEnt(0, -2.15, 3.6, 1.5, 0.12,
          [0.19, 0.12, 0.078], [0.27, 0.18, 0.11]);
      }
      drawObjectAt(item, pos[0], pos[1], scl, 1);

      const showSlots = state === S.TRAY_IN || state === S.PLACE;
      if (showSlots) {
        for (const s of item.slots) {
          if (s.filled) continue;
          const isNear = dragging && dragging.nearSlot === s;
          // attract glow behind the recess
          drawMesh(progs.glow, s.mesh, {
            x: pos[0], y: pos[1], scale: scl * 1.0, pivot: [0, 0],
            set(P) {
              U3(P, 'uColor', 0.55, 0.75, 0.9);
              U1(P, 'uAlphaF', isNear ? 0.5 : 0.10 + 0.06 * Math.sin(time * 2.2 + s.idx));
              U1(P, 'uMode', 1);
            },
          });
          drawMesh(progs.slot, s.mesh, {
            x: pos[0], y: pos[1], scale: scl * 0.985,
            set(P) { U1(P, 'uTime', time); U1(P, 'uPulse', s.idx * 1.7); },
          });
        }
      }

      // placed pieces (seam + shell), in slot order so overlaps stack right
      for (const s of item.slots) {
        const p = pieces.find(q => q.slot === s &&
          (q.state === 'placed' || q.state === 'snapping'));
        if (!p) continue;
        if (p.state === 'placed') {
          drawMesh(progs.glow, s.mesh, {   // dark seam framing the inlay
            x: pos[0], y: pos[1], scale: scl * 1.045,
            set(P) { U3(P, 'uColor', 0.01, 0.008, 0.006); U1(P, 'uAlphaF', 0.85); U1(P, 'uMode', 1); },
          });
          drawPieceMesh(s.mesh, { x: pos[0], y: pos[1], scale: scl, tiltShift: 0.028 },
            p.seed, {});
        } else {
          const c = s.centroid;
          drawPieceMesh(s.mesh, {
            x: p.pos[0], y: p.pos[1],
            pivot: [c[0], c[1]],
            scale: scl * p.dispScaleNow,
          }, p.seed, { noCoat: true, glow: 0.25 });
        }
      }

      // tray + loose pieces
      if (state === S.TRAY_IN || state === S.PLACE) {
        const T = trayLayout();
        woodEnt(0, T.trayCY - 0.02, T.trayW / 2, T.trayH / 2, 0.22,
          [0.10, 0.10, 0.13], [0.16, 0.155, 0.19]);
        const loose = pieces.filter(p => p.state === 'tray');
        for (const p of loose) {
          drawMesh(progs.glow, p.mesh, {   // soft resting shadow
            x: p.pos[0] + 0.02, y: p.pos[1] - 0.04,
            pivot: [p.home.centroid[0], p.home.centroid[1]],
            scale: p.dispScale * 1.1,
            set(P) { U3(P, 'uColor', 0, 0, 0); U1(P, 'uAlphaF', 0.35 * p.vis); U1(P, 'uMode', 1); },
          });
          drawPieceMesh(p.mesh, {
            x: p.pos[0], y: p.pos[1],
            pivot: [p.home.centroid[0], p.home.centroid[1]],
            scale: p.dispScale * (0.7 + 0.3 * p.vis),
          }, p.seed, { noCoat: true, ghost: p.vis, glow: 0.10 });
        }
        if (dragging && dragging.mesh) {
          const p = dragging;
          drawMesh(progs.glow, p.mesh, {
            x: p.pos[0] + 0.04, y: p.pos[1] - 0.07,
            pivot: [p.home.centroid[0], p.home.centroid[1]],
            scale: p.dispScale * 1.25,
            set(P) { U3(P, 'uColor', 0, 0, 0); U1(P, 'uAlphaF', 0.4); U1(P, 'uMode', 1); },
          });
          drawPieceMesh(p.mesh, {
            x: p.pos[0], y: p.pos[1],
            pivot: [p.home.centroid[0], p.home.centroid[1]],
            scale: p.dispScale * 1.16,
          }, p.seed, { noCoat: true, glow: 0.5 });
        }
      }
    }

    drawOverlay();
  }

  function drawOverlay() {
    const ctx = fxCtx;
    ctx.clearRect(0, 0, W, H);
    layoutButtons();

    FX.draw(ctx, (x, y) => w2s(x, y), cam.z);

    // guide hand
    if (handHint) {
      const t = handHint.t;
      if (handHint.mode === 'drag' && pieces.length) {
        const p = pieces.find(q => q.state === 'tray');
        if (p) {
          const slot = item.slots.find(s => !s.filled && s.group === p.group);
          if (slot) {
            const cyc = (t % 2.4) / 2.4;
            const e = cyc < 0.5 ? cyc * 2 : 1;
            const a = cyc > 0.85 ? (1 - cyc) / 0.15 : 1;
            const from = w2s(p.pos[0], p.pos[1]);
            const to = w2s(slot.centroid[0], slot.centroid[1]);
            const hx = from[0] + (to[0] - from[0]) * e * e * (3 - 2 * e);
            const hy = from[1] + (to[1] - from[1]) * e * e * (3 - 2 * e);
            FX.hand(ctx, hx, hy + 14, 1.1, 0.5 * a);
          }
        }
      } else if (handHint.mode === 'rub') {
        const sp = handHint.spot || [0, 0];
        const c = w2s(sp[0], sp[1]);
        const rx = Math.cos(t * 4.2) * 46, ry = Math.sin(t * 8.4) * 20;
        FX.hand(ctx, c[0] + rx, c[1] + ry + 12, 1.15, 0.45);
      }
    }

    // craftsman by the bench
    if (craftsmanAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = craftsmanAlpha;
      if (state === S.COAT) {
        const e = w2s(coatEdge * 1.0, 0);
        const top = w2s(0, 1.35)[1], bot = w2s(0, -1.35)[1];
        FX.coatBrush(ctx, e[0], top, bot, time);
      } else {
        const s = Math.min(W, H) / 760;
        FX.craftsman(ctx, W - 86 * s * 1.2, H - 150 * s * 1.2, s * 1.15, time);
      }
      ctx.restore();
    }

    // buttons
    for (const b of buttons) {
      const pr = pressedButton === b;
      if (b.type === 'home') FX.iconHome(ctx, b.x, b.y, b.r, pr);
      else FX.iconAgain(ctx, b.x, b.y, b.r, pr, time);
    }
  }

  // ---------------- boot -----------------------------------------------
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [glCanvas, fxCanvas]) {
      c.style.width = W + 'px';
      c.style.height = H + 'px';
    }
    glCanvas.width = Math.round(W * DPR);
    glCanvas.height = Math.round(H * DPR);
    fxCanvas.width = Math.round(W * DPR);
    fxCanvas.height = Math.round(H * DPR);
    fxCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    setCamTarget();
    cam.x = camT.x; cam.y = camT.y; cam.z = camT.z;
  }

  function initGL() {
    gl = glCanvas.getContext('webgl', { alpha: false, antialias: true })
      || glCanvas.getContext('experimental-webgl', { alpha: false, antialias: true });
    if (!gl) {
      document.getElementById('nogl').style.display = 'block';
      return false;
    }
    progs.lacquer = makeProgram(Shaders.VS_ENTITY, Shaders.FS_LACQUER);
    progs.piece = makeProgram(Shaders.VS_ENTITY, Shaders.FS_PIECE);
    progs.slot = makeProgram(Shaders.VS_ENTITY, Shaders.FS_SLOT);
    progs.glow = makeProgram(Shaders.VS_ENTITY, Shaders.FS_GLOW);
    progs.wood = makeProgram(Shaders.VS_ENTITY, Shaders.FS_WOOD);
    progs.bg = makeProgram(Shaders.VS_BG, Shaders.FS_BG);
    bgBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    maskTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    maskDirty = true;
    return true;
  }

  let lastFrame = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  glCanvas.addEventListener('webglcontextlost', e => e.preventDefault());
  glCanvas.addEventListener('webglcontextrestored', () => {
    meshCache = new Map();
    progs = {};
    initGL();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Sound.polishStop();
  });

  buildItems();
  clearMask();
  if (initGL()) {
    resize();
    bindInput();
    requestAnimationFrame(frame);
  }

  // ---------------- test hooks (harmless in production) -----------------
  window.__raden = {
    get state() { return state; },
    get progress() { return progress; },
    itemScreen(i) { const it = items[i]; return w2s(it.shelfPos[0], it.shelfPos[1]); },
    pieceScreens() {
      return pieces.map(p => ({ state: p.state, s: w2s(p.pos[0], p.pos[1]) }));
    },
    slotScreens() {
      if (!item) return [];
      return item.slots.map(s => ({ filled: s.filled, group: s.group,
        s: w2s(s.centroid[0], s.centroid[1]) }));
    },
    pieceForSlot(j) {
      const s = item.slots[j];
      const p = pieces.find(q => q.state === 'tray' && q.group === s.group);
      return p ? w2s(p.pos[0], p.pos[1]) : null;
    },
    objectScreen() { return w2s(0, 0); },
    camz() { return cam.z; },
    skipWait() { stateT += 10; },
  };
})();
