import * as THREE from 'three';
import { CT2_SITE_LAYOUT } from './SouthAfricaSiteLayout.js';

const point3 = ([x, z]) => new THREE.Vector3(x, 0, z);

function path(points, closed = false) {
  return new THREE.CatmullRomCurve3(points.map(point3), closed, 'centripetal');
}

function roadStrip(curve, from, to, y, segments) {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const sideX = -tangent.z;
    const sideZ = tangent.x;
    for (const [edge, offset] of [from, to].entries()) {
      const base = (index * 2 + edge) * 3;
      positions[base] = center.x + sideX * offset;
      positions[base + 1] = y;
      positions[base + 2] = center.z + sideZ * offset;
    }
    if (index < segments) {
      const a = index * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addStrip(root, curve, from, to, y, segments, material, name) {
  const mesh = new THREE.Mesh(roadStrip(curve, from, to, y, segments), material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.userData.ignoreNavigation = true;
  root.add(mesh);
  return mesh;
}

function addRoad(root, name, curve, width, segments, asphalt, concrete,
  { y = .08, curb = false } = {}) {
  // Edge bands are separate from the asphalt, not a second coplanar slab below it.
  // The large far plane otherwise loses depth precision and shows square patches.
  addStrip(root, curve, -width / 2 - .36, -width / 2,
    y - .028, segments, concrete, `${name}LeftShoulder`);
  addStrip(root, curve, width / 2, width / 2 + .36,
    y - .028, segments, concrete, `${name}RightShoulder`);
  addStrip(root, curve, -width / 2, width / 2,
    y, segments, asphalt, `${name}Pavement`);
  if (curb) {
    addStrip(root, curve, -width / 2 - .19, -width / 2 - .015,
      y + .025, segments, concrete, `${name}LeftCurb`);
    addStrip(root, curve, width / 2 + .015, width / 2 + .19,
      y + .025, segments, concrete, `${name}RightCurb`);
  }
}

function addPaint(markings, x, z, width, length, y = .11, angle = 0) {
  markings.push({ x, z, width, length, y, angle });
}

function addPaintInstances(root, markings, material) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material,
    markings.length);
  mesh.name = 'CT2RoadMarkings';
  mesh.userData.ignoreNavigation = true;
  const transform = new THREE.Object3D();
  markings.forEach(({ x, z, width, length, y, angle }, index) => {
    transform.position.set(x, y, z);
    transform.rotation.set(-Math.PI * .5, 0, -angle);
    transform.scale.set(width, length, 1);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  root.add(mesh);
}

function addCenterDashes(root, curve, count, paint) {
  const geometry = new THREE.BoxGeometry(.105, .008, 2.8);
  const marks = new THREE.InstancedMesh(geometry, paint, count);
  marks.name = 'CT2EntranceCenterDashes';
  marks.userData.ignoreNavigation = true;
  const transform = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const t = .035 + (index + .5) / count * .87;
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    transform.position.set(position.x, .114, position.z);
    transform.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
    transform.updateMatrix();
    marks.setMatrixAt(index, transform.matrix);
  }
  marks.instanceMatrix.needsUpdate = true;
  root.add(marks);
}

function addParking(root, asphalt, concrete, markings) {
  const lot = CT2_SITE_LAYOUT.parking;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(lot.width, .12, lot.length), asphalt);
  slab.name = 'CT2ParkingPavement';
  slab.position.set(lot.x, .01, lot.z);
  slab.receiveShadow = true;
  slab.userData.ignoreNavigation = true;
  root.add(slab);

  const curbGeometry = new THREE.BoxGeometry(.18, .15, lot.length);
  for (const x of [lot.x - lot.width / 2, lot.x + lot.width / 2]) {
    const curb = new THREE.Mesh(curbGeometry, concrete);
    curb.name = 'CT2ParkingCurb';
    curb.position.set(x, .105, lot.z);
    curb.userData.ignoreNavigation = true;
    root.add(curb);
  }
  for (const z of [lot.z - lot.length / 2, lot.z + lot.length / 2]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(lot.width, .15, .18), concrete);
    curb.name = 'CT2ParkingCurb';
    curb.position.set(lot.x, .105, z);
    curb.userData.ignoreNavigation = true;
    root.add(curb);
  }

  // Two short rows of bays flank a clear central aisle. The east curb has a
  // small driveway overlap, so the parking branch can enter without a gap.
  for (const z of [9, 14.2, 19.4, 24.6, 29.8]) {
    for (const x of [-49.5, -34.5]) addPaint(markings, x, z, 8.5, .09, .077);
  }
  addPaint(markings, -42, 7.5, .12, 20, .077, Math.PI / 2);
  for (const x of [-49.5, -34.5]) addPaint(markings, x, 20, .12, 20, .077, Math.PI / 2);

  const walkway = new THREE.Mesh(new THREE.BoxGeometry(2.2, .13, 35), concrete);
  walkway.name = 'CT2ParkingPedestrianPath';
  walkway.position.set(-24, .065, 5);
  walkway.receiveShadow = true;
  walkway.userData.ignoreNavigation = true;
  root.add(walkway);
}

