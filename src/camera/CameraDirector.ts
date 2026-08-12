/**
 * STUB — owner A (gameplay-camera) owns src/camera/**.
 * Real responsibility: CinematicBeat sequencing, cutaway/section framing per
 * docs/CAMERA_STORYBOARD.md, orientation-aware pose recompute. This
 * placeholder just applies a static CameraPose so the boot scene renders
 * something sensible.
 */
import type { PerspectiveCamera } from 'three';
import type { CameraPose } from '../core';

export class CameraDirector {
  applyPose(camera: PerspectiveCamera, pose: CameraPose): void {
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }

  update(_dt: number): void {
    // TODO(owner A): run active CinematicBeat, handle Reduce Motion scaling.
  }
}
