import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildCableCurve, endpointsChanged, sampleCable } from '../cableMath';

const drum = new Vector3(0, 5, 0);
const sheave = new Vector3(3, 6, 0);
const hook = new Vector3(3, 1, 0);

describe('endpointsChanged', () => {
  it('is false when nothing moved', () => {
    const a = { drum: drum.clone(), sheave: sheave.clone(), hook: hook.clone() };
    const b = { drum: drum.clone(), sheave: sheave.clone(), hook: hook.clone() };
    expect(endpointsChanged(a, b)).toBe(false);
  });

  it('is false for sub-epsilon jitter', () => {
    const a = { drum: drum.clone(), sheave: sheave.clone(), hook: hook.clone() };
    const b = { drum: drum.clone(), sheave: sheave.clone(), hook: hook.clone().add(new Vector3(0.001, 0, 0)) };
    expect(endpointsChanged(a, b)).toBe(false);
  });

  it('is true when the hook moves meaningfully', () => {
    const a = { drum: drum.clone(), sheave: sheave.clone(), hook: hook.clone() };
    const b = { drum: drum.clone(), sheave: sheave.clone(), hook: hook.clone().add(new Vector3(0, -1, 0)) };
    expect(endpointsChanged(a, b)).toBe(true);
  });
});

describe('buildCableCurve / sampleCable', () => {
  it('starts at the drum and ends at the hook', () => {
    const pts = sampleCable({ drum, sheave, hook }, 0, 16);
    expect(pts[0]!.distanceTo(drum)).toBeLessThan(1e-6);
    expect(pts[pts.length - 1]!.distanceTo(hook)).toBeLessThan(1e-6);
  });

  it('produces the requested number of samples', () => {
    const pts = sampleCable({ drum, sheave, hook }, 0, 20);
    expect(pts.length).toBe(21);
  });

  it('sags downward (lower midpoint y) when slack increases', () => {
    const taut = buildCableCurve({ drum, sheave, hook }, 0).getPoint(0.75);
    const slack = buildCableCurve({ drum, sheave, hook }, 1).getPoint(0.75);
    expect(slack.y).toBeLessThan(taut.y);
  });

  it('clamps segment count to at least 2', () => {
    const pts = sampleCable({ drum, sheave, hook }, 0, 0);
    expect(pts.length).toBeGreaterThanOrEqual(3);
  });
});
