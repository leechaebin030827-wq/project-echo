import * as THREE from 'three';

const GRASS_NAMES = ['Dry_Grass_A', 'Dry_Grass_A.001', 'Dry_Grass_A.002'];
const SHRUB_NAMES = ['Sagebrush_A', 'Sagebrush_A.001', 'Sagebrush_B'];
const findSource = (root, name) => root.getObjectByName(name)
  ?? root.getObjectByName(name.replaceAll('.', ''));

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export class NevadaGrass {
  constructor(root) {
    this.root = root;
    this.group = new THREE.Group();
    this.group.name = 'NevadaGrass';
    this.group.userData.ignoreNavigation = true;
    this.random = randomGenerator(0x1017a55);
  }

  collectLandTriangles() {
    const triangles = [];
    let totalArea = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    const cross = new THREE.Vector3();
    this.root.updateMatrixWorld(true);
    this.root.traverse((mesh) => {
      if (!mesh.isMesh || mesh.name === "Base_Save_Don'tShow") return;
      const geometry = mesh.geometry;
      const position = geometry?.attributes.position;
      if (!position) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = geometry.groups.length ? geometry.groups : [{
        start: 0,
        count: geometry.index?.count ?? position.count,
        materialIndex: 0,
      }];
      for (const group of groups) {
        if (materials[group.materialIndex ?? 0]?.name?.toLowerCase() !== 'land') continue;
        const indices = geometry.index?.array;
        const end = group.start + group.count;
        for (let offset = group.start; offset + 2 < end; offset += 3) {
          a.fromBufferAttribute(position, indices ? indices[offset] : offset).applyMatrix4(mesh.matrixWorld);
          b.fromBufferAttribute(position, indices ? indices[offset + 1] : offset + 1).applyMatrix4(mesh.matrixWorld);
          c.fromBufferAttribute(position, indices ? indices[offset + 2] : offset + 2).applyMatrix4(mesh.matrixWorld);
          edgeA.subVectors(b, a);
          edgeB.subVectors(c, a);
          cross.crossVectors(edgeA, edgeB);
          const area = cross.length() * 0.5;
          if (area < 0.002 || Math.abs(cross.y) / (2 * area) < 0.75) continue;
          totalArea += area;
          triangles.push({ a: a.clone(), b: b.clone(), c: c.clone(), endArea: totalArea });
        }
      }
    });
    return { triangles, totalArea };
  }

  sampleSurface(surface) {
    const target = this.random() * surface.totalArea;
    let low = 0;
    let high = surface.triangles.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (surface.triangles[middle].endArea < target) low = middle + 1;
      else high = middle;
    }
    const { a, b, c } = surface.triangles[low];
    const u = Math.sqrt(this.random());
    const v = this.random();
    return new THREE.Vector3()
      .addScaledVector(a, 1 - u)
      .addScaledVector(b, u * (1 - v))
      .addScaledVector(c, u * v);
  }

  populate() {
    const surface = this.collectLandTriangles();
    if (!surface.triangles.length) {
      console.warn('[Nevada] Land surface not found for grass');
      return;
    }
    const kinds = [
      { names: GRASS_NAMES, count: Math.min(360, Math.round(surface.totalArea * 0.24)) },
      { names: SHRUB_NAMES, count: Math.min(36, Math.round(surface.totalArea * 0.018)) },
    ];
    const dummy = new THREE.Object3D();
    let total = 0;
    for (const { names, count } of kinds) {
      const sources = names.map((name) => findSource(this.root, name)).filter((mesh) => mesh?.isMesh);
      if (!sources.length) continue;
      for (const source of sources) {
        const instances = Math.floor(count / sources.length)
          + (sources.indexOf(source) < count % sources.length ? 1 : 0);
        if (!instances) continue;
        const instanced = new THREE.InstancedMesh(source.geometry, source.material, instances);
        instanced.name = `Scattered_${source.name}`;
        instanced.castShadow = false;
        instanced.receiveShadow = true;
        instanced.userData.ignoreNavigation = true;
        for (let index = 0; index < instances; index += 1) {
          dummy.position.copy(this.sampleSurface(surface));
          dummy.position.y += 0.015;
          dummy.rotation.set(0, this.random() * Math.PI * 2, 0);
          dummy.scale.copy(source.scale).multiplyScalar(0.72 + this.random() * 0.55);
          dummy.updateMatrix();
          instanced.setMatrixAt(index, dummy.matrix);
        }
        instanced.instanceMatrix.needsUpdate = true;
        instanced.computeBoundingSphere();
        this.group.add(instanced);
        total += instances;
      }
    }
    this.root.add(this.group);
    console.info(`[Nevada] ${total} grass and sagebrush instances on Land (${Math.round(surface.totalArea)} m²)`);
  }

  dispose() {
    this.group.removeFromParent();
    for (const instance of this.group.children) instance.dispose();
    this.group.clear(); // Geometry and materials belong to the GLB source meshes.
  }
}
