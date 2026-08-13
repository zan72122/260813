import { Program, RenderTarget, createMeshVAO, destroyMeshVAO, createFullscreenVAO, createGL } from './glutil.js';
import { makeCrystal, makeRing, makeDisc } from './mesh.js';
import { makeRng } from './rng.js';
import { applyPatternUniforms } from './crystalDef.js';
import * as S from './shaders.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = createGL(canvas));

    this.progBg = new Program(gl, S.VS_FULLSCREEN, S.FS_BG, 'bg');
    this.progDisc = new Program(gl, S.VS_STAGE, S.FS_DISC, 'disc');
    this.progRing = new Program(gl, S.VS_STAGE, S.FS_RING, 'ring');
    this.progCrystal = new Program(gl, S.VS_CRYSTAL, S.FS_CRYSTAL, 'crystal');
    this.progEye = new Program(gl, S.VS_FULLSCREEN, S.FS_EYE, 'eye');
    this.progBright = new Program(gl, S.VS_FULLSCREEN, S.FS_BRIGHT, 'bright');
    this.progBlur = new Program(gl, S.VS_FULLSCREEN, S.FS_BLUR, 'blur');
    this.progPresent = new Program(gl, S.VS_FULLSCREEN, S.FS_PRESENT, 'present');

    this.quad = createFullscreenVAO(gl);
    this.ring = createMeshVAO(gl, makeRing());
    this.disc = createMeshVAO(gl, makeDisc(3.0));
    this.crystal = null;
    this.crystalHeight = 1.6;

    this.scene = new RenderTarget(gl, 8, 8, { depth: true });
    this.bright = new RenderTarget(gl, 8, 8);
    this.blurA = new RenderTarget(gl, 8, 8);
    this.blurB = new RenderTarget(gl, 8, 8);

    this.renderScale = 1.0;
    this.w = 1; this.h = 1;
  }

  setCrystal(seed) {
    const gl = this.gl;
    destroyMeshVAO(gl, this.crystal);
    const mesh = makeCrystal(makeRng((seed ^ 0x9e3779b9) >>> 0));
    this.crystal = createMeshVAO(gl, mesh);
    this.crystalHeight = mesh.height;
    this.crystalBottom = mesh.bottom;
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.w = w; this.h = h;
    const sw = Math.max(1, Math.round(w * this.renderScale));
    const sh = Math.max(1, Math.round(h * this.renderScale));
    this.scene.resize(sw, sh);
    const bw = Math.max(1, sw >> 2), bh = Math.max(1, sh >> 2);
    this.bright.resize(bw, bh);
    this.blurA.resize(bw, bh);
    this.blurB.resize(bw, bh);
  }

  setRenderScale(s) {
    if (Math.abs(s - this.renderScale) < 0.01) return;
    this.renderScale = s;
    const sw = Math.max(1, Math.round(this.w * s));
    const sh = Math.max(1, Math.round(this.h * s));
    this.scene.resize(sw, sh);
    const bw = Math.max(1, sw >> 2), bh = Math.max(1, sh >> 2);
    this.bright.resize(bw, bh);
    this.blurA.resize(bw, bh);
    this.blurB.resize(bw, bh);
  }

  _fs() {
    const gl = this.gl;
    gl.bindVertexArray(this.quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  draw(f) {
    const gl = this.gl;
    const sc = this.scene;

    sc.bind();
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- 背景 ---
    this.progBg.use()
      .v2('uRes', sc.w, sc.h)
      .f('uTime', f.time)
      .f('uLight', f.light);
    this._fs();

    // --- 光学台と偏光リング ---
    if (f.stageAlpha > 0.001) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);

      this.progDisc.use()
        .m4('uProj', f.proj).m4('uView', f.view).m4('uModel', f.identity)
        .f('uTime', f.time).f('uLight', f.light * f.stageAlpha);
      gl.bindVertexArray(this.disc.vao);
      gl.drawElements(gl.TRIANGLES, this.disc.count, this.disc.type, 0);

      this.progRing.use()
        .m4('uProj', f.proj).m4('uView', f.view).m4('uModel', f.ringModel)
        .f('uRingAngle', f.ringAngle).f('uCharge', f.charge)
        .f('uTime', f.time).f('uAlpha', f.stageAlpha);
      gl.bindVertexArray(this.ring.vao);
      gl.drawElements(gl.TRIANGLES, this.ring.count, this.ring.type, 0);
    }

    // --- 結晶 ---
    if (f.crystalFade > 0.002 && this.crystal) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.enable(gl.CULL_FACE);

      const p = this.progCrystal.use();
      p.m4('uProj', f.proj).m4('uView', f.view).m4('uModel', f.crystalModel)
        .m3('uNrmMat', f.crystalRot)
        .v3('uCamPos', f.camPos[0], f.camPos[1], f.camPos[2])
        .m3('uAxisBasis', f.axisBasis)
        .f('uFade', f.crystalFade)
        .f('uGlass', f.glass);
      applyPatternUniforms(p, f.def, f.pat);

      gl.bindVertexArray(this.crystal.vao);
      // 背面（結晶の中に見える干渉像）
      gl.cullFace(gl.FRONT);
      p.f('uFront', 0.0);
      gl.drawElements(gl.TRIANGLES, this.crystal.count, this.crystal.type, 0);
      // 前面（面のきらめきと縁の光）
      gl.cullFace(gl.BACK);
      p.f('uFront', 1.0);
      gl.drawElements(gl.TRIANGLES, this.crystal.count, this.crystal.type, 0);

      gl.disable(gl.CULL_FACE);
    }

    // --- フルスクリーンの虹の目 ---
    if (f.eyeAlpha > 0.002) {
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // 乗算済みアルファ
      const p = this.progEye.use();
      p.v2('uRes', sc.w, sc.h)
        .m3('uAxisBasis', f.axisBasis)
        .m3('uInvViewRot', f.invViewRot)
        .f('uTanHalf', f.tanHalf)
        .f('uAlpha', f.eyeAlpha)
        .f('uLidW', f.lidW)
        .f('uLidH', f.lidH)
        .v3('uFwdW', f.camFwd[0], f.camFwd[1], f.camFwd[2])
        .f('uVign', f.vign);
      applyPatternUniforms(p, f.def, f.pat);
      this._fs();
    }

    // --- ブルーム ---
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    this.bright.bind();
    this.progBright.use().tex('uTex', 0, sc.tex).f('uThreshold', f.bloomThreshold);
    this._fs();

    this.blurA.bind();
    this.progBlur.use().tex('uTex', 0, this.bright.tex).v2('uDir', 1 / this.bright.w, 0);
    this._fs();

    this.blurB.bind();
    this.progBlur.use().tex('uTex', 0, this.blurA.tex).v2('uDir', 0, 1 / this.blurA.h);
    this._fs();

    // --- 合成 ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    this.progPresent.use()
      .tex('uScene', 0, sc.tex)
      .tex('uBloom', 1, this.blurB.tex)
      .v2('uRes', this.w, this.h)
      .f('uBloomAmt', f.bloom)
      .f('uPass', f.pass)
      .f('uFlash', f.flash)
      .f('uExposure', f.exposure);
    this._fs();
  }
}
