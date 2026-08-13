/**
 * Michel-Lévy interference colour LUT.
 *
 * Between two polarisers, a birefringent (stressed) transparent object shifts
 * one polarisation component relative to the other by a retardation δ (in nm).
 * Per wavelength the transmitted intensity carries a factor sin²(π δ / λ).
 * Integrating that against the CIE 1931 colour matching functions gives the
 * famous Michel-Lévy colours: grey → straw → magenta ("sensitive tint") →
 * cyan → green → pink → pale green ... i.e. exactly the pink/cyan-led palette
 * we want, with genuinely dark bands where δ → 0.
 *
 * That is *far* prettier than an HSV rainbow, and it is one texture lookup.
 *
 * The full expression for polariser at θp / analyser at θa and a local slow
 * axis φ is
 *
 *   I(λ) = cos²(θa-θp) − sin(2(φ-θp))·sin(2(φ-θa))·sin²(πδ/λ)
 *
 * The λ-dependent part factors out, so the shader only needs
 *
 *   colour = A · white + B · ML(δ)          A = cos²(θa-θp)
 *                                           B = −sin(2(φ-θp))·sin(2(φ-θa))
 *
 * ML(δ) is this LUT. A=1,B=−sin²2φ  → parallel polarisers → near-white
 * ("透明"). A=0,B=+sin²2φ → crossed → full colour on black ("にじ").
 */

const LUT_W = 1024;
export const LUT_MAX_DELTA = 3400; // nm — up to ~5th order, plenty of bands

// Wyman/Sloan/Shirley multi-lobe Gaussian fits to the CIE 1931 2° observer.
function gauss(x, mu, s1, s2) {
  const t = (x - mu) * (x < mu ? 1 / s1 : 1 / s2);
  return Math.exp(-0.5 * t * t);
}
const xBar = (l) =>
  1.056 * gauss(l, 599.8, 37.9, 31.0) +
  0.362 * gauss(l, 442.0, 16.0, 26.7) -
  0.065 * gauss(l, 501.1, 20.4, 26.2);
const yBar = (l) =>
  0.821 * gauss(l, 568.8, 46.9, 40.5) + 0.286 * gauss(l, 530.9, 16.3, 31.1);
const zBar = (l) =>
  1.217 * gauss(l, 437.0, 11.8, 36.0) + 0.681 * gauss(l, 459.0, 26.0, 13.8);

// Rough D65 relative spectral power — keeps the "white" of the light box neutral.
function d65(l) {
  return (
    1.0 +
    0.28 * Math.exp(-0.5 * Math.pow((l - 460) / 42, 2)) -
    0.14 * Math.exp(-0.5 * Math.pow((l - 590) / 60, 2))
  );
}

function xyzToLinearRgb(X, Y, Z) {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ];
}

/**
 * Build the LUT as 8-bit RGBA, values encoded as v/2 so the (rare) >1 channels
 * survive. The shader multiplies by 2. Composite adds a dither so the reduced
 * precision never bands on the big soft colour fields.
 * @returns {{data: Uint8Array, width: number}}
 */
export function buildMichelLevyLUT() {
  // Sample the visible spectrum.
  const L0 = 385,
    L1 = 730,
    STEP = 2.5;
  const lambdas = [];
  for (let l = L0; l <= L1; l += STEP) lambdas.push(l);

  // White point of the same illuminant (δ→∞ average is 0.5·white, δ=0 is 0).
  let Xw = 0,
    Yw = 0,
    Zw = 0;
  for (const l of lambdas) {
    const p = d65(l);
    Xw += xBar(l) * p;
    Yw += yBar(l) * p;
    Zw += zBar(l) * p;
  }
  const wRgb = xyzToLinearRgb(Xw, Yw, Zw);
  const inv = [1 / wRgb[0], 1 / wRgb[1], 1 / wRgb[2]];

  const data = new Uint8Array(LUT_W * 4);
  for (let i = 0; i < LUT_W; i++) {
    const delta = (i / (LUT_W - 1)) * LUT_MAX_DELTA;
    let X = 0,
      Y = 0,
      Z = 0;
    for (const l of lambdas) {
      const s = Math.sin((Math.PI * delta) / l);
      const w = s * s * d65(l);
      X += xBar(l) * w;
      Y += yBar(l) * w;
      Z += zBar(l) * w;
    }
    const rgb = xyzToLinearRgb(X, Y, Z);
    for (let c = 0; c < 3; c++) {
      // normalise against white so ML(δ) is directly comparable to vec3(1)
      let v = rgb[c] * inv[c];
      v = Math.max(0, v);
      data[i * 4 + c] = Math.round(Math.min(255, (v / 2) * 255));
    }
    data[i * 4 + 3] = 255;
  }
  return { data, width: LUT_W };
}
