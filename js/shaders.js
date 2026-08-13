'use strict';
/* shaders.js — GLSL sources.
   The black lacquer and the iridescent shell are the two hero materials.
   Both share coatColor() so that a coated shell piece is pixel-identical to
   coated lacquer — this is what makes the shell truly "vanish". */
const Shaders = (() => {

  const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*vnoise(p); p = p*2.03 + 7.7; a *= 0.5; }
  return v;
}
/* pearly rainbow: cycles blue -> green -> violet -> pink -> gold */
vec3 pearl(float t){
  vec3 c = 0.60 + 0.40*cos(6.28318*(t + vec3(0.00,0.33,0.66)));
  return mix(c, vec3(0.92,0.88,0.96), 0.16);
}
/* matte curing-coat film (the "cloud" the child polishes away) */
vec3 coatColor(vec2 p, float t){
  float g = fbm(p*3.1);
  vec3 c = mix(vec3(0.085,0.072,0.062), vec3(0.13,0.112,0.095), g);
  float sheen = pow(max(0.0, sin(p.x*1.4 + p.y*0.8 + t*0.7)), 8.0);
  c += sheen*vec3(0.030,0.027,0.024);
  return c;
}
float coatAmount(float edge, float x){
  return 1.0 - smoothstep(edge-0.5, edge, x);
}
`;

  const VS_ENTITY = `
attribute vec2 aPos;
attribute vec2 aLocal;
uniform vec2 uPivot;
uniform vec2 uEntPos;
uniform float uEntScale;
uniform float uEntRot;
uniform vec2 uStretch;
uniform vec2 uCam;
uniform vec2 uViewScale;
uniform vec2 uTiltShift;
varying vec2 vLocal;
varying vec2 vObj;
void main(){
  vec2 q = aPos * uStretch;
  vec2 p = q - uPivot;
  float c = cos(uEntRot), s = sin(uEntRot);
  p = vec2(p.x*c - p.y*s, p.x*s + p.y*c);
  vec2 world = uEntPos + p*uEntScale + uTiltShift;
  vec2 clip = (world - uCam) * uViewScale;
  gl_Position = vec4(clip, 0.0, 1.0);
  vLocal = aLocal;
  vObj = q;
}
`;

  /* ---- hero material 1: black urushi lacquer -------------------------- */
  const FS_LACQUER = `
