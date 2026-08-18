import { Stage } from './stage';
import { AudioManager } from './audio';
import { InputManager } from './input';
import { CameraRig } from './cameraRig';
import { UI } from './ui';
import { loadSave } from './save';
import { Game, World } from './game';
import { introModule, pourModule, gatherModule } from './modules/early';
import { stretchModule, spreadModule, bagFormModule } from './modules/stretchy';
import { stracModule, fillModule } from './modules/filling';
import {
  gatherMouthModule, closeMouthModule, coldWaterModule,
  plateModule, openModule, replayModule,
} from './modules/finish';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const stage = new Stage(canvas);
const audio = new AudioManager();
const input = new InputManager(canvas);
const cam = new CameraRig(stage.camera);
const ui = new UI();
const save = loadSave();
const world = new World(stage);

audio.setVolumeStep(save.volumeStep);
ui.setVolumeStep(save.volumeStep);
stage.reduceMotion = save.reduceMotion;
ui.setMotion(save.reduceMotion);

// iOS: 最初のジェスチャで音声を解禁
input.onFirstGesture = () => audio.unlock();
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// バックグラウンド移行で継続音を止め、復帰時に音を復旧
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    audio.unlock();
  } else {
    audio.stopAllChannels();
    window.speechSynthesis?.cancel();
  }
});

const game = new Game(stage, world, audio, input, cam, ui, save);
game.modules = [
  introModule(),      // 0
  pourModule(),       // 1
  gatherModule(),     // 2
  stretchModule(),    // 3
  spreadModule(),     // 4
  bagFormModule(),    // 5
  stracModule(),      // 6
  fillModule(),       // 7
  gatherMouthModule(),// 8
  closeMouthModule(), // 9
  coldWaterModule(),  // 10
  plateModule(),      // 11
  openModule(),       // 12
  replayModule(),     // 13
];

game.start();

// 起動画面を消す
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.getElementById('boot')?.classList.add('hidden');
  });
});
