// かん水（塩分を含んだ水）のマテリアル。
// 塩分濃度 uSalinity が上がるほど、海の青緑 → 淡いサーモン → 珊瑚色 → 鮮やかなマゼンタピンク
// へと自然に遷移する。ピンクは「塗る色」ではなく、濃くなった塩水そのものの色として扱う。
import * as THREE from 'three';

// 塩分濃度に対する色のランプ。実際のソルトパンの写真から拾った色を線形空間へ変換して使う。
export const BRINE_STOPS = [
  0x22505c, // 0.00 引き込んだばかりの海水（暗い青緑）
  0x94867c, // 0.25 濁った浅い水。底の塩床が透けて灰色がかる
  0xdb968b, // 0.50 淡いサーモンピンク
  0xf55a8d, // 0.75 珊瑚色のピンク
  0xff4fa0, // 1.00 鮮やかなマゼンタピンク
];

const VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  #ifdef FARFIELD
    attribute vec2 aDelay;   // x: ピンクが届くまでの遅れ, y: その池の最終濃度
    attribute vec2 aSize;
    varying vec2 vDelay;
    varying vec2 vSize;
  #endif
  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    #ifdef FARFIELD
      vDelay = aDelay;
      vSize = aSize;
    #endif
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorld = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uWind;
  uniform float uDepth;       // 水深（メートル）
  uniform float uCrust;       // 岸に析出した塩の量 0..1
  uniform float uInflow;      // 流れ込みの強さ 0..1
  uniform vec2  uInflowPos;   // 流れ込み位置（ワールド xz）
  uniform float uSparkle;     // クライマックスの煌めき
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform vec3  uSkyTop;
  uniform vec3  uSkyHorizon;
  uniform vec3  uBedColor;
  uniform vec3  uC0, uC1, uC2, uC3, uC4;

  #ifdef FARFIELD
    uniform float uReveal;
    varying vec2  vDelay;
    varying vec2  vSize;
  #else
    uniform float uSalinity;
    uniform vec2  uSize;      // 水面の大きさ（メートル）
  #endif

  varying vec3 vWorld;
  varying vec2 vUv;
  // tonemapping / colorspace の関数定義はレンダラが自動で前置きするので、
  // ここでは適用側（<tonemapping_fragment> など）だけを使う。
  #include <common>
  #include <fog_pars_fragment>

  vec3 brineColor( float s ) {
    s = clamp( s, 0.0, 1.0 ) * 4.0;
    if ( s < 1.0 ) return mix( uC0, uC1, s );
    if ( s < 2.0 ) return mix( uC1, uC2, s - 1.0 );
    if ( s < 3.0 ) return mix( uC2, uC3, s - 2.0 );
    return mix( uC3, uC4, s - 3.0 );
  }

  // 波の勾配。周波数の異なる 4 方向の波を重ね、遠景では高周波を落として
  // ちらつき（エイリアシング）を防ぐ。
  vec2 rippleGrad( vec2 p, float t, float wind, float fade ) {
    vec2 d1 = normalize( vec2(  1.00,  0.34 ) );
    vec2 d2 = normalize( vec2( -0.42,  1.00 ) );
    vec2 d3 = normalize( vec2(  0.83, -0.58 ) );
    vec2 d4 = normalize( vec2( -0.91, -0.28 ) );
    float s = 0.018 + 0.105 * wind;
    vec2 g = vec2( 0.0 );
    g += d1 * cos( dot( p, d1 ) *  4.7 + t * 1.9 ) * s;
    g += d2 * cos( dot( p, d2 ) *  9.1 + t * 2.7 ) * s * 0.55 * fade;
    g += d3 * cos( dot( p, d3 ) * 17.3 + t * 3.9 ) * s * 0.30 * fade;
    g += d4 * cos( dot( p, d4 ) * 31.0 + t * 5.3 ) * s * 0.16 * fade * fade;
    return g;
  }

  float hash12( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }

  void main() {
    #ifdef FARFIELD
      float salinity = mix( 0.10, vDelay.y, smoothstep( vDelay.x, vDelay.x + 0.32, uReveal ) );
      vec2  size = vSize;
      float depth = 0.18;
      float crust = uCrust;
      float inflow = 0.0;
    #else
      float salinity = uSalinity;
      vec2  size = uSize;
      float depth = uDepth;
      float crust = uCrust;
      float inflow = uInflow;
    #endif

    vec3 viewVec = cameraPosition - vWorld;
    float dist = length( viewVec );
    vec3 V = viewVec / max( dist, 0.0001 );
    float fade = 1.0 / ( 1.0 + dist * dist * 0.0045 );

    // --- 法線 ---------------------------------------------------------
    vec2 g = rippleGrad( vWorld.xz, uTime, uWind, fade );

    // 流れ込みの周りは同心円状に波立つ
    if ( inflow > 0.001 ) {
      vec2 toIn = vWorld.xz - uInflowPos;
      float r = length( toIn );
      float ring = cos( r * 8.0 - uTime * 7.0 ) * exp( -r * 0.45 ) * inflow * 0.32;
      g += normalize( toIn + 1e-4 ) * ring;
    }
    vec3 N = normalize( vec3( -g.x, 1.0, -g.y ) );

    // --- 岸からの距離（メートル） -------------------------------------
    vec2 e = min( vUv, 1.0 - vUv ) * size;
    float edgeDist = min( e.x, e.y );

    // --- 水そのものの色 -----------------------------------------------
    vec3 brine = brineColor( salinity );

    // 岸に近いほど浅い。浅いところは白い塩床が透けて、明るいピンクに見える。
    float d = depth * smoothstep( 0.0, 1.1, edgeDist );
    float T = exp( -d * 6.5 );
    float bedNoise = 0.86 + 0.28 * hash12( floor( vWorld.xz * 3.0 ) );
    vec3 bed = uBedColor * bedNoise;
    // 浅いところは白い塩床が透けて明るくなる。ただし色みは水そのものの色を保つ
    // ——ここで床の色を混ぜすぎると、ピンクがオレンジへ転んでしまう。
    float bedLum = dot( bed, vec3( 0.32, 0.52, 0.16 ) );
    vec3 shallow = brine * ( 0.90 + 0.30 * bedLum ) + bed * 0.03;
    vec3 body = mix( brine, shallow, T );

    // --- 岸に析出した塩の縁取り ---------------------------------------
    float crustBand = smoothstep( 0.55, 0.02, edgeDist ) * crust;
    float crustSparkle = step( 0.72, hash12( floor( vWorld.xz * 26.0 ) ) ) * fade;
    body = mix( body, vec3( 0.90, 0.86, 0.87 ) + crustSparkle * 0.25, crustBand * 0.8 );

    // --- 照明 ---------------------------------------------------------
    float ndl = max( dot( N, uSunDir ), 0.0 );
    vec3 col = body * ( 0.70 + 0.60 * ndl );
    // 空からの拡散光（上向きの面ほど空の色を拾う）
    col += body * uSkyHorizon * 0.26;

    // フレネルによる空の映り込み。浅い角度で見た遠くの水面が明るく光る。
    vec3 R = reflect( -V, N );
    vec3 skyRef = mix( uSkyHorizon, uSkyTop, clamp( R.y * 1.7, 0.0, 1.0 ) );
    float f = pow( 1.0 - max( dot( N, V ), 0.0 ), 5.0 );
    float fres = 0.022 + 0.978 * f;
    col = mix( col, skyRef, fres * 0.55 );

    // 太陽の反射
    vec3 H = normalize( uSunDir + V );
    float nh = max( dot( N, H ), 0.0 );
    float spec = pow( nh, 120.0 ) * 1.5 + pow( nh, 20.0 ) * 0.055;
    col += uSunColor * spec * ( 0.55 + 0.7 * uWind );

    // --- 流れ込みの泡 -------------------------------------------------
    if ( inflow > 0.001 ) {
      float r = distance( vWorld.xz, uInflowPos );
      float foam = smoothstep( 2.1, 0.0, r ) * inflow;
      float churn = 0.45 + 0.55 * ( sin( r * 9.0 - uTime * 8.0 ) * 0.5 + 0.5 );
      float bub = step( 0.55, hash12( floor( vWorld.xz * 14.0 + uTime * 2.0 ) ) );
      col = mix( col, vec3( 0.95, 0.93, 0.94 ), clamp( foam * 0.62 * churn + foam * bub * 0.25, 0.0, 1.0 ) );
    }

    // --- クライマックスの煌めき ---------------------------------------
    if ( uSparkle > 0.001 ) {
      float sp = step( 0.994, hash12( floor( vWorld.xz * 4.0 ) + floor( uTime * 2.5 ) ) );
      col += sp * uSparkle * fade * vec3( 1.0, 0.86, 0.92 ) * 0.55;
    }

    gl_FragColor = vec4( col, 1.0 );
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function linearColor(hex) {
  return new THREE.Color(hex).convertSRGBToLinear();
}

// すべての水面マテリアルが共有する環境（太陽・空の色）。1 か所で更新する。
export function createWaterUniforms() {
  return {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.35, 0.72, -0.6).normalize() },
    uSunColor: { value: linearColor(0xfff0dc) },
    uSkyTop: { value: linearColor(0x6fa6d8) },
    uSkyHorizon: { value: linearColor(0xdfe7ec) },
    uBedColor: { value: linearColor(0xd8cfc6) },
    uC0: { value: linearColor(BRINE_STOPS[0]) },
    uC1: { value: linearColor(BRINE_STOPS[1]) },
    uC2: { value: linearColor(BRINE_STOPS[2]) },
    uC3: { value: linearColor(BRINE_STOPS[3]) },
    uC4: { value: linearColor(BRINE_STOPS[4]) },
  };
}

