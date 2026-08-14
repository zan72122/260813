// Hero 素材（プリン・カラメル・銀の型・皿・液体）を WebGL2 で描くレイヤー。
// 描画順:
//   1. 背景の縮小コピーを alpha=0 で敷く（屈折で拾うためだけの下地）
//   2. 不透明（皿・型）を深度つきで描く
//   3. ここまでをコピー（これが「背後」になる）
//   4. 屈折する物（プリン・液体・注ぐ流れ）を描く
//   5. しきい値抽出 → ぼかし → トーンマップして画面へ
import { createGL, program, texture, fullscreenVAO, Target, MSTarget, TIER } from './glx.js';
import { bakeEnv, bakeDetail } from './env.js';
import * as G from './geom.js';
import * as M from './mat.js';
import * as S from './shaders.js';
import { MOLD, PUD, PLATE } from '../art.js';

const RENDER_SCALE = [0.62, 0.85, 1.0];

export class Hero {
  constructor(canvas) {
    this.ok = false;
    const gl = createGL(canvas);
    if (!gl) return;
    this.gl = gl;
    this.canvas = canvas;
    try {
      this._init();
      this.ok = true;
    } catch (e) {
      console.error('[hero] init failed', e);
      this.ok = false;
    }
  }

  _init() {
    const gl = this.gl;
    this.progPudding = program(gl, S.VS_LATHE, S.FS_PUDDING, 'pudding');
    this.progMetal = program(gl, S.VS_LATHE, S.FS_METAL, 'metal');
    this.progCeramic = program(gl, S.VS_LATHE, S.FS_CERAMIC, 'ceramic');
    this.progLiquid = program(gl, S.VS_LATHE, S.FS_LIQUID, 'liquid');
    this.progTube = program(gl, S.VS_TUBE, S.FS_TUBE, 'tube');
    this.progBackdrop = program(gl, S.VS_FULL, S.FS_BACKDROP, 'backdrop');
    this.progThreshold = program(gl, S.VS_FULL, S.FS_THRESHOLD, 'threshold');
    this.progBlur = program(gl, S.VS_FULL, S.FS_BLUR, 'blur');
    this.progComposite = program(gl, S.VS_FULL, S.FS_COMPOSITE, 'composite');
    this.progField = program(gl, S.VS_FULL, S.FS_FIELD, 'field');
    if (!this.progPudding || !this.progMetal || !this.progComposite) {
      throw new Error('shader compilation failed');
    }

    const env = bakeEnv(gl);
    this.envTex = env.tex;
    this.envMaxLod = env.maxLod;
    this.detailTex = bakeDetail(gl);

    this.meshes = {
      pudding: G.upload(gl, this.progPudding, G.lathe(G.puddingProfile(PUD.rb, PUD.rt, PUD.h), 56, { height: PUD.h })),
      mold: G.upload(gl, this.progMetal, G.lathe(G.moldProfile(MOLD.rb, MOLD.rt, MOLD.h, MOLD.wall), 56, { height: MOLD.h })),
      plate: G.upload(gl, this.progCeramic, G.lathe(G.plateProfile(PLATE.r, PLATE.h), 64, { height: PLATE.h + 2 })),
      liquid: G.upload(gl, this.progLiquid, G.lathe(G.liquidProfile(1), 48, { height: 1.7 })),
      pot: G.upload(gl, this.progMetal, G.lathe(G.potProfile(52, 62, 40, 3.2), 48, { height: 40 })),
      bowl: G.upload(gl, this.progCeramic, G.lathe(G.bowlProfile(74, 46, 3.6), 48, { height: 46 })),
    };

    this.fsVao = fullscreenVAO(gl);
    this.field = new Target(gl, 512, 256, {});
    this.fieldFlow = -1;
    this.main = null;
    this.ms = null;
    this.samples = 0;
    this.scene = null;
    this.bloomA = null;
    this.bloomB = null;

    // 屈折用に 2D レイヤーを縮小して取り込むための作業キャンバス
    this.refCanvas = document.createElement('canvas');
    this.refCtx = this.refCanvas.getContext('2d', { alpha: false });
    this.refTex = texture(gl, {});

    // 動的なチューブ（注ぐ流れ）
    this.tube = this._makeTube(24, 10);

    this.model = M.ident();
    this.nrm = new Float32Array(9);
    this.cmds = { opaque: [], refract: [] };
    this.warmed = false;
  }

