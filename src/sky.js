// 空ドーム。グラデーション・太陽・雲を 1 つのメッシュで描く。
// 遠景の霞（空気遠近）の基準色もここから供給する。
import * as THREE from 'three';
import { cloudTexture } from './textures.js';

const VERT = /* glsl */ `
  varying vec3 vDir;
  varying vec2 vUv;
  void main() {
    vDir = normalize( position );
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform float uCloud;
  uniform sampler2D uCloudMap;
  varying vec3 vDir;
  varying vec2 vUv;

  void main() {
    vec3 dir = normalize( vDir );
    float h = dir.y;

    vec3 col = mix( uSkyHorizon, uSkyTop, pow( clamp( h, 0.0, 1.0 ), 0.52 ) );
    // 地平線のすぐ下は地面から巻き上がる塵で少し暖かく濁る
    col = mix( col, uSkyHorizon * 0.86, smoothstep( 0.0, -0.16, h ) );

    // 太陽本体と、その周りのハロー
    float sd = max( dot( dir, uSunDir ), 0.0 );
    col += uSunColor * pow( sd, 1400.0 ) * 14.0;
    col += uSunColor * pow( sd, 14.0 ) * 0.34;
    col += uSunColor * pow( sd, 3.0 ) * 0.07;

    // 雲：2 枚を違う速度で流して、平坦にならないようにする
    float band = smoothstep( 0.015, 0.30, h ) * ( 1.0 - smoothstep( 0.45, 1.0, h ) * 0.55 );
    if ( band > 0.001 ) {
      vec2 uv = vec2( vUv.x * 3.0, vUv.y * 1.6 );
      float a = texture2D( uCloudMap, uv + vec2( uTime * 0.0035, 0.0 ) ).a;
      float b = texture2D( uCloudMap, uv * 1.9 + vec2( -uTime * 0.0021, 0.13 ) ).a;
      float m = clamp( a * 0.72 + b * 0.5, 0.0, 1.0 ) * band * uCloud;
      // 太陽側の雲は縁が明るく光る
      vec3 cloudCol = mix( vec3( 0.86, 0.87, 0.90 ), uSunColor * 1.25, pow( sd, 6.0 ) * 0.8 + 0.18 );
      col = mix( col, cloudCol, m );
    }

    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(shared) {
  const geo = new THREE.SphereGeometry(900, 32, 20);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: Object.assign(
      {
        uTime: { value: 0 },
        uCloud: { value: 0.85 },
        uCloudMap: { value: cloudTexture() },
      },
      {
        uSkyTop: shared.uSkyTop,
        uSkyHorizon: shared.uSkyHorizon,
        uSunDir: shared.uSunDir,
        uSunColor: shared.uSunColor,
      }
    ),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}
