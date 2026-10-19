import * as THREE from 'three';

// Meshes using the exported Light material are the actual emitters. Their
// parent pole bounds also include the long stem, which puts a point light in
// the wrong place.
export class FixtureLights {
  constructor(scene, lightMeshes, { color, intensity, distance, maxLights, focus }) {
    const bounds = new THREE.Box3();
    const vertex = new THREE.Vector3();
    this.sources = [...new Set(lightMeshes)].map((mesh) => {
      bounds.makeEmpty();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const position = mesh.geometry?.attributes.position;
      if (!position) return null;
      const indices = mesh.geometry.index;
      const groups = mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: indices?.count ?? position.count, materialIndex: 0 }];
      for (const group of groups) {
        if (!/^Light(?:\.|$)/i.test(materials[group.materialIndex ?? 0]?.name ?? '')) continue;
        for (let offset = group.start; offset < group.start + group.count; offset += 1) {
          vertex.fromBufferAttribute(position, indices ? indices.getX(offset) : offset)
            .applyMatrix4(mesh.matrixWorld);
          bounds.expandByPoint(vertex);
        }
      }
      return bounds.isEmpty() ? null : bounds.getCenter(new THREE.Vector3());
    }).filter(Boolean);
    this.lights = Array.from({ length: Math.min(maxLights, this.sources.length) }, () => {
      const light = new THREE.PointLight(color, intensity, distance, 2);
      scene.add(light);
      return light;
    });
    this.selected = [];
    this.update(focus);
  }

  update(cameraPosition) {
    if (!cameraPosition || !this.lights.length) return;
    const selected = this.sources
      .map((position, index) => ({ index, distance: position.distanceToSquared(cameraPosition) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.lights.length)
      .map(({ index }) => index);
    if (selected.every((index, slot) => index === this.selected[slot])) return;
    this.selected = selected;
    for (let slot = 0; slot < selected.length; slot += 1) {
      this.lights[slot].position.copy(this.sources[selected[slot]]);
    }
  }
}
