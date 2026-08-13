// object3Dツリーを走査してgeometry/material/textureを全解放するユーティリティ。WorldApi.dispose()から使用。
import * as THREE from "three";

function disposeMaterial(material: THREE.Material): void {
  const mat = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(mat)) {
    const value = mat[key];
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = (obj as THREE.Mesh).material;
    if (material) {
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
      } else {
        disposeMaterial(material);
      }
    }
  });
  root.parent?.remove(root);
}
