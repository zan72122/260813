import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_HANDLE_RADIUS, projectHandle, projectToScreen, RENDER_OWNED_HANDLE_IDS } from '../../src/render/handleProjection';

function camAt(z: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
  cam.position.set(0, 0, z);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

describe('projectToScreen', () => {
  it('projects a point directly in front of the camera to the viewport center', () => {
    const cam = camAt(10);
    const { x, y, visible } = projectToScreen(new THREE.Vector3(0, 0, 0), cam, 800, 600);
    expect(x).toBeCloseTo(400, 3);
    expect(y).toBeCloseTo(300, 3);
    expect(visible).toBe(true);
  });

  it('a point to the right of center projects to screen-x > half width; a point up projects to screen-y < half height', () => {
    const cam = camAt(10);
    const right = projectToScreen(new THREE.Vector3(2, 0, 0), cam, 800, 600);
    expect(right.x).toBeGreaterThan(400);
    const up = projectToScreen(new THREE.Vector3(0, 2, 0), cam, 800, 600);
    expect(up.y).toBeLessThan(300); // screen Y grows downward
  });

  it('marks a point behind the camera as not visible', () => {
    const cam = camAt(10); // camera at z=10 looking toward origin (-z direction)
    const behind = projectToScreen(new THREE.Vector3(0, 0, 20), cam, 800, 600); // further +z than the camera = behind it
    expect(behind.visible).toBe(false);
  });

  it('is a pure function of (point, camera state, viewport) — repeated calls agree', () => {
    const cam = camAt(15);
    const p = new THREE.Vector3(1, 2, 3);
    const a = projectToScreen(p, cam, 390, 844);
    const b = projectToScreen(p, cam, 390, 844);
    expect(a).toEqual(b);
  });
});

describe('projectHandle', () => {
  it('builds a full HandleInfo with radius >= 48 (contracts/handles.ts floor) by default', () => {
    const cam = camAt(10);
    const info = projectHandle(
      { id: 'sandGate', worldPosition: new THREE.Vector3(0, 0, 0), axis: 'vertical', range: 140, active: true },
      cam,
      800,
      600,
    );
    expect(info.id).toBe('sandGate');
    expect(info.radius).toBe(DEFAULT_HANDLE_RADIUS);
    expect(info.radius).toBeGreaterThanOrEqual(48);
    expect(info.axis).toBe('vertical');
    expect(info.range).toBe(140);
    expect(info.active).toBe(true);
    expect(info.x).toBeCloseTo(400, 3);
    expect(info.y).toBeCloseTo(300, 3);
  });

  it('honors an explicit radius override, as long as it still satisfies the contract (caller responsibility)', () => {
    const cam = camAt(10);
    const info = projectHandle(
      { id: 'hammer', worldPosition: new THREE.Vector3(0, 0, 0), axis: 'free', range: 60, active: false, radius: 64 },
      cam,
      800,
      600,
    );
    expect(info.radius).toBe(64);
    expect(info.active).toBe(false);
  });

  it('RENDER_OWNED_HANDLE_IDS covers exactly the 4 3D-object handles, excluding replayButton', () => {
    expect(RENDER_OWNED_HANDLE_IDS).toEqual(['sandGate', 'pumpHandle', 'wedge', 'hammer']);
    expect(RENDER_OWNED_HANDLE_IDS).not.toContain('replayButton');
  });
});
