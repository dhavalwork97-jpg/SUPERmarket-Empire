import * as THREE from "three";

/**
 * Draws many copies of one fixture node from fixtures.glb with one draw call per primitive (a shelf is 3, a fridge door is 3, ...), no matter how many
 * aisles use it. Geometry and materials are the loaded GLB's own, so there is nothing to dispose except the InstancedMesh wrapper.
 */
export class Instanced {
  readonly meshes: THREE.InstancedMesh[] = [];
  constructor(parent: THREE.Object3D, src: THREE.Object3D, readonly cap: number) {
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const im = new THREE.InstancedMesh(m.geometry, m.material, cap); im.count = 0; im.frustumCulled = false; im.userData.shared = true;
      im.userData.local = src === o ? new THREE.Matrix4() : new THREE.Matrix4().copy(m.matrixWorld);
      parent.add(im); this.meshes.push(im);
    });
  }
  set(mats: THREE.Matrix4[]) {
    const n = Math.min(mats.length, this.cap), tmp = new THREE.Matrix4();
    for (const im of this.meshes) { for (let i = 0; i < n; i++) im.setMatrixAt(i, tmp.multiplyMatrices(mats[i], im.userData.local)); im.count = n; im.instanceMatrix.needsUpdate = true; }
  }
  dispose(parent: THREE.Object3D) { for (const im of this.meshes) { parent.remove(im); im.dispose(); } this.meshes.length = 0; }
}

/** One draw call for every axis-aligned coloured box of one material (accent strips, gold posts, end panels, glass guards). */
export class BoxBatch {
  readonly mesh: THREE.InstancedMesh; private n = 0; private tmp = new THREE.Object3D(); private c = new THREE.Color();
  constructor(parent: THREE.Object3D, material: THREE.Material, readonly cap = 512) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, cap); this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); parent.add(this.mesh);
  }
  clear() { this.n = 0; }
  /** box with its bottom-centre at (x, y, z) */
  add(w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
    if (this.n >= this.cap) return; const t = this.tmp; t.position.set(x, y + h / 2, z); t.scale.set(w, h, d); t.rotation.set(0, 0, 0); t.updateMatrix();
    this.mesh.setMatrixAt(this.n, t.matrix); this.c.setHex(color); this.mesh.setColorAt(this.n, this.c); this.n++;
  }
  flush() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}
