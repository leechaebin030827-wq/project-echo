import * as THREE from 'three';

const keyOf = (position, vertex) => [0, 1, 2]
  .map((component) => Math.round(position.getComponent(vertex, component) * 1e5))
  .join(':');

export function smoothCharacterHeadNormals(mesh) {
  if (!mesh.isSkinnedMesh) return false;
  const headIndices = new Set();
  mesh.skeleton.bones.forEach((bone, index) => {
    if (/^head$/i.test(bone.name)) headIndices.add(index);
  });
  if (!headIndices.size) return false;

  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  if (!position || !normal || !skinIndex || !skinWeight) return false;

  const headWeights = new Float32Array(position.count);
  let headVertexCount = 0;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    for (let component = 0; component < 4; component += 1) {
      if (headIndices.has(skinIndex.getComponent(vertex, component))) {
        headWeights[vertex] += skinWeight.getComponent(vertex, component);
      }
    }
    if (headWeights[vertex] > 0.25) headVertexCount += 1;
  }
  if (!headVertexCount) return false;

  const smooth = new Map();
  const index = geometry.index;
  const count = index?.count ?? position.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  for (let offset = 0; offset < count; offset += 3) {
    const ia = index ? index.getX(offset) : offset;
    const ib = index ? index.getX(offset + 1) : offset + 1;
    const ic = index ? index.getX(offset + 2) : offset + 2;
    if (Math.max(headWeights[ia], headWeights[ib], headWeights[ic]) < 0.25) continue;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    faceNormal.subVectors(b, a).cross(c.sub(a));
    if (faceNormal.lengthSq() < 1e-16) continue;
    for (const vertex of [ia, ib, ic]) {
      if (headWeights[vertex] < 0.25) continue;
      const key = keyOf(position, vertex);
      if (!smooth.has(key)) smooth.set(key, new THREE.Vector3());
      smooth.get(key).add(faceNormal);
    }
  }

  const values = new Float32Array(position.count * 3);
  const authored = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    authored.fromBufferAttribute(normal, vertex);
    const shared = smooth.get(keyOf(position, vertex));
    if (shared && headWeights[vertex] > 0.25) {
      const blend = THREE.MathUtils.smoothstep(headWeights[vertex], 0.25, 0.75);
      authored.lerp(shared.clone().normalize(), blend).normalize();
    }
    authored.toArray(values, vertex * 3);
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(values, 3));
  return true;
}
