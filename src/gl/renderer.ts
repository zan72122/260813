import { clamp } from '../core/math';
import type { Rect } from '../core/layout';
import { ctxOf, makeCanvas, radialSprite, roundRectPath } from '../art/draw';
import { CARD_FRAG, CARD_VERT, SPRITE_FRAG, SPRITE_VERT } from './shaders';

const FOIL_W = 256;
const FOIL_H = 366;
const COVER_W = 32;
const COVER_H = 46;

export interface CardDrawState {
  rect: Rect;
  tilt: { x: number; y: number };
  emboss: number;
  pattern: number;
  reveal: number;
  spin: number;
  time: number;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`program link failed: ${log}`);
  }
  return p;
}

function uniformMap(gl: WebGL2RenderingContext, p: WebGLProgram): Record<string, WebGLUniformLocation> {
  const out: Record<string, WebGLUniformLocation> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    if (!info) continue;
    const loc = gl.getUniformLocation(p, info.name);
    if (loc) out[info.name] = loc;
  }
  return out;
}

function makeShadowTexture(): HTMLCanvasElement {
  const w = 320;
  const h = 440;
  const c = makeCanvas(w, h);
  const ctx = ctxOf(c);
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = 'rgba(0,0,0,0.95)';
  roundRectPath(ctx, 58, 58, w - 116, h - 116, 30);
  ctx.fill();
  ctx.fill();
  return c;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private cardProg: WebGLProgram;
  private spriteProg: WebGLProgram;
  private cardU: Record<string, WebGLUniformLocation>;
  private spriteU: Record<string, WebGLUniformLocation>;
  private vao: WebGLVertexArrayObject;

  private texBase: WebGLTexture;
  private texRelief: WebGLTexture;
  private texFoil: WebGLTexture;
  private texHidden: WebGLTexture;
  private texShadow: WebGLTexture;

  private foilCanvas: HTMLCanvasElement;
  private foilCtx: CanvasRenderingContext2D;
  private coverCanvas: HTMLCanvasElement;
  private coverCtx: CanvasRenderingContext2D;
  private brush: HTMLCanvasElement;
  private foilDirty = true;

  private vw = 1;
  private vh = 1;
  private dpr = 1;

  quality = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;

    this.cardProg = link(gl, CARD_VERT, CARD_FRAG);
    this.spriteProg = link(gl, SPRITE_VERT, SPRITE_FRAG);
    this.cardU = uniformMap(gl, this.cardProg);
    this.spriteU = uniformMap(gl, this.spriteProg);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray failed');
    this.vao = vao;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texBase = this.newTexture();
    this.texRelief = this.newTexture();
    this.texFoil = this.newTexture();
    this.texHidden = this.newTexture();
    this.texShadow = this.newTexture();

    this.foilCanvas = makeCanvas(FOIL_W, FOIL_H);
    this.foilCtx = ctxOf(this.foilCanvas);
    this.coverCanvas = makeCanvas(COVER_W, COVER_H);
    this.coverCtx = this.coverCanvas.getContext('2d', { willReadFrequently: true })!;
    this.brush = radialSprite(96);
    this.clearFoil();

    this.upload(this.texShadow, makeShadowTexture());

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private newTexture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // 1x1 white so a draw before assets are set is still valid
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    return t;
  }

  private upload(tex: WebGLTexture, src: TexImageSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  setBase(c: HTMLCanvasElement): void {
    this.upload(this.texBase, c);
  }

  setRelief(c: HTMLCanvasElement): void {
    this.upload(this.texRelief, c);
  }

  setHidden(c: HTMLCanvasElement): void {
    this.upload(this.texHidden, c);
  }

  clearFoil(): void {
    this.foilCtx.globalCompositeOperation = 'source-over';
    this.foilCtx.fillStyle = '#000';
    this.foilCtx.fillRect(0, 0, FOIL_W, FOIL_H);
    this.foilDirty = true;
  }

  /** Paint foil at card-local uv (0..1). `radius` is in uv units of card width. */
  paintFoil(u: number, v: number, radius = 0.22): void {
    const x = u * FOIL_W;
    const y = v * FOIL_H;
    const r = radius * FOIL_W;
    this.foilCtx.globalCompositeOperation = 'lighter';
    this.foilCtx.globalAlpha = 0.55;
    this.foilCtx.drawImage(this.brush, x - r, y - r, r * 2, r * 2);
    this.foilCtx.globalAlpha = 1;
    this.foilDirty = true;
  }

  /**
   * Fraction of the card that *looks* covered, 0..1. Counting pixels past a
   * threshold rather than averaging intensity: a thin smear of foil everywhere
   * should not read as a finished card.
   */
  foilCoverage(): number {
    this.coverCtx.clearRect(0, 0, COVER_W, COVER_H);
    this.coverCtx.drawImage(this.foilCanvas, 0, 0, COVER_W, COVER_H);
    const d = this.coverCtx.getImageData(0, 0, COVER_W, COVER_H).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] >= 96) hit++;
    }
    return hit / (COVER_W * COVER_H);
  }

  resize(vw: number, vh: number, dprCap = 2): void {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, dprCap);
    this.vw = vw;
    this.vh = vh;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(vw * dpr));
    const h = Math.max(1, Math.round(vh * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  /**
   * Average colour of a css-pixel region of the drawing buffer. Must be called
   * in the same task as a render, since the buffer is not preserved.
   */
  readRegion(cx: number, cy: number, w: number, h: number): [number, number, number] {
    const gl = this.gl;
    const px = Math.max(1, Math.round(w * this.dpr));
    const py = Math.max(1, Math.round(h * this.dpr));
    const x = Math.round((cx - w / 2) * this.dpr);
    // readPixels has its origin at the bottom-left
    const y = Math.round((this.vh - cy - h / 2) * this.dpr);
    const buf = new Uint8Array(px * py * 4);
    gl.readPixels(
      clamp(x, 0, Math.max(0, this.canvas.width - px)),
      clamp(y, 0, Math.max(0, this.canvas.height - py)),
      px,
      py,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buf,
    );
    let r = 0;
    let g = 0;
    let b = 0;
    const n = px * py;
    for (let i = 0; i < n; i++) {
      r += buf[i * 4];
      g += buf[i * 4 + 1];
      b += buf[i * 4 + 2];
    }
    return [r / n, g / n, b / n];
  }

  /** Wipe the canvas for phases that show no card (the picker screens). */
  clear(): void {
    const gl = this.gl;
    gl.viewport(0, 0, Math.round(this.vw * this.dpr), Math.round(this.vh * this.dpr));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  render(s: CardDrawState): void {
    const gl = this.gl;
    this.clear();
    gl.bindVertexArray(this.vao);

    if (this.foilDirty) {
      this.upload(this.texFoil, this.foilCanvas);
      this.foilDirty = false;
    }

    // --- drop shadow, offset opposite to the tilt so the card feels lifted ---
    gl.useProgram(this.spriteProg);
    const shW = s.rect.w * 1.24;
    const shH = s.rect.h * 1.2;
    gl.uniform2f(
      this.spriteU.uCenter,
      s.rect.x - s.tilt.x * s.rect.w * 0.1,
      s.rect.y + s.rect.h * 0.045 + s.tilt.y * s.rect.h * 0.05,
    );
    gl.uniform2f(this.spriteU.uHalfSize, shW / 2, shH / 2);
    gl.uniform2f(this.spriteU.uViewport, this.vw, this.vh);
    gl.uniform4f(this.spriteU.uTint, 0, 0, 0, 0.55);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texShadow);
    gl.uniform1i(this.spriteU.uTex, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- the card ---
    gl.useProgram(this.cardProg);
    gl.uniform2f(this.cardU.uHalfSize, s.rect.w / 2, s.rect.h / 2);
    gl.uniform2f(this.cardU.uCenter, s.rect.x, s.rect.y);
    gl.uniform2f(this.cardU.uViewport, this.vw, this.vh);
    gl.uniform2f(this.cardU.uTilt, s.tilt.x, s.tilt.y);
    gl.uniform1f(this.cardU.uFocal, Math.max(this.vw, this.vh) * 1.5);
    gl.uniform1f(this.cardU.uDist, Math.max(this.vw, this.vh) * 1.5);
    gl.uniform1f(this.cardU.uSpin, s.spin);
    gl.uniform1f(this.cardU.uEmboss, clamp(s.emboss, 0, 1));
    gl.uniform1f(this.cardU.uTime, s.time);
    gl.uniform1i(this.cardU.uPattern, s.pattern | 0);
    gl.uniform1f(this.cardU.uQuality, this.quality);
    gl.uniform1f(this.cardU.uReveal, clamp(s.reveal, 0, 1));

    const units: [string, WebGLTexture][] = [
      ['uBase', this.texBase],
      ['uRelief', this.texRelief],
      ['uFoil', this.texFoil],
      ['uHidden', this.texHidden],
    ];
    units.forEach(([name, tex], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.cardU[name], i);
    });

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