precision highp float;
varying vec2 vLocal;
varying vec2 vObj;
uniform float uShape;
uniform sampler2D uMask;
uniform float uCoatEdge;
uniform float uPolishAll;
uniform vec2 uTilt;
uniform float uTime;
uniform float uSweep;
uniform float uAlpha;
${NOISE}
float sdRoundRect(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r;
}
float sdCircle(vec2 p, float r){ return length(p) - r; }
float sdCapsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}
float shapeSDF(vec2 p){
  if(uShape < 0.5) return sdCircle(p, 1.0);
  if(uShape < 1.5) return sdRoundRect(p, vec2(0.93), 0.30);
  return min(sdCircle(p - vec2(0.0,0.18), 0.80),
             sdCapsule(p, vec2(0.0,-0.15), vec2(0.0,-1.02), 0.115));
}
vec3 envLight(vec2 d){
  float topw = smoothstep(-0.4, 1.3, d.y);
  vec3 c = mix(vec3(0.050,0.045,0.040), vec3(0.40,0.42,0.46), topw*topw);
  vec2 q1 = d - vec2(-0.9,0.55);
  c += vec3(0.55,0.44,0.28)*exp(-dot(q1,q1)*1.6);
  vec2 q2 = d - vec2(1.0,0.9);
  c += vec3(0.40,0.47,0.55)*exp(-dot(q2,q2)*2.0);
  vec2 q3 = d - vec2(0.1,1.35);
  c += vec3(0.80,0.78,0.72)*exp(-dot(q3,q3)*3.0);
  return c;
}
void main(){
  float d = shapeSDF(vObj);
  float alpha = smoothstep(0.02, -0.012, d) * uAlpha;
  if(alpha <= 0.004) discard;
  float e = 0.02;
  vec2 g = vec2(
    shapeSDF(vObj+vec2(e,0.0)) - shapeSDF(vObj-vec2(e,0.0)),
    shapeSDF(vObj+vec2(0.0,e)) - shapeSDF(vObj-vec2(0.0,e))) / (2.0*e);
  float bevel = smoothstep(-0.16, -0.005, d);
  vec3 N = normalize(vec3(g*(0.10 + bevel*0.95) + vObj*0.055, 1.0));
  float polish = max(texture2D(uMask, (vObj + vec2(1.2))/2.4).r, uPolishAll);
  float coatA = coatAmount(uCoatEdge, vObj.x);
  float gloss = mix(0.55, polish*polish, coatA);
  vec3 col = vec3(0.028,0.022,0.018) + vec3(0.018,0.008,0.004)*fbm(vObj*2.3);
  vec2 rdir = N.xy*1.6 + uTilt*0.8;
  vec3 env = envLight(rdir);
  float fres = 0.30 + 0.70*pow(1.0 - N.z, 1.2);
  col += env * gloss * fres * 0.85;
  vec3 L = normalize(vec3(-0.35 + uTilt.x*0.8, 0.55 + uTilt.y*0.6, 0.62));
  float hl = pow(max(dot(N, L), 0.0), 42.0);
  col += vec3(1.0,0.97,0.90)*hl*(0.20 + 1.25*gloss);
  float band = smoothstep(-0.09,-0.03,d)*(1.0-smoothstep(-0.03,0.0,d));
  col += band * env * 0.14;
  vec3 hz = coatColor(vObj, uTime);
  col = mix(col, hz, coatA*(1.0-polish));
  float on = step(-1.7,uSweep)*step(uSweep,1.7);
  float sb = exp(-pow((vObj.x + vObj.y*0.35 - uSweep)*2.6, 2.0));
  col += sb*on*vec3(0.42,0.40,0.36)*gloss;
  gl_FragColor = vec4(col, alpha);
}
`;

  /* ---- hero material 2: iridescent shell ------------------------------ */
  const FS_PIECE = `
precision highp float;
varying vec2 vLocal;
varying vec2 vObj;
uniform sampler2D uMask;
uniform float uCoatEdge;
uniform float uPolishAll;
uniform vec2 uTilt;
uniform float uTime;
uniform float uSeed;
uniform float uGlow;
uniform float uGhost;
uniform float uSweep;
${NOISE}
void main(){
  vec2 mUV = (vObj + vec2(1.2))/2.4;
  float polish = max(texture2D(uMask, mUV).r, uPolishAll);
  float coatA = coatAmount(uCoatEdge, vObj.x);
  float reveal = mix(1.0, polish, coatA);

  float n1 = fbm(vLocal*2.1 + uSeed*13.1);
  float n2 = fbm(vLocal*5.2 + vec2(3.1 - uSeed*7.7, 7.3 + uSeed*3.3));
  float flow = vLocal.x*1.15 + vLocal.y*0.55 + (n1-0.5)*2.8;
  float t = flow*0.20 + uTilt.x*0.50 + uTilt.y*0.34 + uSeed*0.73 + uTime*0.006;
  vec3 iri = pearl(t);
  vec3 col = mix(iri, vec3(0.97,0.98,1.0), 0.24 + 0.30*n2);
  col *= 0.80 + 0.30*smoothstep(0.15, 0.85, n2);
  float band = sin(flow*2.2 + uTilt.x*4.5 + uTilt.y*2.8 + uSeed*6.0);
  col += vec3(0.38,0.35,0.30)*pow(max(band,0.0), 6.0)*0.8;
  float gcell = hash(floor(vLocal*13.0) + uSeed*17.0);
  float tw = pow(max(0.0, sin(gcell*44.0 + uTime*2.2 + (uTilt.x+uTilt.y)*9.0)), 24.0);
  float ptfall = smoothstep(0.42, 0.04, length(fract(vLocal*13.0) - 0.5));
  col += vec3(1.0,0.96,0.88)*tw*0.9*step(0.80, gcell)*ptfall;
  float r = length(vLocal);
  col *= 0.78 + 0.22*smoothstep(1.05, 0.55, r);
  col += uGlow*(0.5+0.5*sin(uTime*3.0))*vec3(0.30,0.36,0.46);
  float on = step(-1.7,uSweep)*step(uSweep,1.7);
  float sb = exp(-pow((vObj.x + vObj.y*0.35 - uSweep)*2.6, 2.0));
  col += sb*on*iri*0.9;

  vec3 hz = coatColor(vObj, uTime);
  float bGlow = coatA * smoothstep(0.06,0.40,polish) * (1.0 - smoothstep(0.50,0.90,polish));
  vec3 outc = mix(hz, col, reveal);
  outc += bGlow*(iri*0.7 + vec3(0.30,0.28,0.25))*0.8;
  outc *= 0.70 + 0.30*step(0.95, uGhost);
  gl_FragColor = vec4(outc, uGhost);
}
`;

  /* ---- recess (empty slot) -------------------------------------------- */
  const FS_SLOT = `
