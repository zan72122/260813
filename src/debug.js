// ?view=caustic|slope|state|flow — dump a raw simulation buffer to the screen.
// Development aid only; nothing here runs during normal play.

import { Program, SCREEN_VS } from './glutil.js';
import { RG_LIB } from './glsl-lib.js';

const FS = `#version 300 es
precision highp float;
${RG_LIB}
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uScale;
uniform int uMode;   // 0 = single channel, 1 = signed RG pair
void main() {
  if (uMode == 0) {
    float v = texture(uTex, vUv).r * uScale;
    outColor = vec4(vec3(v), 1.0);
  } else {
    vec2 g = rgLoad(uTex, vUv, uRes) * uScale;
    outColor = vec4(0.5 + g.x, 0.5 + g.y, 0.5, 1.0);
  }
}
`;

export function makeDebugView(gl, quad, packed) {
  const src = packed ? FS.replace('precision highp float;', 'precision highp float;\n#define PACKED 1') : FS;
  const prog = new Program(gl, SCREEN_VS, src, 'debug-view');
  return (tex, res, scale, mode, w, h) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    prog.use().tex('uTex', tex).set('uRes', res[0], res[1]).set('uScale', scale).set('uMode', mode);
    quad.draw();
  };
}
