import { clamp } from '../core/math';
import type { Rect } from '../core/layout';
import { Director, NEUTRAL_FIELD_COLOR, fieldColor } from '../core/field';
import { ctxOf, makeCanvas, roundRectPath } from '../art/draw';
import { CARD_FRAG, CARD_VERT, SPRITE_FRAG, SPRITE_VERT } from './shaders';

const FOIL_W = 256;
const FOIL_H = 366;
const COVER_W = 32;
const COVER_H = 46;

export interface CardDrawState {
  rect: Rect;
  tilt: { x: number; y: number };
  emboss: number;
  reveal: number;
  spin: number;
  time: number;
  /** 0..1 blend into the UV lamp view. */
  uvMode: number;
  /** Lamp position in card uv, plus its radius. */
  light: { u: number; v: number; r: number };
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

function uniformMap(
  gl: WebGL2RenderingContext,
  p: WebGLProgram,
): Record<string, WebGLUniformLocation> {
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
  private texField: WebGLTexture;
  private texKine: WebGLTexture;
  private texShadow: WebGLTexture;

  private foilCanvas: HTMLCanvasElement;
  private foilCtx: CanvasRenderingContext2D;
  private fieldCanvas: HTMLCanvasElement;
  private fieldCtx: CanvasRenderingContext2D;
  private coverCanvas: HTMLCanvasElement;
  private coverCtx: CanvasRenderingContext2D;
  private foilDirty = true;
  private fieldDirty = true;

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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texBase = this.newTexture();
    this.texRelief = this.newTexture();
    this.texFoil = this.newTexture();
    this.texField = this.newTexture();
    this.texKine = this.newTexture();
    this.texShadow = this.newTexture();

    this.foilCanvas = makeCanvas(FOIL_W, FOIL_H);
    this.foilCtx = ctxOf(this.foilCanvas);
    this.fieldCanvas = makeCanvas(FOIL_W, FOIL_H);
    this.fieldCtx = ctxOf(this.fieldCanvas);
    this.coverCanvas = makeCanvas(COVER_W, COVER_H);
    this.coverCtx = this.coverCanvas.getContext('2d', { willReadFrequently: true })!;
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

  setKinegram(c: HTMLCanvasElement): void {
    this.upload(this.texKine, c);
  }

  /** Wipe both the foil and the ruling it carries. */
  clearFoil(): void {
    this.foilCtx.globalCompositeOperation = 'source-over';
    this.foilCtx.globalAlpha = 1;
    this.foilCtx.fillStyle = '#000';
    this.foilCtx.fillRect(0, 0, FOIL_W, FOIL_H);

    const [r, g, b] = NEUTRAL_FIELD_COLOR;
    this.fieldCtx.globalCompositeOperation = 'source-over';
    this.fieldCtx.globalAlpha = 1;
    this.fieldCtx.fillStyle = `rgb(${r},${g},${b})`;
    this.fieldCtx.fillRect(0, 0, FOIL_W, FOIL_H);

    this.foilDirty = true;
    this.fieldDirty = true;
  }

  /**
   * Lay one segment of foil, carrying the ruling direction the child's finger
   * was travelling in. `radius` and the coordinates are in card uv.
   *
   * The two canvases are painted differently on purpose: coverage accumulates
   * ('lighter'), while direction is blended toward the newest stroke
   * ('source-over'), which is what lets crossed strokes cancel into glitter.
   */
  paintStroke(
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    radius: number,
    dir: Director,
    pitch01: number,
  ): void {
    const x0 = u0 * FOIL_W;
    const y0 = v0 * FOIL_H;
    const x1 = u1 * FOIL_W;
    const y1 = v1 * FOIL_H;
    const r = radius * FOIL_W;

    const fc = this.foilCtx;
    fc.globalCompositeOperation = 'lighter';
    fc.lineCap = 'round';
    fc.lineJoin = 'round';
    fc.globalAlpha = 1;
    for (const [w, a] of [
      [2.2, 0.1],
      [1.35, 0.2],
    ] as [number, number][]) {
      fc.strokeStyle = `rgba(255,255,255,${a})`;
      fc.lineWidth = r * w;
      fc.beginPath();
      fc.moveTo(x0, y0);
      fc.lineTo(x1, y1);
      fc.stroke();
    }

    // A touch wider than the foil, so every foiled pixel has a direction and
    // no silver halo creeps in along the stroke edges.
    const dc = this.fieldCtx;
    const [cr, cg, cb] = fieldColor(dir, pitch01);
    dc.globalCompositeOperation = 'source-over';
    dc.lineCap = 'round';
    dc.lineJoin = 'round';
    dc.globalAlpha = 0.5;
    dc.strokeStyle = `rgb(${cr},${cg},${cb})`;
    dc.lineWidth = r * 2.5;
    dc.beginPath();
    dc.moveTo(x0, y0);
    dc.lineTo(x1, y1);
    dc.stroke();
    dc.globalAlpha = 1;

    this.foilDirty = true;
    this.fieldDirty = true;
  }

  /** Fraction of the card that *looks* covered, 0..1. */
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

  /** Raw RGBA of a css-pixel region, top-down. Same task as a render only. */
  readRegionRGBA(cx: number, cy: number, w: number, h: number): ImageData {
    const gl = this.gl;
    const px = Math.max(1, Math.round(w * this.dpr));
    const py = Math.max(1, Math.round(h * this.dpr));
    const x = clamp(Math.round((cx - w / 2) * this.dpr), 0, Math.max(0, this.canvas.width - px));
    const y = clamp(
      Math.round((this.vh - cy - h / 2) * this.dpr),
      0,
      Math.max(0, this.canvas.height - py),
    );
    const buf = new Uint8ClampedArray(px * py * 4);
    gl.readPixels(x, y, px, py, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    // readPixels is bottom-up; flip into an ImageData that can be drawn.
    const out = new ImageData(px, py);
    const row = px * 4;
    for (let r = 0; r < py; r++) {
      out.data.set(buf.subarray((py - 1 - r) * row, (py - r) * row), r * row);
    }
    return out;
  }

  /** Average colour of a region - cheap way for a test to see change. */
  readRegion(cx: number, cy: number, w: number, h: number): [number, number, number] {
    const img = this.readRegionRGBA(cx, cy, w, h);
    const d = img.data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = img.width * img.height;
    for (let i = 0; i < n; i++) {
      r += d[i * 4];
      g += d[i * 4 + 1];
      b += d[i * 4 + 2];
    }
    return [r / n, g / n, b / n];
  }

  /** Wipe the canvas for phases that show no card. */
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
    if (this.fieldDirty) {
      this.upload(this.texField, this.fieldCanvas);
      this.fieldDirty = false;
    }

    // --- drop shadow, offset opposite to the tilt so the card feels lifted ---
    gl.useProgram(this.spriteProg);
    gl.uniform2f(
      this.spriteU.uCenter,
      s.rect.x - s.tilt.x * s.rect.w * 0.1,
      s.rect.y + s.rect.h * 0.045 + s.tilt.y * s.rect.h * 0.05,
    );
    gl.uniform2f(this.spriteU.uHalfSize, (s.rect.w * 1.24) / 2, (s.rect.h * 1.2) / 2);
    gl.uniform2f(this.spriteU.uViewport, this.vw, this.vh);
    gl.uniform4f(this.spriteU.uTint, 0, 0, 0, 0.55 * (1 - s.uvMode * 0.6));
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
    gl.uniform1f(this.cardU.uQuality, this.quality);
    gl.uniform1f(this.cardU.uReveal, clamp(s.reveal, 0, 1));
    gl.uniform1f(this.cardU.uUvMode, clamp(s.uvMode, 0, 1));
    gl.uniform3f(this.cardU.uLight, s.light.u, s.light.v, s.light.r);

    const units: [string, WebGLTexture][] = [
      ['uBase', this.texBase],
      ['uRelief', this.texRelief],
      ['uFoil', this.texFoil],
      ['uField', this.texField],
      ['uKine', this.texKine],
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
