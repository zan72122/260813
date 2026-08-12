/**
 * Input contract (input → game). The `input` owner translates raw pointer
 * gestures into these intents via HandleRegistry (handles.ts); `game`
 * (stateMachine.ts) is the only consumer and never reads pointer/DOM state
 * directly. See ARCHITECTURE_CONTRACT.md § intents.ts.
 */

export type Intent =
  | { type: 'gateSet'; open: number } // 0..1(離した=0)
  | { type: 'jackStroke' } // 有効な一往復
  | { type: 'wedgeDrag'; progress: number } // 0..1
  | { type: 'wedgeRelease' }
  | { type: 'hammerTap' }
  | { type: 'advance' } // 演出スキップ相当の軽タップ(罰なし)
  | { type: 'replay' };

export type IntentType = Intent['type'];
