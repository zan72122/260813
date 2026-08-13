// Test hooks and vendor-prefixed APIs the game legitimately touches.
interface Window {
  webkitAudioContext?: typeof AudioContext;
  __game?: any;
  __ui?: any;
  __uniPost?: Float32Array | number[];
  __uniPol?: Float32Array | number[];
}
