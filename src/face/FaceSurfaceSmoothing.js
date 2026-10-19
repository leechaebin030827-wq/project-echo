import * as THREE from 'three';

const positionKey = (x, y, z) => `${Math.round(x * 1e5)}:${Math.round(y * 1e5)}:${Math.round(z * 1e5)}`;

function vertexKey(position, index) {
  return positionKey(position.getX(index), position.getY(index), position.getZ(index));
}

function triangleIndices(geometry) {
  const index = geometry.index;
  const count = index?.count ?? geometry.getAttribute('position').count;
  return Array.from({ length: count }, (_, offset) => index ? index.getX(offset) : offset);
}

export function smoothFaceNormals(geometry) {
  const position = geometry.getAttribute('position');
  if (!position) return;
  const sums = new Map();
  const indices = triangleIndices(geometry);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const vertices = indices.slice(offset, offset + 3);
    a.fromBufferAttribute(position, vertices[0]);
    b.fromBufferAttribute(position, vertices[1]);
    c.fromBufferAttribute(position, vertices[2]);
    faceNormal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (faceNormal.lengthSq() < 1e-16) continue;
    for (const vertex of vertices) {
      const key = vertexKey(position, vertex);
      if (!sums.has(key)) sums.set(key, new THREE.Vector3());
      sums.get(key).add(faceNormal);
    }
  }
  const normals = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const normal = sums.get(vertexKey(position, vertex))?.clone().normalize();
    if (!normal) continue;
    normal.toArray(normals, vertex * 3);
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
}

function blendSkinInfluences(indexAttribute, weightAttribute, first, second) {
  const influences = new Map();
  for (const vertex of [first, second]) {
    for (let component = 0; component < 4; component += 1) {
      const joint = indexAttribute.getComponent(vertex, component);
      const weight = weightAttribute.getComponent(vertex, component) * 0.5;
      influences.set(joint, (influences.get(joint) ?? 0) + weight);
    }
  }
  const selected = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = selected.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  return { joints: selected.map(([joint]) => joint), weights: selected.map(([, weight]) => weight / total) };
}

export function subdivideFaceSurface(source) {
  const position = source.getAttribute('position');
  const uv1 = source.getAttribute('uv1');
  if (!position || !uv1 || Object.keys(source.morphAttributes).length) return source;
  const indices = triangleIndices(source);
  if (indices.length < 3 || indices.length % 3) return source;

  const edgeCounts = new Map();
  const edges = new Map();
  const edgeKey = (first, second) => first < second ? `${first}:${second}` : `${second}:${first}`;
  const physicalEdgeKey = (first, second) => {
    const a = vertexKey(position, first);
    const b = vertexKey(position, second);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  for (let offset = 0; offset < indices.length; offset += 3) {
    const [a, b, c] = indices.slice(offset, offset + 3);
    for (const [first, second] of [[a, b], [b, c], [c, a]]) {
      const physicalKey = physicalEdgeKey(first, second);
      edgeCounts.set(physicalKey, (edgeCounts.get(physicalKey) ?? 0) + 1);
      edges.set(edgeKey(first, second), [first, second, physicalKey]);
    }
  }

  const sourceNormals = source.clone();
  smoothFaceNormals(sourceNormals);
  const smoothNormal = sourceNormals.getAttribute('normal');
  const vertexCount = position.count + edges.size;
  const attributes = {};
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (name === 'normal') continue;
    const array = name === 'skinIndex'
      ? new Uint16Array(vertexCount * attribute.itemSize)
      : new Float32Array(vertexCount * attribute.itemSize);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      for (let component = 0; component < attribute.itemSize; component += 1) {
        array[vertex * attribute.itemSize + component] = attribute.getComponent(vertex, component);
      }
    }
    attributes[name] = { array, itemSize: attribute.itemSize };
  }

  const firstPosition = new THREE.Vector3();
  const secondPosition = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const normalA = new THREE.Vector3();
  const normalB = new THREE.Vector3();
  const correction = new THREE.Vector3();
  const midpointIndices = new Map();
  let nextVertex = position.count;
  for (const [key, [first, second, physicalKey]] of edges) {
    const target = nextVertex++;
    midpointIndices.set(key, target);
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (name === 'normal' || name === 'skinIndex' || name === 'skinWeight') continue;
      const { array, itemSize } = attributes[name];
      for (let component = 0; component < itemSize; component += 1) {
        array[target * itemSize + component] = (
          attribute.getComponent(first, component) + attribute.getComponent(second, component)
        ) * 0.5;
      }
    }
    if (attributes.skinIndex && attributes.skinWeight) {
      const skin = blendSkinInfluences(
        source.getAttribute('skinIndex'), source.getAttribute('skinWeight'), first, second,
      );
      for (let component = 0; component < 4; component += 1) {
        attributes.skinIndex.array[target * 4 + component] = skin.joints[component] ?? 0;
        attributes.skinWeight.array[target * 4 + component] = skin.weights[component] ?? 0;
      }
    }
    if ((edgeCounts.get(physicalKey) ?? 0) < 2) continue;
    firstPosition.fromBufferAttribute(position, first);
    secondPosition.fromBufferAttribute(position, second);
    midpoint.copy(firstPosition).add(secondPosition).multiplyScalar(0.5);
    normalA.fromBufferAttribute(smoothNormal, first);
    normalB.fromBufferAttribute(smoothNormal, second);
    correction.copy(normalA).multiplyScalar(-midpoint.clone().sub(firstPosition).dot(normalA))
      .addScaledVector(normalB, -midpoint.clone().sub(secondPosition).dot(normalB))
      .multiplyScalar(0.5);
    correction.clampLength(0, firstPosition.distanceTo(secondPosition) * 0.12);
    const u = attributes.uv1.array[target * 2];
    const v = attributes.uv1.array[target * 2 + 1];
    const nose = Math.exp(-1.6 * (((u - 0.5) / 0.16) ** 2 + ((v - 0.55) / 0.22) ** 2));
    const strength = 0.68 - nose * 0.43;
    const positions = attributes.position.array;
    positions[target * 3] += correction.x * strength;
    positions[target * 3 + 1] += correction.y * strength;
    positions[target * 3 + 2] += correction.z * strength;
  }

  const subdividedIndices = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const [a, b, c] = indices.slice(offset, offset + 3);
    const ab = midpointIndices.get(edgeKey(a, b));
    const bc = midpointIndices.get(edgeKey(b, c));
    const ca = midpointIndices.get(edgeKey(c, a));
    subdividedIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = `${source.name || 'face'}-smooth`;
  geometry.setIndex(subdividedIndices);
  for (const [name, { array, itemSize }] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  if (source.groups.length === 1) {
    geometry.addGroup(0, subdividedIndices.length, source.groups[0].materialIndex);
  }
  geometry.userData = { ...source.userData };
  smoothFaceNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  sourceNormals.dispose();
  return geometry;
}
