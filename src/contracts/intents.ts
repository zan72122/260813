// src/contracts/intents.ts
// Published by the input layer (mobile-qa owner: src/input/**), consumed by the
// game layer (gameplay-camera owner: src/game/**). Do not edit outside src/contracts/**.

/** Action intents emitted from raw input handling toward game logic. */
export type ActionIntent =
  | { kind: 'tap'; x: number; y: number } // normalized coordinates 0..1
  | { kind: 'whistle-blow' } // after whistle hit-test
  | {
      kind: 'valve-rotate';
      deltaAngleRad: number; // positive = clockwise
      angularVelocityRadPerSec: number;
    }
  | { kind: 'choice'; choice: 'same' | 'restart' | 'free-valve' };
