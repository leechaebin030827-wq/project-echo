import * as THREE from 'three';

const SOURCE_WEIGHTS = [
  ['Rock1', 10],
  ['Rock2', 10],
  ['Snow1', 14],
  ['Snow2', 14],
  ['Snow3', 14],
];

export const HAMINA_LAND_INSTANCE_SOURCE_NAMES = new Set(
  SOURCE_WEIGHTS.map(([name]) => name),
);

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();
const faceNormal = new THREE.Vector3();

function seededRandom() {
  let seed = 0x1018cafe;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function collectLandTriangles(landMeshes) {
  const triangles = [];
  let totalArea = 0;
  for (const mesh of landMeshes) {
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.index;
    const count = indices?.count ?? positions.count;
    for (let index = 0; index < count; index += 3) {
      a.fromBufferAttribute(positions, indices ? indices.getX(index) : index).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(positions, indices ? indices.getX(index + 1) : index + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(positions, indices ? indices.getX(index + 2) : index + 2).applyMatrix4(mesh.matrixWorld);
      faceNormal.crossVectors(edgeA.subVectors(b, a), edgeB.subVectors(c, a));
      const area = faceNormal.length() * 0.5;
      if (area < 0.04 || faceNormal.y < area * 1.72) continue;
      totalArea += area;
      triangles.push({ a: a.clone(), b: b.clone(), c: c.clone(), end: totalArea });
    }
  }
  return { triangles, totalArea };
}

function sampleSurface(random, triangles, totalArea, target) {
  const pick = random() * totalArea;
  let low = 0;
  let high = triangles.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (triangles[middle].end < pick) low = middle + 1;
    else high = middle;
  }
  const triangle = triangles[low];
  const u = Math.sqrt(random());
  const v = random();
  return target.copy(triangle.a).multiplyScalar(1 - u)
    .addScaledVector(triangle.b, u * (1 - v))
    .addScaledVector(triangle.c, u * v);
}

export function populateHaminaLandInstances(root, landMeshes, exclusionBounds = []) {
  const random = seededRandom();
  const { triangles, totalArea } = collectLandTriangles(landMeshes);
  if (!triangles.length) throw new Error('Hamina Land surface has no usable triangles for instances.');

  const point = new THREE.Vector3();
  const placements = SOURCE_WEIGHTS.map(([name, target]) => ({
    source: root.getObjectByName(name), target, entries: [], parts: [],
  }));
  if (placements.some(({ source }) => !source || !source.getObjectByProperty('isMesh', true))) {
    throw new Error('Hamina land_instance source meshes are missing.');
  }

  for (const placement of placements) {
    const { source } = placement;
    source.updateWorldMatrix(true, true);
    const inverseSource = source.matrixWorld.clone().invert();
    placement.localBounds = new THREE.Box3().makeEmpty();
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      const relative = inverseSource.clone().multiply(mesh.matrixWorld);
      placement.localBounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(relative));
      placement.parts.push({ mesh, relative });
    });
    // These authored nodes are templates for the runtime InstancedMeshes.
    // Keep their geometry/material references alive, but do not render the
    // single source objects in their original staging positions.
    source.visible = false;
  }

  const dummy = new THREE.Object3D();
  const occupiedBounds = [];
  for (const placement of placements) {
    for (let attempt = 0; attempt < placement.target * 240
      && placement.entries.length < placement.target; attempt += 1) {
      sampleSurface(random, triangles, totalArea, point);
      if (Math.hypot(point.x, point.z) < 9.5) continue;
      if (exclusionBounds.some((bounds) => bounds.containsPoint(point))) continue;
      const rotation = random() * Math.PI * 2;
      const snowSource = /^Snow/.test(placement.source.name);
      const scale = snowSource ? 0.72 + random() * 0.32 : 0.78 + random() * 0.38;
      dummy.position.copy(point);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.copy(placement.source.scale).multiplyScalar(scale);
      dummy.position.y -= placement.localBounds.min.y * dummy.scale.y;
      dummy.updateMatrix();
      const candidateBounds = placement.localBounds.clone().applyMatrix4(dummy.matrix)
        .expandByScalar(0.35);
      if (exclusionBounds.some((bounds) => bounds.intersectsBox(candidateBounds))) continue;
      if (occupiedBounds.some((bounds) => bounds.intersectsBox(candidateBounds))) continue;
      placement.entries.push({ matrix: dummy.matrix.clone() });
      occupiedBounds.push(candidateBounds);
    }
  }

  const instances = [];
  const bySource = {};
  for (const { source, entries, parts } of placements) {
    if (!entries.length) continue;
    bySource[source.name] = entries.length;
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const { mesh, relative } = parts[partIndex];
      const instance = new THREE.InstancedMesh(mesh.geometry, mesh.material, entries.length);
      instance.name = `HaminaLandInstance_${source.name}_${partIndex}`;
      instance.userData.ignoreNavigation = true;
      instance.castShadow = false;
      instance.receiveShadow = true;
      for (let index = 0; index < entries.length; index += 1) {
        instance.setMatrixAt(index, entries[index].matrix.clone().multiply(relative));
      }
      instance.instanceMatrix.needsUpdate = true;
      instance.computeBoundingSphere();
      root.add(instance);
      instances.push(instance);
    }
  }
  instances.summary = {
    requested: SOURCE_WEIGHTS.reduce((sum, [, count]) => sum + count, 0),
    placed: Object.values(bySource).reduce((sum, count) => sum + count, 0),
    bySource,
    hiddenSourceCount: placements.filter(({ source }) => source.visible === false).length,
    surfaceMeshCount: landMeshes.length,
    surfaceTriangleCount: triangles.length,
  };
  return instances;
}
