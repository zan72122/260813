// 軽い bloom と最終合成。1/4 解像度で 2パスぼかしするだけ。
import { Program, FULLSCREEN_VS, RenderTarget, bindScreen } from './glutil.js';

export class Post {
  constructor(gl) {
    this.gl = gl;
    this.a = new RenderTarget(gl, 8, 8, { float: false });
    this.b = new RenderTarget(gl, 8, 8, { float: false });
    this.bright = new Program(gl, FULLSCREEN_VS, `
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(0.0, l - uThreshold) / max(l, 0.0001);
  outColor = vec4(c * k, 1.0);
}`, 'bright');

    this.blur = new Program(gl, FULLSCREEN_VS, `
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.227;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.316;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.070;
  outColor = vec4(c, 1.0);
}`, 'blur');

    this.composite = new Program(gl, FULLSCREEN_VS, `
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmount;
uniform float uFlash;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  vec3 b = texture(uBloom, vUv).rgb;
  c += b * uBloomAmount;
  c += uFlash * vec3(1.0, 0.98, 0.92) * 0.35;
  // ふちをほんの少し落として、まんなかの虹に目がいくように
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * 0.36;
  c *= vig;
  // やわらかい持ち上げ（色を飽和させすぎない）
  c = c / (1.0 + c * 0.14);
  c = pow(max(c, 0.0), vec3(0.985));
  outColor = vec4(c, 1.0);
}`, 'composite');
  }

  resize(w, h) {
    const q = Math.max(1, Math.round(w / 4));
    const r = Math.max(1, Math.round(h / 4));
    this.a.resize(q, r);
    this.b.resize(q, r);
  }

  run(gl, fullscreenVao, sceneRT, outW, outH, bloomAmount, flash) {
    gl.bindVertexArray(fullscreenVao);
    gl.disable(gl.BLEND);

    this.a.bind();
    this.bright.use()
      .set('uTex', sceneRT.uniform)
      .set('uTexel', [1 / sceneRT.width, 1 / sceneRT.height])
      .set('uThreshold', 0.82);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.b.bind();
    this.blur.use().set('uTex', this.a.uniform).set('uDir', [1 / this.a.width, 0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.a.bind();
    this.blur.use().set('uTex', this.b.uniform).set('uDir', [0, 1 / this.b.height]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    bindScreen(gl, outW, outH);
    this.composite.use()
      .set('uScene', sceneRT.uniform)
      .set('uBloom', this.a.uniform)
      .set('uBloomAmount', bloomAmount)
      .set('uFlash', flash);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}
