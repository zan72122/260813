export const FULLSCREEN_VERT = /* glsl */ `
ATTRIB vec2 aPos;
VARYOUT vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Bright pass with a soft knee — keeps the bloom on the saturated rainbow
// rather than smearing the whole white light box.
export const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec2 uKnee;   // x threshold, y colour bias
uniform float uInvScale;
VARYIN vec2 vUv;
void main(){
  vec3 c = vec3(0.0);
  c += TEXTURE(uTex, vUv + uTexel*vec2(-0.5,-0.5)).rgb;
  c += TEXTURE(uTex, vUv + uTexel*vec2( 0.5,-0.5)).rgb;
  c += TEXTURE(uTex, vUv + uTexel*vec2(-0.5, 0.5)).rgb;
  c += TEXTURE(uTex, vUv + uTexel*vec2( 0.5, 0.5)).rgb;
  c *= 0.25 * uInvScale;
  float l = max(max(c.r,c.g),c.b);
  float sat = (l - min(min(c.r,c.g),c.b)) / max(l, 1e-4);
  float w = max(l - uKnee.x, 0.0) / max(l, 1e-4);
  w *= (0.045 + uKnee.y*sat*sat);
  FRAGCOLOR = vec4(c*w, 1.0);
}
`;

export const BLUR_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uDir;    // texel-sized step
VARYIN vec2 vUv;
void main(){
  // 9-tap gaussian folded into 5 bilinear fetches
  vec3 c = TEXTURE(uTex, vUv).rgb * 0.2270270270;
  c += (TEXTURE(uTex, vUv + uDir*1.3846153846).rgb +
        TEXTURE(uTex, vUv - uDir*1.3846153846).rgb) * 0.3162162162;
  c += (TEXTURE(uTex, vUv + uDir*3.2307692308).rgb +
        TEXTURE(uTex, vUv - uDir*3.2307692308).rgb) * 0.0702702703;
  FRAGCOLOR = vec4(c, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uRes;
uniform float uTime;
uniform vec4  uPost;   // x bloom amount, y sparkle amount, z vignette, w burst
uniform float uInvScale;
VARYIN vec2 vUv;

float hash21(vec2 p){ vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }

void main(){
  vec3 col = TEXTURE(uScene, vUv).rgb * uInvScale;
  vec3 bl  = TEXTURE(uBloom, vUv).rgb;
  col += bl * uPost.x;

  float lum = dot(col, vec3(0.2126,0.7152,0.0722));
  float sat = (max(max(col.r,col.g),col.b) - min(min(col.r,col.g),col.b)) / max(lum, 1e-3);

  /* twinkles — only where the interference colours actually are */
  if (uPost.y > 0.002){
    vec2 sp = vUv * uRes / max(uRes.y, 1.0) * 30.0;
    vec2 id = floor(sp), f = fract(sp) - 0.5;
    float h  = hash21(id);
    float h2 = hash21(id + 3.7);
    vec2 off = (vec2(h, h2) - 0.5) * 0.72;
    float tw = 0.5 + 0.5*sin(uTime*2.6 + h*6.2831);
    float s  = smoothstep(0.30, 0.0, length(f - off)) * pow(tw, 7.0);
    // little cross flare
    vec2 d = (f - off);
    s += smoothstep(0.34,0.0,abs(d.x)*7.0 + abs(d.y)) * pow(tw,10.0) * 0.5;
    s += smoothstep(0.34,0.0,abs(d.y)*7.0 + abs(d.x)) * pow(tw,10.0) * 0.5;
    col += vec3(1.0,0.96,1.0) * s * uPost.y * smoothstep(0.25,1.1,sat) * clamp(lum,0.0,1.6);
  }

  /* finale flash */
  col += vec3(1.0,0.85,1.0) * uPost.w * 0.55 * (0.4 + 0.6*sat);

  /* let the interference colours be properly vivid */
  col = mix(vec3(lum), col, 1.28);

  /* vignette */
  vec2 v = (vUv - 0.5) * vec2(uRes.x/max(uRes.y,1.0), 1.0);
  col *= 1.0 - uPost.z * dot(v,v) * 0.55;

  /* tonemap + sRGB + dither (kills LUT banding on the big soft fields) */
  col = col / (1.0 + col*0.72);
  col = pow(max(col, 0.0), vec3(1.0/2.2));
  col += (hash21(vUv*uRes + fract(uTime)) - 0.5) / 255.0;
  FRAGCOLOR = vec4(col, 1.0);
}
`;
