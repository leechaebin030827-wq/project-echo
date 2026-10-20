import * as THREE from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { deinterleaveGeometry } from 'three/addons/utils/BufferGeometryUtils.js';

const scales = [0.6, 0.8, 1.2, 1.4];
const treeSize = 0.5;
const tileSize = 56;
const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const edge0 = new THREE.Vector3();
const edge1 = new THREE.Vector3();
const normal = new THREE.Vector3();

function randomGenerator() {
  let seed = 1018;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function createWindMaterials(sourceMaterial, geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const uniforms = {
    time: { value: 0 },
    strength: { value: 0 },
  };
  const configure = (source) => {
    const material = source.clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.forestWindTime = uniforms.time;
      shader.uniforms.forestWindStrength = uniforms.strength;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float forestWindTime;\nuniform float forestWindStrength;`)
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float forestHeight = clamp((position.y - ${box.min.y.toFixed(5)}) / ${Math.max(0.001, box.max.y - box.min.y).toFixed(5)}, 0.0, 1.0);
          float forestPhase = forestWindTime * 2.15 + instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.11;
          float forestBend = sin(forestPhase) * 0.7 + sin(forestPhase * 1.83 + 1.4) * 0.3;
          float forestWeight = pow(forestHeight, 1.65) * forestWindStrength;
          transformed.x += forestBend * forestWeight * ${(box.max.y - box.min.y) * 0.045};
          transformed.z += cos(forestPhase * 0.82) * forestWeight * ${(box.max.y - box.min.y) * 0.025};
        `);
    };
    material.customProgramCacheKey = () => 'hamina-forest-wind-v1';
    material.needsUpdate = true;
    return material;
  };
  const material = Array.isArray(sourceMaterial) ? sourceMaterial.map(configure) : configure(sourceMaterial);
  return { material, uniforms };
}