function addFacilityWalkways(root, concrete) {
  const sections = [
    { x: -29, z: -28, width: 33, length: 1.8 },
    { x: 29, z: -28, width: 33, length: 1.8 },
    { x: -48, z: -82, width: 1.8, length: 94 },
    { x: 48, z: -82, width: 1.8, length: 94 },
  ];
  for (const section of sections) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(section.width, .12, section.length), concrete,
    );
    mesh.name = 'CT2RaisedPedestrianWalkway';
    mesh.position.set(section.x, .095, section.z);
    mesh.receiveShadow = true;
    mesh.userData.ignoreNavigation = true;
    root.add(mesh);
  }
  const bollardMaterial = new THREE.MeshStandardMaterial({ color: '#6e7772', roughness: .73, metalness: .22 });
  const bollards = new THREE.InstancedMesh(new THREE.CylinderGeometry(.105, .13, .86, 6),
    bollardMaterial, 20);
  bollards.name = 'CT2ServiceBollards';
  bollards.userData.ignoreNavigation = true;
  const transform = new THREE.Object3D();
  let index = 0;
  for (const x of [-48, 48]) for (const z of [-38, -49, -60, -71, -82, -93, -104, -115, -126, -132]) {
    transform.position.set(x, .55, z);
    transform.updateMatrix();
    bollards.setMatrixAt(index++, transform.matrix);
  }
  bollards.instanceMatrix.needsUpdate = true;
  root.add(bollards);
}

function addDropOffIsland(root, earth, concrete) {
  const { radiusX, radiusZ } = CT2_SITE_LAYOUT.dropOff;
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, radiusX - 3.9, radiusZ - 3.9,
    0, Math.PI * 2, false, 0);
  const geometry = new THREE.ShapeGeometry(shape, 48);
  const island = new THREE.Mesh(geometry, earth);
  island.name = 'CT2DropOffPlantedIsland';
  island.rotation.x = -Math.PI * .5;
  island.position.y = .09;
  island.receiveShadow = true;
  island.userData.ignoreNavigation = true;
  root.add(island);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(radiusX - 4.0, .08, 4, 64), concrete);
  edge.name = 'CT2DropOffIslandEdging';
  edge.rotation.x = -Math.PI * .5;
  edge.scale.y = (radiusZ - 4.0) / (radiusX - 4.0);
  edge.position.y = .105;
  edge.userData.ignoreNavigation = true;
  root.add(edge);
}

function addGateDetails(root, asphalt, paint, markings) {
  // Short connector links the drop-off loop to the guard gate and frontage road.
  const gateCurve = path([[0, -10], [0, -17], [0, -24]]);
  addRoad(root, 'CT2GateConnector', gateCurve, 6.4, 16, asphalt, paint, { y: .105 });
  for (const x of [-2, -1, 0, 1, 2]) addPaint(markings, x, -15.5, .45, 2.2, .135);
  addPaint(markings, 0, -21.4, 6.0, .22, .135);
  const bump = new THREE.Mesh(new THREE.BoxGeometry(6.1, .075, .72), asphalt);
  bump.name = 'CT2SpeedBump';
  bump.position.set(0, .145, -19.2);
  bump.userData.ignoreNavigation = true;
  root.add(bump);
}

export function createSouthAfricaRoads(root, materials) {
  const { asphalt, concrete, earth } = materials;
  const roadEdge = new THREE.MeshStandardMaterial({ color: '#858983', roughness: 1 });
  const paint = new THREE.MeshBasicMaterial({ color: '#d8d6c9', depthWrite: false });
  const white = new THREE.MeshBasicMaterial({ color: '#d8d6c9', transparent: true, opacity: .82, depthWrite: false });
  const markings = [];
  const entrance = path(CT2_SITE_LAYOUT.entrance.points);
  addRoad(root, 'CT2CurvedEntrance', entrance, CT2_SITE_LAYOUT.entrance.width,
    96, asphalt, roadEdge);
  const vergeOffset = CT2_SITE_LAYOUT.entrance.width / 2 + .55;
  for (const side of [-1, 1]) {
    const from = side < 0 ? -vergeOffset - 2.5 : vergeOffset;
    const to = side < 0 ? -vergeOffset : vergeOffset + 2.5;
    addStrip(root, entrance, from, to, -.015, 96, materials.vegetation, 'CT2EntrancePlantedVerge');
  }
  addCenterDashes(root, entrance, 17, paint);

  const { radiusX, radiusZ } = CT2_SITE_LAYOUT.dropOff;
  const loopPoints = Array.from({ length: 32 }, (_, index) => {
    const angle = index / 32 * Math.PI * 2;
    return [Math.cos(angle) * radiusX, Math.sin(angle) * radiusZ];
  });
  const dropOff = path(loopPoints, true);
  addRoad(root, 'CT2DropOffLoop', dropOff, CT2_SITE_LAYOUT.dropOff.width,
    128, asphalt, roadEdge, { y: .09, curb: true });
  addDropOffIsland(root, earth, concrete);

  const s = CT2_SITE_LAYOUT.service;
  const service = path([
    [-s.halfX + s.cornerRadius, s.frontZ], [s.halfX - s.cornerRadius, s.frontZ],
    [s.halfX, s.frontZ - s.cornerRadius], [s.halfX, s.rearZ + s.cornerRadius],
    [s.halfX - s.cornerRadius, s.rearZ], [-s.halfX + s.cornerRadius, s.rearZ],
    [-s.halfX, s.rearZ + s.cornerRadius], [-s.halfX, s.frontZ - s.cornerRadius],
  ], true);
  addRoad(root, 'CT2RoundedServiceLoop', service, s.width,
    144, asphalt, roadEdge, { y: .075 });

  const parkingEntry = path(CT2_SITE_LAYOUT.parkingEntry.points);
  addRoad(root, 'CT2ParkingEntry', parkingEntry, CT2_SITE_LAYOUT.parkingEntry.width,
    24, asphalt, roadEdge, { y: .085 });
  addParking(root, asphalt, concrete, markings);
  addGateDetails(root, asphalt, roadEdge, markings);
  addPaintInstances(root, markings, white);
  addFacilityWalkways(root, concrete);
  return { entrance, dropOff, service, parkingEntry };
}
