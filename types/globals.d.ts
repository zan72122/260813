// Test hooks and vendor-prefixed APIs the game legitimately touches.
interface Window {
  webkitAudioContext?: typeof AudioContext;
  __game?: any;
  __ui?: any;
}