export function populateHaminaForest(root, echoCenter, focusBounds) {
  const random = randomGenerator();
  const trees = ['Tree1', 'Tree2'].map((name) => root.getObjectByName(name));
  if (trees.some((tree) => !tree?.isMesh)) throw new Error('Hamina tree sources are missing.');
  const modifier = new SimplifyModifier();
  const simplifyTrees = (removalRatio) => trees.map((tree) => {
    // Meshopt uses interleaved attributes. SimplifyModifier expects ordinary
    // BufferAttributes, so detach them once for the distant-tree source.
    const source = tree.geometry.clone();
    deinterleaveGeometry(source);
    const count = source.getAttribute('position').count;
    const geometry = modifier.modify(source, Math.floor(count * removalRatio));
    source.dispose();
    geometry.computeBoundingSphere();
    return geometry;
  });
  // Keep the authored density while reducing the per-tree triangle cost.
  // Focus trees retain full detail for the wind interaction.
  const mainGeometry = simplifyTrees(0.68);
  const outerGeometry = simplifyTrees(0.88);
  const placements = new Map();
  const occupied = new Map();
  const cellSize = 1.6;
  for (const [terrainIndex, name] of ['Main_Base', 'Outer'].entries()) {
    const terrain = root.getObjectByName(name) ?? root.getObjectByName(name.replace('_', ' '));
    const forestMeshes = [];
    terrain?.traverse((mesh) => {
      if (mesh.isMesh && (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        .some((material) => material?.name === 'Forest')) forestMeshes.push(mesh);
    });
    const triangles = [];
    let totalArea = 0;
    for (const mesh of forestMeshes) {
      const positions = mesh.geometry.getAttribute('position');
      const indices = mesh.geometry.index;
      const count = indices?.count ?? positions.count;
      for (let i = 0; i < count; i += 3) {
        v0.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(mesh.matrixWorld);
        v1.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
        v2.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
        edge0.subVectors(v1, v0);
        edge1.subVectors(v2, v0);
        normal.crossVectors(edge0, edge1);
        const area = normal.length() / 2;
        if (area < 0.02 || Math.abs(normal.y) < area * 1.44) continue;
        totalArea += area;
        triangles.push({ a: v0.clone(), b: v1.clone(), c: v2.clone(), end: totalArea });
      }
    }
    if (!triangles.length) throw new Error(`Hamina ${name} Forest surface is missing.`);
    const target = terrainIndex === 0 ? 1200 : 5200;
    const minimumDistance = terrainIndex === 0 ? 1.55 : 1.25;
    let made = 0;
    for (let attempt = 0; attempt < target * 18 && made < target; attempt += 1) {
      const pick = random() * totalArea;
      let low = 0;
      let high = triangles.length - 1;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (triangles[mid].end < pick) low = mid + 1;
        else high = mid;
      }
      const { a, b, c } = triangles[low];
      const u = Math.sqrt(random());
      const v = random();
      const position = a.clone().multiplyScalar(1 - u)
        .addScaledVector(b, u * (1 - v)).addScaledVector(c, u * v);
      if (position.y < -3.5 || position.y > 26
        || Math.hypot(position.x - echoCenter.x, position.z - echoCenter.z) < 18) continue;
      const cx = Math.floor(position.x / cellSize);
      const cz = Math.floor(position.z / cellSize);
      let close = false;
      for (let dx = -1; dx <= 1 && !close; dx += 1) {
        for (let dz = -1; dz <= 1 && !close; dz += 1) {
          for (const nearby of occupied.get(`${cx + dx},${cz + dz}`) ?? []) {
            if (Math.hypot(nearby.x - position.x, nearby.z - position.z) < minimumDistance) close = true;
          }
        }
      }
      if (close) continue;
      const key = `${cx},${cz}`;
      if (!occupied.has(key)) occupied.set(key, []);
      occupied.get(key).push(position);
      const type = random() < 0.5 ? 0 : 1;
      const tileX = Math.floor(position.x / tileSize);
      const tileZ = Math.floor(position.z / tileSize);
      const forestFocus = terrainIndex === 0 && focusBounds
        && position.x >= focusBounds.min.x && position.x <= focusBounds.max.x
        && position.z >= focusBounds.min.z && position.z <= focusBounds.max.z;
      const tileKey = `${terrainIndex}:${type}:${tileX}:${tileZ}:${forestFocus ? 1 : 0}`;
      if (!placements.has(tileKey)) placements.set(tileKey, {
        terrainIndex, type, forestFocus, entries: [],
      });
      placements.get(tileKey).entries.push({
        position, scale: scales[Math.floor(random() * scales.length)],
        rotation: random() * Math.PI * 2,
      });
      made += 1;
    }
  }
  const dummy = new THREE.Object3D();
  const instances = [];
  for (const [tileKey, { terrainIndex, type, forestFocus, entries }] of placements) {
    const source = trees[type];
    const geometry = forestFocus ? source.geometry
      : terrainIndex === 0 ? mainGeometry[type] : outerGeometry[type];
    // Every tree participates in the mountain hover. Focus trees keep their
    // full geometry, while distant tiles use simplified geometry with the
    // same lightweight wind shader.
    const wind = createWindMaterials(source.material, geometry);
    const instance = new THREE.InstancedMesh(geometry, wind.material, entries.length);
    instance.name = `HaminaForest_${source.name}_${tileKey.replaceAll(':', '_')}`;
    instance.userData.ignoreNavigation = true;
    instance.userData.terrain = terrainIndex === 0 ? 'Main_Base' : 'Outer';
    instance.userData.forestFocus = forestFocus;
    instance.userData.windUniforms = wind.uniforms;
    instance.layers.set(1); // The sea mirror renders layer 0; distant trees stay out of its reflection pass.
    instance.castShadow = false;
    instance.receiveShadow = true;
    entries.forEach(({ position, scale, rotation }, index) => {
      dummy.position.copy(position);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.copy(source.scale).multiplyScalar(scale * treeSize);
      dummy.updateMatrix();
      instance.setMatrixAt(index, dummy.matrix);
    });
    instance.instanceMatrix.needsUpdate = true;
    instance.computeBoundingSphere();
    root.add(instance);
    instances.push(instance);
  }
  for (const source of trees) source.visible = false;
  return instances;
}