  _makeTube(segs, ring) {
    const gl = this.gl;
    const n = (segs + 1) * (ring + 1);
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const uv = new Float32Array(n * 3);
    const idx = [];
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < ring; j++) {
        const a = i * (ring + 1) + j;
        idx.push(a, a + ring + 1, a + 1, a + 1, a + ring + 1, a + ring + 2);
      }
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const mk = (name, arr, size) => {
      const loc = this.progTube.a[name];
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
      if (loc != null && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      }
      return b;
    };
    const bPos = mk('aPos', pos, 3);
    const bNrm = mk('aNrm', nrm, 3);
    const bUv = mk('aUv', uv, 3);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, bPos, bNrm, bUv, pos, nrm, uv, count: idx.length, segs, ring };
  }

  resize(view, tier) {
    const gl = this.gl;
    const scale = RENDER_SCALE[tier] ?? 1;
    const w = Math.max(2, Math.round(view.w * view.dpr * scale));
    const h = Math.max(2, Math.round(view.h * view.dpr * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = view.w + 'px';
      this.canvas.style.height = view.h + 'px';
    }
    const half = { half: true };
    // ジャギーは「安い 3D」に見える最大の原因なので、余裕がある層では MSAA を使う
    const want = tier >= TIER.HIGH ? 4 : 0;
    if (!this.main) {
      this.main = new Target(gl, w, h, { ...half, depth: true });
      this.scene = new Target(gl, w, h, half);
      this.bloomA = new Target(gl, w >> 2, h >> 2, half);
      this.bloomB = new Target(gl, w >> 2, h >> 2, half);
    } else {
      this.main.resize(w, h);
      this.scene.resize(w, h);
      this.bloomA.resize(Math.max(2, w >> 2), Math.max(2, h >> 2));
      this.bloomB.resize(Math.max(2, w >> 2), Math.max(2, h >> 2));
    }
    if (want !== this.samples) {
      this.samples = want;
      this.ms = null;
    }
    if (this.samples > 0) {
      const max = gl.getParameter(gl.MAX_SAMPLES) || 0;
      const sm = Math.min(this.samples, max);
      if (sm <= 0) {
        this.samples = 0;
        this.ms = null;
      } else if (!this.ms) {
        const t = new MSTarget(gl, w, h, sm, true);
        this.ms = t.complete ? t : null;
        if (!this.ms) this.samples = 0;
      } else {
        this.ms.resize(w, h);
      }
    }
    const rw = Math.max(8, Math.round(view.w / 4));
    const rh = Math.max(8, Math.round(view.h / 4));
    if (this.refCanvas.width !== rw || this.refCanvas.height !== rh) {
      this.refCanvas.width = rw;
      this.refCanvas.height = rh;
    }
  }

  // --- シーン記述 -----------------------------------------------------------
  begin() {
    this.cmds.opaque.length = 0;
    this.cmds.refract.length = 0;
  }
  plate(o) {
    this.cmds.opaque.push({ t: 'plate', o });
  }
  mold(o) {
    this.cmds.opaque.push({ t: 'mold', o });
  }
  pot(o) {
    this.cmds.opaque.push({ t: 'pot', o });
  }
  bowl(o) {
    this.cmds.opaque.push({ t: 'bowl', o });
  }
  pudding(o) {
    this.cmds.refract.push({ t: 'pudding', o });
  }
  liquid(o) {
    this.cmds.refract.push({ t: 'liquid', o });
  }
  stream(o) {
    this.cmds.refract.push({ t: 'stream', o });
  }
  get empty() {
    return this.cmds.opaque.length === 0 && this.cmds.refract.length === 0;
  }

  // --- 描画 -----------------------------------------------------------------
  render(view, backCanvas, tier, time) {
    const gl = this.gl;
    this.resize(view, tier);
    const refract = tier >= TIER.MID ? 1 : 0;
    const bloom = tier >= TIER.MID;

    // カラメルの厚み場（flow が動いたときだけ焼き直す）
    let flow = 0;
    for (const c of this.cmds.refract) if (c.t === 'pudding') flow = Math.max(flow, c.o.caramelFlow || 0);
    if (Math.abs(flow - this.fieldFlow) > 0.004) {
      this.fieldFlow = flow;
      this._bakeField(flow);
    }

    // 屈折用の背景取り込み
    if (refract && backCanvas) {
      this.refCtx.drawImage(backCanvas, 0, 0, this.refCanvas.width, this.refCanvas.height);
      gl.bindTexture(gl.TEXTURE_2D, this.refTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.refCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    const rt = this.ms || this.main;
    rt.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);

    // 1. 背景の下地（alpha=0 なので合成では見えないが、屈折では拾える）
    if (refract && backCanvas) {
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.progBackdrop);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.refTex);
      gl.uniform1i(this.progBackdrop.u.uTex, 0);
      gl.bindVertexArray(this.fsVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    // 2. 不透明
    for (const c of this.cmds.opaque) {
      if (c.t === 'plate') this._drawPlate(view, c.o);
      else if (c.t === 'mold') this._drawMold(view, c.o);
      else if (c.t === 'pot') this._drawVessel(view, c.o, this.meshes.pot, 'metal', 40);
      else if (c.t === 'bowl') this._drawVessel(view, c.o, this.meshes.bowl, 'ceramic', 46);
    }

    // 3. 背後をコピー（MSAA はここで解決される）
    if (refract) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rt.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.scene.fbo);
      gl.blitFramebuffer(
        0, 0, rt.w, rt.h,
        0, 0, this.scene.w, this.scene.h,
        gl.COLOR_BUFFER_BIT, gl.NEAREST
      );
      rt.bind();
    }

    // 4. 屈折する物
    for (const c of this.cmds.refract) {
      if (c.t === 'pudding') this._drawPudding(view, c.o, refract);
      else if (c.t === 'liquid') this._drawLiquid(view, c.o, refract, time);
      else if (c.t === 'stream') this._drawStream(view, c.o, refract);
    }

    // 5. MSAA を解決してからポストへ
    if (this.ms) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.ms.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.main.fbo);
      gl.blitFramebuffer(
        0, 0, this.ms.w, this.ms.h,
        0, 0, this.main.w, this.main.h,
        gl.COLOR_BUFFER_BIT, gl.NEAREST
      );
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.fsVao);
    if (bloom) {
      this.bloomA.bind();
      gl.useProgram(this.progThreshold);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.main.tex);
      gl.uniform1i(this.progThreshold.u.uTex, 0);
      gl.uniform1f(this.progThreshold.u.uThreshold, 0.82);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      for (let pass = 0; pass < 2; pass++) {
        const src = pass === 0 ? this.bloomA : this.bloomB;
        const dst = pass === 0 ? this.bloomB : this.bloomA;
        dst.bind();
        gl.useProgram(this.progBlur);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(this.progBlur.u.uTex, 0);
        gl.uniform2f(
          this.progBlur.u.uDir,
          pass === 0 ? 1.4 / dst.w : 0,
          pass === 0 ? 0 : 1.4 / dst.h
        );
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.progComposite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.main.tex);
    gl.uniform1i(this.progComposite.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloom ? this.bloomA.tex : this.main.tex);
    gl.uniform1i(this.progComposite.u.uBloom, 1);
    gl.uniform1f(this.progComposite.u.uBloomAmt, bloom ? 1.05 : 0.0);
    gl.uniform1f(this.progComposite.u.uExposure, 1.12);
    gl.uniform1f(this.progComposite.u.uGrain, tier >= TIER.MID ? 0.012 : 0.0);
    gl.uniform1f(this.progComposite.u.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  _bakeField(flow) {
    const gl = this.gl;
    this.field.bind();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.useProgram(this.progField);
    gl.uniform1f(this.progField.u.uFlow, flow);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  _common(prog, view) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(prog.u.uProj, false, view.proj);
    const v = view.viewDir();
    gl.uniform3f(prog.u.uV, v[0], v[1], v[2]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.envTex);
    gl.uniform1i(prog.u.uEnv, 0);
    gl.uniform1f(prog.u.uEnvMaxLod, this.envMaxLod);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.detailTex);
    if (prog.u.uDetail) gl.uniform1i(prog.u.uDetail, 1);
  }

  _setModel(prog, o, sxz = 1, sy = 1) {
    const gl = this.gl;
    const m = this.model;
    M.translate(m, o.x || 0, o.base || 0, o.z || 0);
    if (o.rotX || o.rotZ) {
      const t = M.ident();
      M.translate(t, 0, o.pivotY || 0, 0);
      M.mul(m, m, t);
      if (o.rotX) {
        M.rotateX(t, o.rotX);
        M.mul(m, m, t);
      }
      if (o.rotZ) {
        M.rotateZ(t, o.rotZ);
        M.mul(m, m, t);
      }
      M.translate(t, 0, -(o.pivotY || 0), 0);
      M.mul(m, m, t);
    }
    if (o.localY) {
      const t = M.translate(M.ident(), 0, o.localY, 0);
      M.mul(m, m, t);
    }
    if (o.flip) {
      const t = M.scale(M.ident(), 1, -1, 1);
      M.mul(m, m, t);
      const t2 = M.translate(M.ident(), 0, -(o.flipH || 0), 0);
      M.mul(m, m, t2);
    }
    if (sxz !== 1 || sy !== 1) {
      const t = M.scale(M.ident(), sxz, sy, sxz);
      M.mul(m, m, t);
    }
    gl.uniformMatrix4fv(prog.u.uModel, false, m);
    // 回転 + 対角スケールの法線行列
    const n = this.nrm;
    M.normalMat3(n, m);
    const isx = 1 / (sxz || 1);
    const isy = 1 / (sy || 1);
    n[0] *= isx * isx;
    n[1] *= isx * isx;
    n[2] *= isx * isx;
    n[3] *= isy * isy;
    n[4] *= isy * isy;
    n[5] *= isy * isy;
    n[6] *= isx * isx;
    n[7] *= isx * isx;
    n[8] *= isx * isx;
    gl.uniformMatrix3fv(prog.u.uNormal, false, n);
    // 変形パラメータ（プリン以外は 0）
    gl.uniform1f(prog.u.uHeight, o.height || 1);
    gl.uniform1f(prog.u.uWobble, o.wobble || 0);
    gl.uniform1f(prog.u.uPhase, o.phase || 0);
    gl.uniform1f(prog.u.uSquash, o.squash || 0);
    gl.uniform1f(prog.u.uStick, o.stick || 0);
  }

  _drawMesh(mesh) {
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  _drawPlate(view, o) {
    const gl = this.gl;
    const p = this.progCeramic;
    this._common(p, view);
    this._setModel(p, { ...o, height: PLATE.h + 2 });
    gl.uniform3f(p.u.uBouncePos, o.x || 0, o.base || 0, 0);
    const bc = o.bounceColor || [0.55, 0.32, 0.08];
    gl.uniform3f(p.u.uBounceColor, bc[0], bc[1], bc[2]);
    gl.uniform1f(p.u.uBounceAmt, o.bounce ?? 0);
    const o0 = o.occ0 || [0, 0, 1, 0];
    const o1 = o.occ1 || [0, 0, 1, 0];
    gl.uniform4f(p.u.uOcc0, o0[0], o0[1], o0[2], o0[3]);
    gl.uniform4f(p.u.uOcc1, o1[0], o1[1], o1[2], o1[3]);
    this._drawMesh(this.meshes.plate);
  }

  _drawMold(view, o) {
    const gl = this.gl;
    const p = this.progMetal;
    this._common(p, view);
    this._setModel(p, { ...o, height: MOLD.h, flipH: MOLD.h });
    gl.uniform1f(p.u.uRibs, o.ribs ?? 1);
    gl.uniform1f(p.u.uFrost, o.frost ?? 0);
    const t = o.tint || [0.93, 0.94, 0.96];
    gl.uniform3f(p.u.uTint, t[0], t[1], t[2]);
    // 反転すると三角形の巻き方向が裏返るので front face を切り替える
    gl.frontFace(o.flip ? gl.CW : gl.CCW);
    this._drawMesh(this.meshes.mold);
    gl.frontFace(gl.CCW);
  }

  _drawVessel(view, o, mesh, kind, height) {
    const gl = this.gl;
    const p = kind === 'metal' ? this.progMetal : this.progCeramic;
    this._common(p, view);
    this._setModel(p, { ...o, height });
    if (kind === 'metal') {
      gl.uniform1f(p.u.uRibs, o.ribs ?? 0);
      gl.uniform1f(p.u.uFrost, o.frost ?? 0);
      const t = o.tint || [0.93, 0.94, 0.96];
      gl.uniform3f(p.u.uTint, t[0], t[1], t[2]);
    } else {
      gl.uniform3f(p.u.uBouncePos, o.x || 0, o.base || 0, 0);
      const bc = o.bounceColor || [0.5, 0.35, 0.1];
      gl.uniform3f(p.u.uBounceColor, bc[0], bc[1], bc[2]);
      gl.uniform1f(p.u.uBounceAmt, o.bounce ?? 0);
      gl.uniform4f(p.u.uOcc0, 0, 0, 1, 0);
      gl.uniform4f(p.u.uOcc1, 0, 0, 1, 0);
    }
    this._drawMesh(mesh);
  }

  _drawPudding(view, o, refract) {
    const gl = this.gl;
    const p = this.progPudding;
    this._common(p, view);
    this._setModel(p, { ...o, height: PUD.h });
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.field.tex);
    gl.uniform1i(p.u.uField, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(p.u.uScene, 3);
    gl.uniform1f(p.u.uRefract, refract);
    gl.uniform1f(p.u.uCaramel, o.caramel ?? 1);
    gl.uniform1f(p.u.uHeightW, PUD.h);
    this._drawMesh(this.meshes.pudding);
  }

  _drawLiquid(view, o, refract, time) {
    const gl = this.gl;
    const p = this.progLiquid;
    this._common(p, view);
    this._setModel(p, { ...o, height: 1.7 }, o.r || 1, 1);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(p.u.uScene, 3);
    gl.uniform1f(p.u.uRefract, refract);
    const s = o.sigma || [0.01, 0.02, 0.05];
    gl.uniform3f(p.u.uSigma, s[0], s[1], s[2]);
    gl.uniform1f(p.u.uDepth, o.depth ?? 6);
    gl.uniform1f(p.u.uRough, o.rough ?? 0.05);
    gl.uniform1f(p.u.uBoil, o.boil ?? 0);
    gl.uniform1f(p.u.uTime, time);
    gl.disable(gl.CULL_FACE);
    this._drawMesh(this.meshes.liquid);
    gl.enable(gl.CULL_FACE);
  }

  _drawStream(view, o, refract) {
    const gl = this.gl;
    const t = this.tube;
    const pts = o.points;
    const segs = t.segs;
    const ring = t.ring;
    let w = 0;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const fi = u * (pts.length - 1);
      const i0 = Math.min(pts.length - 1, Math.floor(fi));
      const i1 = Math.min(pts.length - 1, i0 + 1);
      const f = fi - i0;
      const px = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * f;
      const py = pts[i0][1] + (pts[i1][1] - pts[i0][1]) * f;
      const r = (pts[i0][2] + (pts[i1][2] - pts[i0][2]) * f) || 1;
      // 進行方向（XY 平面内）
      const j0 = Math.max(0, i0 - 1);
      const j1 = Math.min(pts.length - 1, i0 + 1);
      let tx = pts[j1][0] - pts[j0][0];
      let ty = pts[j1][1] - pts[j0][1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const e1x = -ty;
      const e1y = tx;
      for (let j = 0; j <= ring; j++) {
        const a = (j / ring) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = e1x * ca;
        const ny = e1y * ca;
        const nz = sa;
        t.pos[w * 3] = px + nx * r;
        t.pos[w * 3 + 1] = py + ny * r;
        t.pos[w * 3 + 2] = nz * r;
        t.nrm[w * 3] = nx;
        t.nrm[w * 3 + 1] = ny;
        t.nrm[w * 3 + 2] = nz;
        t.uv[w * 3] = j / ring;
        t.uv[w * 3 + 1] = u;
        t.uv[w * 3 + 2] = 0;
        w++;
      }
    }
    const p = this.progTube;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uProj, false, view.proj);
    const v = view.viewDir();
    gl.uniform3f(p.u.uV, v[0], v[1], v[2]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.envTex);
    gl.uniform1i(p.u.uEnv, 0);
    gl.uniform1f(p.u.uEnvMaxLod, this.envMaxLod);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(p.u.uScene, 3);
    gl.uniform1f(p.u.uRefract, refract);
    const s = o.sigma || [0.06, 0.16, 0.42];
    gl.uniform3f(p.u.uSigma, s[0], s[1], s[2]);
    gl.uniform1f(p.u.uRadius, o.radius ?? 5);
    gl.bindVertexArray(t.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, t.bPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, t.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, t.bNrm);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, t.nrm);
    gl.bindBuffer(gl.ARRAY_BUFFER, t.bUv);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, t.uv);
    gl.disable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, t.count, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  // 工程 9 で初めてシェーダを走らせるとカクつくので、前半のうちに一度だけ
  // 全プログラムを小さく走らせて温めておく（大穴 N の実用版）。
  warmup(view) {
    if (this.warmed || !this.ok) return;
    this.warmed = true;
    this.begin();
    this.plate({ x: 0, base: -10000 });
    this.mold({ x: 0, base: -10000 });
    this.pot({ x: 0, base: -10000 });
    this.bowl({ x: 0, base: -10000 });
    this.pudding({ x: 0, base: -10000, caramelFlow: 0.5, wobble: 1, phase: 1 });
    this.liquid({ x: 0, base: -10000, r: 10, depth: 4 });
    this.stream({
      points: [
        [0, -10000, 3],
        [0, -10010, 3],
      ],
      radius: 3,
    });
    this.render(view, null, TIER.MID, 0);
    this.begin();
  }
}
