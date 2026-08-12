// src/ui/layout.ts — pure orientation/layout classification. Kept separate
// from CSS media queries so JS-side placement (e.g. hint offset direction)
// can agree with the stylesheet without duplicating breakpoint numbers.

export type Orientation = 'portrait' | 'landscape';

export function selectOrientation(width: number, height: number): Orientation {
  return width >= height ? 'landscape' : 'portrait';
}

export function orientationClassName(orientation: Orientation): string {
  return `orientation-${orientation}`;
}
