// Painter-ordered renderer: sky, cloud sea, shadow, child, rings, near mist,
// then a soft bloom pass. No depth buffer — everything is sorted on the CPU.

import * as G from './gl.js';
import * as S from './shaders.js';
import { mat4, perspective, lookAt, multiply, invert, clamp, lerp, smoothstep } from './math.js';
import { CHAR_H, CHAR_W, TERRACE_Y } from './scene.js';

const SPARK_COLORS = [
  [1.0, 0.78, 0.88], [0.72, 0.88, 1.0], [0.82, 0.74, 1.0],
  [1.0, 0.92, 0.72], [1.0, 1.0, 1.0],
];

export function createRenderer(gl, assets) {
  const quad = G.createQuad(gl);
  const emptyVAO = G.createEmptyVAO(gl);

  const prog = {
    sky: G.createProgram(gl, S.FS_TRI_VS, S.SKY_FS, 'sky'),
    floor: G.createProgram(gl, S.FLOOR_VS, S.FLOOR_FS, 'floor'),
    card: G.createProgram(gl, S.CARD_VS, S.CARD_FS, 'card'),
    shadow: G.createProgram(gl, S.SHADOW_VS, S.SHADOW_FS, 'shadow'),
    ground: G.createProgram(gl, S.GROUND_VS, S.GROUND_FS, 'ground'),
    char: G.createProgram(gl, S.CHAR_VS, S.CHAR_FS, 'char'),
    glory: G.createProgram(gl, S.GLORY_VS, S.GLORY_FS, 'glory'),
    spark: G.createProgram(gl, S.SPARK_VS, S.SPARK_FS, 'spark'),
    bright: G.createProgram(gl, S.FS_TRI_VS, S.BRIGHT_FS, 'bright'),
    blur: G.createProgram(gl, S.FS_TRI_VS, S.BLUR_FS, 'blur'),
    comp: G.createProgram(gl, S.FS_TRI_VS, S.COMPOSITE_FS, 'composite'),
  };

  const noise = G.textureFromData(gl, assets.noise.size, assets.noise.size, assets.noise.data, { wrap: gl.REPEAT });
  const puff = G.textureFromCanvas(gl, assets.puff);
  const spark = G.textureFromCanvas(gl, assets.sparkle);
  const terrace = G.textureFromCanvas(gl, assets.terrace);
  let atlas = G.textureFromCanvas(gl, assets.atlas);
  let silh = G.textureFromCanvas(gl, assets.silhouette);

  const sceneRT = G.createRenderTarget(gl, 8, 8);
  const bloomA = G.createRenderTarget(gl, 4, 4);
  const bloomB = G.createRenderTarget(gl, 4, 4);

  // One instanced VAO per card group, plus one for sparkles.
  const cardFar = makeInstancedVAO(gl, quad, 8);
  const cardMid = makeInstancedVAO(gl, quad, 8);
  const cardNear = makeInstancedVAO(gl, quad, 8);
  const sparkVAO = makeInstancedVAO(gl, quad, 8);

  const proj = mat4(), view = mat4(), vp = mat4(), invVP = mat4();
  let W = 8, H = 8;

  function setCharacter(atlasCanvas, silhCanvas) {
    gl.deleteTexture(atlas);
    gl.deleteTexture(silh);
    atlas = G.textureFromCanvas(gl, atlasCanvas);
    silh = G.textureFromCanvas(gl, silhCanvas);
  }

  function resize(w, h) {
    W = Math.max(2, w | 0); H = Math.max(2, h | 0);
    sceneRT.resize(W, H);
    bloomA.resize(Math.max(2, W >> 2), Math.max(2, H >> 2));
    bloomB.resize(Math.max(2, W >> 2), Math.max(2, H >> 2));
  }

  function render(s, cam, opts = {}) {
    const aspect = W / H;
    // Portrait needs a taller frame so the child and the rings both fit.
    const ref = 1.4;
    let vfov = (cam.fov * Math.PI) / 180;
    if (aspect < ref) {
      const f = clamp(Math.pow(ref / aspect, 0.42), 1, 1.5);
      vfov = 2 * Math.atan(Math.tan(vfov / 2) * f);
    }
    perspective(proj, vfov, aspect, 0.08, 400);
    lookAt(view, cam.eye, cam.target, [0, 1, 0]);
    multiply(vp, proj, view);
    invert(invVP, vp);

    const sky = s.sky;
    const common = { u_vp: vp, u_time: s.time, u_noise: G.tex(noise) };

    sceneRT.bind();
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    /* sky ---------------------------------------------------------------- */
    gl.bindVertexArray(emptyVAO);
    prog.sky.use().set({
      u_invVP: invVP, u_camPos: cam.eye, u_sunDir: s.sunDir,
      u_skyTop: sky.top, u_skyMid: sky.mid, u_skyHaze: sky.haze, u_sunCol: sky.sun,
      u_time: s.time, u_noise: G.tex(noise),
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    /* distant cloud sea --------------------------------------------------- */
    const counts = buildCards(gl, s, cam, cardFar, cardMid, cardNear);
    const cardUniforms = {
      ...common, u_puff: G.tex(puff), u_camRight: cam.right, u_camUp: cam.up,
      u_camPos: cam.eye, u_cloudLit: sky.cloudLit, u_cloudDark: sky.cloudDark,
      u_skyHaze: sky.haze,
    };
    prog.card.use().set(cardUniforms);
    gl.bindVertexArray(cardFar.vao);
    if (counts.far) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, counts.far);

    /* fog surface --------------------------------------------------------- */
    prog.floor.use().set({
      ...common, u_extent: [230, 230], u_origin: [cam.eye[0], cam.eye[2]], u_fog: s.fog,
      u_fogCol: sky.fog, u_fogLit: sky.fogLit, u_skyHaze: sky.haze,
      u_camPos: cam.eye, u_glory: [s.gloryCenter[0], s.gloryCenter[2]],
      u_glow: s.glow,
    });
    gl.bindVertexArray(quad.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* mid fog bank -------------------------------------------------------- */
    prog.card.use().set(cardUniforms);
    gl.bindVertexArray(cardMid.vao);
    if (counts.mid) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, counts.mid);

    /* the child's shadow, standing in the fog ----------------------------- */
    const clarity = smoothstep(0.05, 0.5, s.fog) * (0.6 + 0.4 * smoothstep(0.2, 0.9, s.fog));
    if (clarity > 0.01) {
      prog.shadow.use().set({
        ...common, u_silh: G.tex(silh), u_clarity: clarity,
        u_shadowCol: sky.shadow, u_camPos: cam.eye,
        u_c00: s.corners.c00, u_c10: s.corners.c10,
        u_c01: s.corners.c01, u_c11: s.corners.c11,
      });
      gl.bindVertexArray(quad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* the rainbow crown, out in the fog behind the child ------------------ */
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (s.glow > 0.004) {
      const size = s.glorySize * (0.86 + 0.30 * s.score + 0.14 * s.crown);
      prog.glory.use().set({
        ...common, u_center: s.gloryCenter, u_camRight: cam.right, u_camUp: cam.up,
        u_size: size, u_glow: s.glow * (1 + 0.25 * s.crown), u_sat: s.sat,
        u_rings: s.ringCount, u_thick: s.ringThick, u_seed: (s.seed % 100) / 17,
        u_r0: s.ringR0, u_gap: s.ringGap,
      });
      gl.bindVertexArray(quad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* sparkles ------------------------------------------------------------ */
    gl.blendFunc(gl.ONE, gl.ONE);
    const nSpark = buildSparks(gl, s, sparkVAO);
    if (nSpark) {
      prog.spark.use().set({
        u_vp: vp, u_spark: G.tex(spark), u_camRight: cam.right, u_camUp: cam.up,
      });
      gl.bindVertexArray(sparkVAO.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nSpark);
    }

    /* terrace + child ----------------------------------------------------- */
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    prog.ground.use().set({
      u_vp: vp, u_time: s.time, u_noise: G.tex(noise), u_tex: G.tex(terrace),
      u_center: [0, TERRACE_Y, s.charZ + 0.55], u_size: [5.2, 1.6],
      u_tint: sky.terrace || [0.65, 0.62, 0.78], u_rim: sky.sun,
    });
    gl.bindVertexArray(quad.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    prog.char.use().set({
      u_vp: vp, u_atlas: G.tex(atlas), u_center: [s.charX, TERRACE_Y, s.charZ],
      u_camRight: cam.right, u_size: [CHAR_W, CHAR_H],
      u_tileA: cam.tileA, u_tileB: cam.tileB, u_mix: cam.tileMix,
      u_rim: sky.sun, u_rimAmt: 0.55,
    });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* near mist veils the rings ------------------------------------------- */
    prog.card.use().set(cardUniforms);
    gl.bindVertexArray(cardNear.vao);
    if (counts.near) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, counts.near);

    /* bloom + composite --------------------------------------------------- */
    gl.disable(gl.BLEND);
    gl.bindVertexArray(emptyVAO);

    bloomA.bind();
    prog.bright.use().set({ u_src: G.tex(sceneRT.color), u_threshold: 0.86 });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    bloomB.bind();
    prog.blur.use().set({ u_src: G.tex(bloomA.color), u_dir: [1.2 / bloomA.width, 0] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    bloomA.bind();
    prog.blur.use().set({ u_src: G.tex(bloomB.color), u_dir: [0, 1.2 / bloomA.height] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    bloomB.bind();
    prog.blur.use().set({ u_src: G.tex(bloomA.color), u_dir: [2.6 / bloomA.width, 0] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    bloomA.bind();
    prog.blur.use().set({ u_src: G.tex(bloomB.color), u_dir: [0, 2.6 / bloomA.height] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    prog.comp.use().set({
      u_src: G.tex(sceneRT.color), u_bloom: G.tex(bloomA.color),
      u_bloomAmt: 0.34 + 0.30 * s.glow + 0.16 * s.crown,
      u_vignette: 0.55, u_fade: opts.fade === undefined ? 1 : opts.fade,
      u_time: s.time,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  return { render, resize, setCharacter };
}

function makeInstancedVAO(gl, quad, floatsPerInstance) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad.buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const stride = floatsPerInstance * 4;
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 16);
  gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);
  return { vao, buf, data: new Float32Array(0) };
}

const scratch = { far: [], mid: [], near: [] };

// Cards are animated on the CPU: they drift, they rise as fog gathers, and
// they slide with the player's drag.
function buildCards(gl, s, cam, vaoFar, vaoMid, vaoNear) {
  const t = s.time;
  const gather = smoothstep(0.0, 0.9, s.fog);
  const focus = [s.charX, 0.5, s.charZ - 8];

  scratch.far.length = 0; scratch.mid.length = 0; scratch.near.length = 0;

  const place = (c, out) => {
    const w = t * 0.06 * c.drift + c.phase;
    let x = c.base[0] + Math.sin(w) * 1.6 * c.drift;
    let y = c.base[1] + Math.sin(w * 0.7 + 1.3) * 0.22;
    let z = c.base[2] + Math.cos(w * 0.8) * 1.0 * c.drift;

    if (c.layer > 0) {
      const g = gather * (c.layer === 1 ? 0.30 : 0.20);
      x = lerp(x, focus[0], g);
      y = lerp(y, focus[1], g * 0.55) + s.fog * 0.55 + s.fogPan[1];
      z = lerp(z, focus[2], g * 0.35);
      x += s.fogPan[0];
    } else {
      y += s.fog * 0.2;
    }

    let alpha = c.alpha;
    if (c.layer === 0) alpha *= 0.62 + 0.5 * s.fog;
    else if (c.layer === 1) alpha *= 0.18 + 0.85 * s.fog + 0.30 * s.mist;
    else alpha *= 0.10 + 0.42 * s.fog + 0.22 * s.mist;

    const size = c.size * (c.layer === 0 ? 1 : 0.75 + 0.45 * s.fog + 0.2 * s.mist);
    const dx = x - cam.eye[0], dy = y - cam.eye[1], dz = z - cam.eye[2];
    out.push({ x, y, z, size, rot: c.rot + t * 0.012 * c.drift, seed: c.seed,
               alpha, warm: c.warm, d: dx * dx + dy * dy + dz * dz });
  };

  for (const c of s.cards.back) place(c, c.layer === 0 ? scratch.far : scratch.mid);
  for (const c of s.cards.front) place(c, scratch.near);

  scratch.far.sort((a, b) => b.d - a.d);
  scratch.mid.sort((a, b) => b.d - a.d);
  scratch.near.sort((a, b) => b.d - a.d);

  const upload = (vao, list) => {
    if (!list.length) return 0;
    const data = ensure(vao, list.length * 8);
    writeCards(data, list);
    gl.bindBuffer(gl.ARRAY_BUFFER, vao.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    return list.length;
  };

  return {
    far: upload(vaoFar, scratch.far),
    mid: upload(vaoMid, scratch.mid),
    near: upload(vaoNear, scratch.near),
  };
}

// Keeps a growing scratch buffer and hands back a view of exactly n floats.
function ensure(vao, n) {
  if (vao.data.length < n) vao.data = new Float32Array(Math.max(n, 64));
  return vao.data.length === n ? vao.data : vao.data.subarray(0, n);
}

function writeCards(arr, list) {
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const o = i * 8;
    arr[o] = c.x; arr[o + 1] = c.y; arr[o + 2] = c.z; arr[o + 3] = c.size;
    arr[o + 4] = c.rot; arr[o + 5] = c.seed; arr[o + 6] = c.alpha; arr[o + 7] = c.warm;
  }
}

function buildSparks(gl, s, vao) {
  const n = s.sparks.length;
  if (!n) return 0;
  const data = ensure(vao, n * 8);
  for (let i = 0; i < n; i++) {
    const p = s.sparks[i];
    const col = SPARK_COLORS[(p.hue * SPARK_COLORS.length) | 0];
    const o = i * 8;
    data[o] = p.p[0]; data[o + 1] = p.p[1]; data[o + 2] = p.p[2];
    data[o + 3] = p.size * (0.5 + p.life);
    data[o + 4] = col[0]; data[o + 5] = col[1]; data[o + 6] = col[2];
    data[o + 7] = Math.sin(Math.min(1, p.life) * Math.PI) * 0.9;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, vao.buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  return n;
}