// UniformsUtils.clone は値を複製するので、共有 uniform は Object.assign で
// 参照のまま差し込む。こうすると太陽や空の色を 1 か所更新するだけで全水面に届く。
function buildUniforms(own, shared) {
  return Object.assign(
    THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    own,
    shared
  );
}

// 個々の池が持つ水面マテリアル。
export function createWaterMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    lights: false,
    uniforms: buildUniforms(
      {
        uSalinity: { value: 0 },
        uWind: { value: 0.12 },
        uDepth: { value: 0.2 },
        uCrust: { value: 0 },
        uInflow: { value: 0 },
        uInflowPos: { value: new THREE.Vector2() },
        uSparkle: { value: 0 },
        uSize: { value: new THREE.Vector2(10, 10) },
      },
      shared
    ),
  });
}

// 遠景に広がる塩田群。1 つのジオメトリにまとめ、頂点属性 aDelay で
// ピンクが波のように広がっていく様子を作る。
export function createFarWaterMaterial(shared) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    lights: false,
    defines: { FARFIELD: '' },
    uniforms: buildUniforms(
      {
        uReveal: { value: 0 },
        uWind: { value: 0.12 },
        uCrust: { value: 0.35 },
        uSparkle: { value: 0 },
      },
      shared
    ),
  });
}