precision mediump float;
varying vec2 vLocal;
varying vec2 vObj;
uniform float uTime;
uniform float uPulse;
${NOISE}
void main(){
  float r = length(vLocal);
  vec3 col = vec3(0.014,0.011,0.009)*(0.75 + 0.25*smoothstep(0.2,1.0,r));
  col += vec3(0.055,0.065,0.080)*(0.35 + 0.35*sin(uTime*2.4 + uPulse))*smoothstep(1.0,0.15,r);
  gl_FragColor = vec4(col, 1.0);
}
`;

  /* ---- soft glow / blob ----------------------------------------------- */
  const FS_GLOW = `
precision mediump float;
varying vec2 vLocal;
varying vec2 vObj;
uniform vec3 uColor;
uniform float uAlphaF;
uniform float uMode; /* 0 = ring, 1 = blob */
void main(){
  float r = length(vLocal);
  float ring = smoothstep(1.0,0.72,r)*smoothstep(0.45,0.80,r);
  float blob = smoothstep(1.0,0.30,r);
  float a = uAlphaF * mix(ring, blob, uMode);
  gl_FragColor = vec4(uColor, a);
}
`;

  /* ---- wood / cloth panels -------------------------------------------- */
  const FS_WOOD = `
precision mediump float;
varying vec2 vLocal;
varying vec2 vObj;
uniform vec2 uHalf;
uniform float uRad;
uniform vec3 uColA;
uniform vec3 uColB;
${NOISE}
float sdRR(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r;
}
void main(){
  vec2 p = vLocal * uHalf;
  float d = sdRR(p, uHalf, uRad);
  float alpha = smoothstep(0.02, -0.02, d);
  if(alpha <= 0.004) discard;
  float g = fbm(vec2(p.x*1.1, p.y*5.5) + uColA.xy*10.0);
  vec3 col = mix(uColA, uColB, g);
  col *= 0.82 + 0.22*smoothstep(-uHalf.y, uHalf.y, p.y);
  col *= 0.72 + 0.28*smoothstep(0.0, -0.22, d);
  gl_FragColor = vec4(col, alpha);
}
`;

  /* ---- workshop background -------------------------------------------- */
  const VS_BG = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;
  const FS_BG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uFocus;
uniform float uSpot;
${NOISE}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(uRes.x/uRes.y, 1.0);
  vec3 top = vec3(0.150,0.108,0.080);
  vec3 bot = vec3(0.052,0.038,0.030);
  vec3 col = mix(bot, top, smoothstep(-0.75, 0.75, p.y + 0.25));
  float beam = exp(-pow((p.x*0.7 - p.y*0.55 + 0.35), 2.0)*2.2);
  col += beam * vec3(0.055,0.045,0.030);
  float planks = vnoise(vec2(p.x*7.0, p.y*1.3));
  col *= 1.0 - 0.05*planks*smoothstep(0.1, -0.5, p.y);
  float v = length(p*vec2(0.85,1.05));
  col *= mix(1.0, smoothstep(1.6, 0.35, v), 0.55 + 0.35*uFocus);
  col *= 1.0 - uSpot*0.78;
  col += uSpot * vec3(0.235,0.21,0.175) * exp(-dot(p,p)*2.6);
  col += (hash(p*vec2(917.7,311.3) + uTime*0.1) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

  return { VS_ENTITY, VS_BG, FS_LACQUER, FS_PIECE, FS_SLOT, FS_GLOW, FS_WOOD, FS_BG };
})();
