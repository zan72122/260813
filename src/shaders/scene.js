// The one shader that does everything optical: clean workshop, clear plastic
// parts, their internal stress, the polariser maths, the ring, the finale glass.
// Keeping it in a single pass sidesteps transparency sorting entirely.

export const SCENE_FRAG = /* glsl */ `
#define PI  3.14159265359
#define TAU 6.28318530718

uniform vec2  uRes;
uniform float uTime;
uniform vec4  uCam;    // xy pan, z zoom, w idle-nudge glow
uniform vec4  uPol;    // x analyser angle, y polariser angle, z charge, w sweet
uniform vec4  uRing;   // x radius, y width, z opacity, w angle
uniform vec4  uFin;    // x windowMix, y burst, z roomLight, w quality
uniform vec4  uObjA[4];// xy pos, z scale, w rot
uniform vec4  uObjB[4];// x mode, y amp, z freq, w phase
uniform vec4  uObjC[4];// x sharp, y presence, z gate angle, w spoke count
uniform vec4  uObjD[4];// retardation: x dome, y edge, z spokes, w blobs
uniform vec4  uObjE[4];// x blobFreqA, y blobFreqB, z seedPhase, w tint
uniform vec4  uPress[3];// xy world pos, z strength, w age
uniform float uOutScale; // 1.0 on HDR targets, 0.5 when we only get RGBA8
uniform sampler2D uLUT;

VARYIN vec2 vUv;

/* ------------------------------------------------------------------ utils */
float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec2  rot2(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
float sdBox(vec2 p, vec2 b){ vec2 d=abs(p)-b; return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }
float sdRound(vec2 p, vec2 b, float r){ return sdBox(p, b-vec2(r)) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
  return length(pa-ba*h)-r;
}
float smin(float a, float b, float k){
  float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
  return mix(b,a,h) - k*h*(1.0-h);
}

/* Michel-Levy interference colour. d is retardation normalised to LUT range. */
const vec3 HIGH_ORDER = vec3(0.50, 0.475, 0.515); // what many orders average to
vec3 lutC(float d){
  return TEXTURE(uLUT, vec2(clamp(d,0.0,1.0)*0.998 + 0.001, 0.5)).rgb * 2.0;
}

/* ----------------------------------------------------------------- shapes */
// mode 0 flower | 1 star | 2 gear | 3 butterfly | 4 leaf | 5 spoon
float shapeSD(vec2 q, float mode, vec4 sh){
  // sh: x amp, y freq, z phase, w sharpness
  if (mode > 4.5) {                       // spoon
    float bowl = (length((q - vec2(0.0,0.46))/vec2(0.50,0.54)) - 1.0)*0.50;
    float handle = sdSeg(q, vec2(0.0,0.10), vec2(0.0,-0.88), 0.155);
    return smin(bowl, handle, 0.16);
  }
  if (mode > 3.5) {                       // leaf (vesica), standing upright
    float r = 1.42, dd = 0.86, b = sqrt(r*r - dd*dd);
    vec2 ap = abs(q);
    return ((ap.y-b)*dd > ap.x*b) ? length(ap-vec2(0.0,b)) : length(ap-vec2(-dd,0.0)) - r;
  }
  if (mode > 2.5) {                       // butterfly
    vec2 p = vec2(abs(q.x), q.y);
    vec2 a = rot2(p - vec2(0.44, 0.33), -0.50);
    float d = (length(a/vec2(0.54,0.40)) - 1.0)*0.40;
    vec2 b = rot2(p - vec2(0.36,-0.40), 0.42);
    d = smin(d, (length(b/vec2(0.42,0.31)) - 1.0)*0.31, 0.14);
    float body = (length(q/vec2(0.095,0.70)) - 1.0)*0.095;
    return smin(d, body, 0.08);
  }
  float a = atan(q.y, q.x) + sh.z;
  float r;
  if (mode > 1.5) {                       // gear
    r = (1.0 - sh.x) + sh.x*smoothstep(-0.80, 0.80, cos(sh.y*a));
    float hole = 0.28 - length(q);
    return max(length(q) - r, hole);
  } else if (mode > 0.5) {                // star
    r = (1.0 - sh.x) + sh.x*pow(abs(cos(sh.y*a*0.5)), sh.w);
  } else {                                // flower
    r = 1.0 + sh.x*cos(sh.y*a);
  }
  return length(q) - r;
}

/* ------------------------------------------------------------------- room */
vec3 roomColour(vec2 p, float apertureMask){
  // clean, calm room — light enough to feel friendly, dark enough that the
  // light box in the middle of it clearly *is* the light
  vec3 col = mix(vec3(0.235,0.258,0.320), vec3(0.470,0.500,0.585),
                 smoothstep(-1.9, 2.8, p.y));
  col *= 1.0 - 0.30*smoothstep(2.1, 3.9, p.y);          // ceiling falls off

  vec3 lightC = vec3(1.30, 1.32, 1.40) * uFin.z;

  // the big soft backlight panel — the hero light source
  float d = sdRound(p - vec2(0.0, 0.62), vec2(2.34, 2.34), 0.44);
  float inPanel = smoothstep(0.020, -0.045, d);
  float halo    = exp(-max(d,0.0)*1.55);
  float even    = 0.62 + 0.54*exp(-length((p - vec2(0.0,0.02))*vec2(0.44,0.30)));
  col += lightC * halo * 0.42 * (1.0 - inPanel);        // glow spilling on the wall
  col = mix(col, lightC*even, inPanel);
  // gentle inner shadow so the diffuser looks recessed in its frame
  col *= 1.0 - 0.16*smoothstep(-0.34, -0.01, d)*inPanel;

  // bezel
  float frame = abs(d + 0.10) - 0.055;
  col = mix(col, vec3(0.105,0.115,0.140), smoothstep(0.012,-0.012,frame)*0.96);

  // floor
  const float FY = -1.30;
  float floorM = smoothstep(FY+0.035, FY-0.035, p.y);
  vec3 fl = mix(vec3(0.275,0.292,0.350), vec3(0.120,0.130,0.165),
                smoothstep(FY, FY-1.8, p.y));
  fl += lightC*0.22*exp(-abs(p.x)*0.40)*exp((p.y-FY)*1.35);   // panel reflection
  col = mix(col, fl, floorM);

  // pedestal / light stage
  float ped = sdRound(p - vec2(0.0,-1.22), vec2(1.34,0.32), 0.14);
  vec3 pedC = mix(vec3(0.46,0.49,0.57), vec3(0.78,0.81,0.89),
                  smoothstep(-1.54,-0.95, p.y));
  col = mix(col, pedC, smoothstep(0.013,-0.013, ped));
  float slot = sdRound(p - vec2(0.0,-0.945), vec2(1.06,0.028), 0.028);
  col = mix(col, lightC*1.18, smoothstep(0.010,-0.010, slot));

  // the delivery rail the parts ride in on — the only prop, and it earns its
  // place by explaining the opening beat
  float rail = sdRound(p - vec2(0.0, 2.14), vec2(3.40, 0.046), 0.046);
  for (int i=0;i<5;i++){
    vec2 hp = p - vec2(-2.60 + float(i)*1.30, 2.44);
    rail = min(rail, sdRound(hp, vec2(0.042, 0.30), 0.042));
  }
  col = mix(col, vec3(0.125,0.135,0.165), smoothstep(0.012,-0.012, rail)*0.94);

  // the analyser disc: it kills the polarised backlight, which is what makes
  // the object's colours explode out of a suddenly dark field
  float A0 = cos(uPol.x - uPol.y); A0 *= A0;
  vec3 plain = col * mix(1.0, A0*0.955 + 0.045, apertureMask*(1.0 - uFin.x));

  /* ---- finale: the whole workshop becomes stained glass ---- */
  if (uFin.x > 0.002){
    vec2 g = p*0.88 + 0.34*vec2(sin(p.y*1.12 + 0.7), cos(p.x*0.94 - 0.4));
    vec2 id = floor(g), f = fract(g);
    float h  = hash21(id);
    float h2 = hash21(id + 19.7);
    float dR = 300.0 + h*1750.0 + 700.0*sin(length(p)*1.45 + h2*TAU) + 300.0*p.y;
    float phi = h2*PI + 0.55*sin(p.x*0.62 + p.y*0.41);
    float B = -sin(2.0*(phi - uPol.y))*sin(2.0*(phi - uPol.x));
    vec3 t = max(A0*vec3(0.62) + B*lutC(dR/3400.0)*1.30, 0.0);
    // drive the glass mostly from the light, not from the furniture behind it,
    // otherwise the pedestal and bezel ghost through as grey rectangles
    vec3 base = mix(col, vec3(1.25,1.27,1.34)*uFin.z, 0.80);
    float lead = smoothstep(0.0, 0.042, min(min(f.x,f.y), min(1.0-f.x,1.0-f.y)));
    vec3 glass = base * (t + 0.018) * (0.02 + 0.98*lead);
    plain = mix(plain, glass, uFin.x);
  }
  return plain;
}

/* ------------------------------------------------------- object rendering */
struct Obj {
  vec2 pos; float scale; float rot;
  float mode; vec4 sh; float presence; float gate; float spokeN;
  vec4 ret; vec4 seed;
};

void drawObject(inout vec3 col, vec3 incident, vec2 world, Obj o, float pxW){
  if (o.presence <= 0.002) return;
  vec2 dw = world - o.pos;
  float lim = o.scale * 1.75;
  if (dot(dw, dw) > lim*lim) return;
  vec2 q = rot2(dw, -o.rot) / o.scale;
  float sd0 = shapeSD(q, o.mode, o.sh);
  if (sd0 > 0.22) return;

  /* finger pressure: bulges the outline and injects real stress */
  float bulge = 0.0, dPress = 0.0;
  vec2 pv = vec2(0.0);
  for (int k=0; k<3; k++){
    if (uPress[k].z <= 0.002) continue;
    vec2 lp = rot2(uPress[k].xy - o.pos, -o.rot) / o.scale;
    vec2 dv = q - lp;
    float r = length(dv);
    float rad = 0.26 + 0.34*uPress[k].w;
    float w = exp(-(r*r)/(rad*rad)) * uPress[k].z;
    bulge  += w*0.075;
    dPress += w*(760.0 + 330.0*sin(r*15.0 - uPress[k].w*4.5));
    pv += vec2(-dv.y, dv.x)/max(r,1e-4) * w * 1.7;
  }
  float sd = sd0 - bulge;

  // outward normal of the outline
  float e = 0.008;
  vec2 grad = (vec2(shapeSD(q+vec2(e,0.0), o.mode, o.sh),
                    shapeSD(q+vec2(0.0,e), o.mode, o.sh)) - vec2(sd0)) / e;
  float gm = length(grad);
  // near the medial axis the gradient collapses; damping instead of normalising
  // keeps that seam from turning into a hard dark line
  vec2 nrm = grad / max(gm, 0.55);

  // polar silhouettes (gear teeth, star points) are not true distance fields —
  // widening the AA by the gradient magnitude is what stops them going jaggy
  float aa  = max(pxW / o.scale, 1e-4) * 1.15 * clamp(gm, 0.7, 6.0);
  float cov = smoothstep(aa, -aa, sd) * o.presence;
  if (cov <= 0.002) return;

  float dIn   = max(-sd, 0.0);
  float thick = sqrt(clamp(dIn*1.9, 0.0, 1.0));
  float ang   = atan(q.y, q.x);
  float rr    = length(q);

  /* ---------------- retardation field (nm) ---------------- */
  float edgeBand = dIn*6.5*exp(1.0 - dIn*6.5);        // peaks just inside the rim
  float delta =
      o.ret.x * thick
    + o.ret.y * edgeBand
    + o.ret.z * (0.5 + 0.5*cos(o.spokeN*(ang - o.gate))) * smoothstep(0.04, 0.85, rr)
    + o.ret.w * sin(q.x*o.seed.x + o.seed.z) * cos(q.y*o.seed.y - o.seed.z*1.7)
    + (330.0 + 520.0*o.seed.w)                    // tint plate: this piece's hero colour
    + dPress;
  // smaller parts subtend fewer pixels, so ease their stress off a little —
  // otherwise their fringes go sub-pixel and wash out to pastel
  delta = max(delta, 0.0) * uPol.z * mix(0.70, 1.0, smoothstep(0.32, 0.62, o.scale));

  /* ---------------- slow-axis orientation ---------------- */
  vec2 v = vec2(-nrm.y, nrm.x) * (1.55*exp(-dIn*4.0));            // hugs the rim
  vec2 gp = vec2(cos(o.gate), sin(o.gate))*0.30;                  // gate, inside the part
  vec2 rad = q - gp;
  v += rad / max(length(rad), 0.12) * 1.55;                       // radial from the gate
  v += vec2(cos(o.seed.z*2.1), sin(o.seed.z*2.1)) * 0.22;         // slight overall flow
  v += pv;
  float phi = atan(v.y, v.x);

  /* ---------------- polarisation ---------------- */
  float A = cos(uPol.x - uPol.y); A *= A;
  float B = -sin(2.0*(phi - uPol.y)) * sin(2.0*(phi - uPol.x));

  float dn = delta / 3400.0;
  vec3 ml  = lutC(dn);
  // fringes finer than a pixel would alias — fade them to their own average,
  // which is exactly what happens optically at high order
  float wash = clamp(FWIDTH(delta)/680.0, 0.0, 1.0);
  wash = max(wash, smoothstep(0.86, 1.35, dn));
  ml = mix(ml, HIGH_ORDER, wash);

  vec3 t = max(A*vec3(1.0) + B*ml, 0.0);
  t += 0.016;                                    // honest polariser leakage

  vec3 objC = incident * t;

  /* ---------------- it must still read as glass ---------------- */
  float rim  = exp(-dIn*30.0);
  float lit  = clamp(dot(nrm, normalize(vec2(-0.55, 0.83))), 0.0, 1.0);
  objC += vec3(0.95,0.97,1.05) * rim * (0.10 + 0.44*lit);
  objC += vec3(1.0) * pow(clamp(1.0 - dIn*3.2, 0.0, 1.0), 9.0) * 0.028;
  objC *= 1.0 - 0.22*smoothstep(0.14, 0.0, dIn);   // slight edge absorption
  // sweet-spot shimmer: when the ring hits this piece's best angle
  objC += ml * uPol.w * 0.55 * (0.35 + 0.65*B);
  // "I'm here, touch me" pulse after a few idle seconds
  objC += vec3(0.92,0.96,1.12) * uCam.w * (rim*1.5 + 0.055);

  col = mix(col, objC, cov);
}

/* ------------------------------------------------------------------- ring */
vec3 drawRing(vec3 col, vec2 p, float pxW){
  if (uRing.z <= 0.003) return col;
  float R = uRing.x, W = uRing.y;
  float rr = length(p);
  float a  = atan(p.y, p.x) - uRing.w;

  float body = abs(rr - R) - W;
  float grip = 1e9;
  for (int k=0; k<8; k++){
    float ka = uRing.w + (float(k) + 0.5)*PI*0.25;
    grip = min(grip, length(p - vec2(cos(ka), sin(ka))*(R + W*0.62)) - W*0.60);
  }
  float d = min(body, grip);

  // three colour pips make the rotation unmistakable at a glance
  float pipD = 1e9; vec3 pipC = vec3(0.0);
  for (int k=0; k<3; k++){
    float ka = uRing.w + float(k)*TAU/3.0;
    float dd = length(p - vec2(cos(ka), sin(ka))*R) - W*0.52;
    if (dd < pipD){
      pipD = dd;
      pipC = k==0 ? vec3(2.10,0.42,1.30) : (k==1 ? vec3(0.28,1.85,2.05) : vec3(2.05,1.55,0.35));
    }
  }
  d = min(d, pipD);

  float m = smoothstep(pxW*1.1, -pxW*1.1, d) * uRing.z;
  if (m <= 0.002) return col;

  float lit = clamp(dot(normalize(p + vec2(1e-5)), normalize(vec2(-0.45, 0.89))), 0.0, 1.0);
  vec3 c = vec3(0.018,0.020,0.028) + vec3(0.105,0.110,0.135)*pow(lit, 1.7);
  // knurling across the band
  c += vec3(0.055,0.058,0.070) * (0.5 + 0.5*cos(a*44.0))
       * clamp(1.0 - abs(rr - R)/W, 0.0, 1.0);
  // crisp bevels top the whole thing off
  c += vec3(0.50,0.53,0.62) * smoothstep(pxW*2.6, 0.0, abs(rr - (R - W))) * 0.60;
  c += vec3(0.24,0.26,0.34) * smoothstep(pxW*2.6, 0.0, abs(rr - (R + W))) * 0.45;

  float pipM = smoothstep(pxW*1.1, -pxW*1.1, pipD);
  c = mix(c, pipC, pipM);

  col = mix(col, c, m);
  col += pipC * exp(-max(pipD, 0.0)*(5.5/max(W,0.02))) * 0.16 * uRing.z;
  return col;
}

/* ------------------------------------------------------------------- main */
void main(){
  vec2 frag = vUv * uRes;
  float mn = min(uRes.x, uRes.y);
  vec2 uv = (frag - 0.5*uRes) / mn * 2.0;
  vec2 world = uv / uCam.z + uCam.xy;
  float pxW = 2.0 / (mn * uCam.z);

  // analyser aperture: the disc inside the ring, or the whole room at the end
  float apR = uRing.x - uRing.y*0.85;
  float ap = smoothstep(pxW*2.0, -pxW*2.0, length(world) - apR) * uRing.z;
  ap = max(ap, uFin.x);

  vec3 col = roomColour(world, ap);

  // contact shadows before the parts themselves
  for (int i=0;i<4;i++){
    if (uObjC[i].y <= 0.002) continue;
    vec2 sp = (world - vec2(uObjA[i].x, -0.90)) / vec2(uObjA[i].z*1.05, 0.16);
    col *= 1.0 - 0.42*exp(-dot(sp,sp))*uObjC[i].y;
  }

  // light that reaches the parts (before the analyser dims the aperture)
  vec3 incident = vec3(1.34, 1.36, 1.44) * uFin.z;

  for (int i=0;i<4;i++){
    Obj o;
    o.pos = uObjA[i].xy; o.scale = uObjA[i].z; o.rot = uObjA[i].w;
    o.mode = uObjB[i].x;
    o.sh   = vec4(uObjB[i].y, uObjB[i].z, uObjB[i].w, uObjC[i].x);
    o.presence = uObjC[i].y; o.gate = uObjC[i].z; o.spokeN = uObjC[i].w;
    o.ret = uObjD[i]; o.seed = uObjE[i];
    drawObject(col, incident, world, o, pxW);
  }

  col = drawRing(col, world, pxW);

  FRAGCOLOR = vec4(max(col, 0.0) * uOutScale, 1.0);
}
`;
