import * as THREE from 'three';
import { CT2_KIT_PLACEMENTS } from './SouthAfricaSiteLayout.js';

const KITS = {
  plant: {
    cuts: [-.5, -.15, .24, .62],
    names: ['Acacia', 'SmallTree', 'TallTree', 'Shrub', 'Aloe'],
  },
  security: {
    cuts: [-.62, -.32, -.025, .25],
    names: ['BarbedFence', 'SlidingGate', 'Turnstile', 'GuardBooth', 'SolidFence'],
  },
};

function splitFiveParts(source, cuts) {
  const position = source.getAttribute('position');
  const sourceIndex = source.getIndex();
  const indices = Array.from({ length: 5 }, () => []);
  const bounds = Array.from({ length: 5 }, () => new THREE.Box3());
  const vertex = new THREE.Vector3();

  for (let offset = 0; offset < sourceIndex.count; offset += 3) {
    const triangle = [sourceIndex.getX(offset), sourceIndex.getX(offset + 1), sourceIndex.getX(offset + 2)];
    const x = triangle.reduce((sum, index) => sum + position.getX(index), 0) / 3;
    const part = cuts.findIndex((cut) => x < cut);
    const bucket = part < 0 ? 4 : part;
    indices[bucket].push(...triangle);
    for (const index of triangle) {
      vertex.fromBufferAttribute(position, index);
      bounds[bucket].expandByPoint(vertex);
    }
  }

  return indices.map((partIndices, index) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      geometry.setAttribute(name, attribute);
    }
    geometry.setIndex(partIndices);
    geometry.boundingBox = bounds[index];
    geometry.boundingSphere = bounds[index].getBoundingSphere(new THREE.Sphere());
    return { geometry, bounds: bounds[index] };
  });
}

export function createSouthAfricaKit(plantGltf, securityGltf) {
  const root = new THREE.Group();
  root.name = 'CT2SiteAssets';
  for (const [kind, gltf] of [['plant', plantGltf], ['security', securityGltf]]) {
    let sourceMesh;
    gltf.scene.traverse((object) => { if (!sourceMesh && object.isMesh) sourceMesh = object; });
    if (!sourceMesh) throw new Error(`CT2 ${kind} model contains no mesh.`);

    const parts = splitFiveParts(sourceMesh.geometry, KITS[kind].cuts);
    const material = sourceMesh.material.clone();
    material.side = THREE.DoubleSide;
    if (material.isMeshStandardMaterial) {
      material.metalness = kind === 'plant' ? 0 : .12;
      material.roughness = kind === 'plant' ? 1 : .78;
    }

    parts.forEach(({ geometry, bounds }, index) => {
      const placements = CT2_KIT_PLACEMENTS[kind][index];
      if (!placements.length) return;
      const instances = new THREE.InstancedMesh(geometry, material, placements.length);
      instances.name = `CT2${kind === 'plant' ? 'Plant' : 'Security'}${KITS[kind].names[index]}`;
      instances.userData.ignoreNavigation = true;
      instances.receiveShadow = true;
      instances.castShadow = false;
      const center = bounds.getCenter(new THREE.Vector3());
      const anchor = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
      const transform = new THREE.Object3D();
      const matrix = new THREE.Matrix4();
      placements.forEach(({ x, z, scale, rotation = 0, stretchX = 1 }, placementIndex) => {
        const displayScale = kind === 'plant' && index < 3 ? scale * 1.12 : scale;
        transform.position.set(x, 0, z);
        transform.rotation.set(0, rotation, 0);
        transform.scale.set(displayScale * stretchX, displayScale, displayScale);
        transform.updateMatrix();
        matrix.multiplyMatrices(transform.matrix, anchor);
        instances.setMatrixAt(placementIndex, matrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingSphere();
      root.add(instances);
    });
  }
  return root;
}
