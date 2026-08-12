// src/scene/beamShapes.ts
// Pure geometric description of the 3 seeded beam silhouettes
// (BeamShape from contracts). Each shape is a list of straight iron
// "members" (start/end points + thickness) in beam-local space
// (length along +x, from 0..LENGTH, width in y, centered on z=0) plus a
// list of rivet-dot positions at the member joints. Kept free of THREE/DOM
// so the shape logic itself is unit-testable; src/scene/beam.ts turns this
// into real geometry.

import type { BeamShape } from '../contracts/types';

export const BEAM_LENGTH = 3.6;
export const BEAM_WIDTH = 0.62;

export interface BeamMember {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  thickness: number;
}

export interface BeamProfile {
  shape: BeamShape;
  members: BeamMember[];
  rivets: { x: number; y: number }[];
  /** A short human-legible tag identifying the source "factory" (Levallois-Perret) motif, purely cosmetic. */
  factoryTag: string;
}

const CHORD_THICKNESS = 0.09;
const WEB_THICKNESS = 0.055;

function chordMembers(): BeamMember[] {
  return [
    { ax: 0, ay: BEAM_WIDTH / 2, bx: BEAM_LENGTH, by: BEAM_WIDTH / 2, thickness: CHORD_THICKNESS },
    { ax: 0, ay: -BEAM_WIDTH / 2, bx: BEAM_LENGTH, by: -BEAM_WIDTH / 2, thickness: CHORD_THICKNESS },
  ];
}

function girderProfile(): BeamMember[] {
  const members = chordMembers();
  const bays = 5;
  for (let i = 0; i < bays; i += 1) {
    const x0 = (i / bays) * BEAM_LENGTH;
    const x1 = ((i + 1) / bays) * BEAM_LENGTH;
    // vertical post
    members.push({ ax: x0, ay: BEAM_WIDTH / 2, bx: x0, by: -BEAM_WIDTH / 2, thickness: WEB_THICKNESS });
    // diagonal
    if (i % 2 === 0) {
      members.push({ ax: x0, ay: BEAM_WIDTH / 2, bx: x1, by: -BEAM_WIDTH / 2, thickness: WEB_THICKNESS });
    } else {
      members.push({ ax: x0, ay: -BEAM_WIDTH / 2, bx: x1, by: BEAM_WIDTH / 2, thickness: WEB_THICKNESS });
    }
  }
  members.push({
    ax: BEAM_LENGTH,
    ay: BEAM_WIDTH / 2,
    bx: BEAM_LENGTH,
    by: -BEAM_WIDTH / 2,
    thickness: WEB_THICKNESS,
  });
  return members;
}

function xpanelProfile(): BeamMember[] {
  const members = chordMembers();
  const bays = 4;
  for (let i = 0; i < bays; i += 1) {
    const x0 = (i / bays) * BEAM_LENGTH;
    const x1 = ((i + 1) / bays) * BEAM_LENGTH;
    members.push({ ax: x0, ay: BEAM_WIDTH / 2, bx: x1, by: -BEAM_WIDTH / 2, thickness: WEB_THICKNESS });
    members.push({ ax: x0, ay: -BEAM_WIDTH / 2, bx: x1, by: BEAM_WIDTH / 2, thickness: WEB_THICKNESS });
  }
  members.push({
    ax: 0,
    ay: BEAM_WIDTH / 2,
    bx: 0,
    by: -BEAM_WIDTH / 2,
    thickness: WEB_THICKNESS,
  });
  members.push({
    ax: BEAM_LENGTH,
    ay: BEAM_WIDTH / 2,
    bx: BEAM_LENGTH,
    by: -BEAM_WIDTH / 2,
    thickness: WEB_THICKNESS,
  });
  return members;
}

function curvedProfile(): BeamMember[] {
  // A gently bowed top chord (edge member) over a straight bottom chord.
  const members: BeamMember[] = [];
  const segs = 6;
  const bow = BEAM_WIDTH * 0.55;
  let prev = { x: 0, y: BEAM_WIDTH / 2 };
  for (let i = 1; i <= segs; i += 1) {
    const t = i / segs;
    const x = t * BEAM_LENGTH;
    const y = BEAM_WIDTH / 2 + Math.sin(t * Math.PI) * bow;
    members.push({ ax: prev.x, ay: prev.y, bx: x, by: y, thickness: CHORD_THICKNESS });
    prev = { x, y };
  }
  members.push({ ax: 0, ay: -BEAM_WIDTH / 2, bx: BEAM_LENGTH, by: -BEAM_WIDTH / 2, thickness: CHORD_THICKNESS });
  const bays = 5;
  for (let i = 0; i <= bays; i += 1) {
    const t = i / bays;
    const x = t * BEAM_LENGTH;
    const topY = BEAM_WIDTH / 2 + Math.sin(t * Math.PI) * bow;
    members.push({ ax: x, ay: topY, bx: x, by: -BEAM_WIDTH / 2, thickness: WEB_THICKNESS });
  }
  return members;
}

const BUILDERS: Record<BeamShape, () => BeamMember[]> = {
  girder: girderProfile,
  xpanel: xpanelProfile,
  curved: curvedProfile,
};

const FACTORY_TAGS: Record<BeamShape, string> = {
  girder: 'LP-G',
  xpanel: 'LP-X',
  curved: 'LP-C',
};

/** Rivet dots at every member endpoint, deduplicated by proximity. */
function jointRivets(members: BeamMember[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const eps = 0.02;
  const push = (x: number, y: number): void => {
    for (const p of pts) {
      if (Math.abs(p.x - x) < eps && Math.abs(p.y - y) < eps) return;
    }
    pts.push({ x, y });
  };
  for (const m of members) {
    push(m.ax, m.ay);
    push(m.bx, m.by);
  }
  return pts;
}

export function beamProfileFor(shape: BeamShape): BeamProfile {
  const members = BUILDERS[shape]();
  return { shape, members, rivets: jointRivets(members), factoryTag: FACTORY_TAGS[shape] };
}
