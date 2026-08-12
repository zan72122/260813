import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { projectToScreen, projectedRadius } from '../anchorProject';

function makeCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(50, 800 / 600, 0.1, 1000);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

describe('projectToScreen', () => {
  it('projects the world origin (in view) to the viewport center', () => {
    const cam = makeCamera();
    const p = projectToScreen(cam, 0, 0, 0, 800, 600);
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(400, 0);
    expect(p.y).toBeCloseTo(300, 0);
  });

  it('moves right in world space -> moves right on screen', () => {
    const cam = makeCamera();
    const p = projectToScreen(cam, 2, 0, 0, 800, 600);
    expect(p.x).toBeGreaterThan(400);
  });

  it('moves up in world space -> moves up on screen (smaller y)', () => {
    const cam = makeCamera();
    const p = projectToScreen(cam, 0, 2, 0, 800, 600);
    expect(p.y).toBeLessThan(300);
  });

  it('marks points behind the camera as not visible', () => {
    const cam = makeCamera();
    // camera looks toward -z from z=10; a point further behind it (z=20) is behind the camera
    const p = projectToScreen(cam, 0, 0, 20, 800, 600);
    expect(p.visible).toBe(false);
  });

  it('marks points in front, within near/far, as visible', () => {
    const cam = makeCamera();
    const p = projectToScreen(cam, 0, 0, 5, 800, 600);
    expect(p.visible).toBe(true);
  });
});

describe('projectedRadius', () => {
  it('returns a larger pixel radius for closer objects than farther ones of the same world radius', () => {
    const cam = makeCamera();
    const near = projectedRadius(cam, 0, 0, 8, 1, 800, 600);
    const far = projectedRadius(cam, 0, 0, -8, 1, 800, 600);
    expect(near).toBeGreaterThan(far);
  });

  it('returns 0 for a zero world radius', () => {
    const cam = makeCamera();
    const r = projectedRadius(cam, 0, 0, 0, 0, 800, 600);
    expect(r).toBeCloseTo(0, 5);
  });
});
