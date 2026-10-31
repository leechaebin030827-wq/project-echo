import * as THREE from 'three';
import { CT2_DISTRICT_LAMPS } from './SouthAfricaSiteLayout.js';

// CT2 is one data center inside a larger, low-rise industrial district.
// Every position below belongs to a road, parcel, utility verge, or horizon row.
const ROAD_RUNS = [
  { x: 0, z: 224, width: 790, length: 10 },
  { x: 0, z: -222, width: 790, length: 9 },
  ...[-205, -96, 96, 205].map((x) => ({ x, z: 1, width: 8, length: 458 })),
  { x: 39, z: 214, width: 7, length: 30 },
];

const PARCELS = [
  // Small frontage facilities fill the visitor's outward view without
  // crossing the existing winding entrance road at x≈20–45.
  { x: -43, z: 121, width: 42, length: 31, height: 5.3 },
  { x: -42, z: 182, width: 50, length: 39, height: 6.1 },
  ...[-151, 151].flatMap((x) => [-159, -65, 67, 157].map((z, index) => ({
    x, z, width: index % 2 ? 47 : 54, length: index % 3 ? 45 : 53,
    height: 6.3 + ((index + (x > 0 ? 2 : 0)) % 3) * 1.35,
  }))),
  ...[-277, 277].flatMap((x) => [-153, -33, 105].map((z, index) => ({
    x, z, width: 70, length: 63, height: 5.5 + index * 1.3,
  }))),
];

function instanced(root, name, geometry, material, placements) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.userData.ignoreNavigation = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const transform = new THREE.Object3D();
  placements.forEach(({ x, y = 0, z, sx = 1, sy = 1, sz = 1, rotation = 0, rotationZ = 0 }, index) => {
    transform.position.set(x, y, z);
    transform.rotation.set(0, rotation, rotationZ);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  root.add(mesh);
  return mesh;
}

function material(color, roughness = .9, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function grassClumpGeometry() {
  const vertices = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3;
    const alongX = Math.cos(angle);
    const alongZ = Math.sin(angle);
    const acrossX = -alongZ * .13;
    const acrossZ = alongX * .13;
    vertices.push(
      alongX * .08 - acrossX, 0, alongZ * .08 - acrossZ,
      alongX * (.32 + index % 2 * .11), .75 + index % 3 * .12,
      alongZ * (.32 + index % 2 * .11),
      alongX * .08 + acrossX, 0, alongZ * .08 + acrossZ,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addDistrictRoads(root, asphalt, concrete) {
  instanced(root, 'CT2DistrictRoads', new THREE.BoxGeometry(1, .13, 1), asphalt,
    ROAD_RUNS.map(({ x, z, width, length }) => ({ x, y: .018, z, sx: width, sz: length })));
  const frontageAccess = new THREE.Mesh(new THREE.BoxGeometry(41, .13, 6), asphalt);
  frontageAccess.name = 'CT2FrontageParcelDriveway';
  frontageAccess.position.set(15, .018, 120);
  frontageAccess.receiveShadow = true;
  frontageAccess.userData.ignoreNavigation = true;
  root.add(frontageAccess);
  const shoulders = ROAD_RUNS.flatMap(({ x, z, width, length }) => width > length
    ? [-1, 1].map((side) => ({ x, y: .09, z: z + side * (length / 2 + .44), sx: width, sy: .18, sz: .52 }))
    : [-1, 1].map((side) => ({ x: x + side * (width / 2 + .44), y: .09, z, sx: .52, sy: .18, sz: length })));
  instanced(root, 'CT2DistrictRaisedCurbs', new THREE.BoxGeometry(1, 1, 1), concrete, shoulders);

  const pale = material('#c8c6b9', 1);
  const dashes = [];
  for (const road of ROAD_RUNS) {
    if (road.width > road.length) {
      for (let x = -380; x <= 380; x += 14) dashes.push({ x, y: .093, z: road.z, sx: 4, sy: .012, sz: .11 });
    } else if (road.length > 100) {
      for (let z = -211; z <= 211; z += 14) dashes.push({ x: road.x, y: .093, z, sx: .11, sy: .012, sz: 4 });
    }
  }
  instanced(root, 'CT2DistrictLaneDashes', new THREE.BoxGeometry(1, 1, 1), pale, dashes);

  const drain = material('#414745', .8, .25);
  const drains = [];
  for (const x of [-96, 96, -205, 205]) {
    for (const z of [-178, -103, -28, 47, 122, 197]) {
      drains.push({ x: x + 4.25, y: .113, z, sx: .5, sy: .035, sz: 1.6 });
    }
  }
  instanced(root, 'CT2DistrictRoadDrains', new THREE.BoxGeometry(1, 1, 1), drain, drains);
}

function addIndustrialParcels(root, concrete) {
  const wall = material('#8b9698');
  const wallAlt = material('#74838a');
  const roof = material('#53636c', .77, .18);
  const fascia = material('#c2c8c3', .8);
  const doors = material('#455960', .72, .2);
  const rooftop = material('#6c797b', .68, .28);
  const apron = PARCELS.map((parcel) => ({
    x: parcel.x, y: .08, z: parcel.z, sx: parcel.width + 16, sy: .13, sz: parcel.length + 17,
  }));
  instanced(root, 'CT2IndustrialParcelAprons', new THREE.BoxGeometry(1, 1, 1), concrete, apron);
  instanced(root, 'CT2NeighborWarehouseWalls', new THREE.BoxGeometry(1, 1, 1), wall,
    PARCELS.filter((_, i) => i % 2 === 0).map(({ x, z, width, length, height }) =>
      ({ x, y: .19 + height / 2, z, sx: width, sy: height, sz: length })));
  instanced(root, 'CT2NeighborWarehouseBlueWalls', new THREE.BoxGeometry(1, 1, 1), wallAlt,
    PARCELS.filter((_, i) => i % 2).map(({ x, z, width, length, height }) =>
      ({ x, y: .19 + height / 2, z, sx: width, sy: height, sz: length })));
  instanced(root, 'CT2NeighborWarehouseRoofs', new THREE.BoxGeometry(1, .25, 1), roof,
    PARCELS.map(({ x, z, width, length, height }) =>
      ({ x, y: .28 + height, z, sx: width + 1.2, sz: length + 1.2 })));
  instanced(root, 'CT2NeighborWarehouseFascia', new THREE.BoxGeometry(1, .6, .16), fascia,
    PARCELS.map(({ x, z, width, length, height }) =>
      ({ x, y: height - .36, z: z + length / 2 + .1, sx: width - .5 })));
  const loadingDoors = PARCELS.flatMap(({ x, z, width, length }, parcelIndex) =>
    [-1, 0, 1].map((slot) => ({
      x: x + slot * width * .27, y: 1.85, z: z + length / 2 + .12,
      sx: 4.3, sy: 3.5, sz: .1,
    })));
  instanced(root, 'CT2WarehouseLoadingDoors', new THREE.BoxGeometry(1, 1, 1), doors, loadingDoors);
  instanced(root, 'CT2WarehouseRearLoadingDoors', new THREE.BoxGeometry(1, 1, 1), doors,
    PARCELS.flatMap(({ x, z, width, length }) => [-1, 0, 1].map((slot) => ({
      x: x + slot * width * .27, y: 1.85, z: z - length / 2 - .12,
      sx: 4.3, sy: 3.5, sz: .1,
    }))));
  const pilaster = material('#aab3b1', .9);
  instanced(root, 'CT2WarehouseWallPilasters', new THREE.BoxGeometry(1, 1, 1), pilaster,
    PARCELS.flatMap(({ x, z, width, length, height }) => [-1, 1].flatMap((side) =>
      [-.45, -.15, .15, .45].map((fraction) => ({
        x: x + width * fraction, y: .19 + height / 2,
        z: z + side * (length / 2 + .16), sx: .34, sy: height, sz: .18,
      })))));
  const glazing = material('#344750', .65, .12);
  instanced(root, 'CT2WarehouseHighWindows', new THREE.BoxGeometry(1, 1, 1), glazing,
    PARCELS.flatMap(({ x, z, width, length, height }) => [-1, 1].flatMap((side) =>
      [-.36, -.18, 0, .18, .36].map((fraction) => ({
        x: x + width * fraction, y: height - 1.25,
        z: z + side * (length / 2 + .17), sx: width * .115, sy: .75, sz: .09,
      })))));
  instanced(root, 'CT2WarehouseRoofUnits', new THREE.BoxGeometry(1, 1, 1), rooftop,
    PARCELS.flatMap(({ x, z, height }, index) => [
      { x: x - 11, y: height + .85, z: z - 5, sx: 5.5, sy: 1.15, sz: 3.4 },
      { x: x + 10, y: height + .65, z: z + 7, sx: 3.2, sy: .75, sz: 4.6 },
    ]));

  const utilityGray = material('#667271', .79, .28);
  instanced(root, 'CT2UtilityCabinets', new THREE.BoxGeometry(1, 1, 1), utilityGray,
    [[-111, -123], [-111, 70], [111, -108], [112, 65], [-320, 126], [323, -102]]
      .map(([x, z]) => ({ x, y: 1.05, z, sx: 3.1, sy: 2.1, sz: 2.2 })));
  instanced(root, 'CT2ParcelContainers', new THREE.BoxGeometry(1, 1, 1), wallAlt,
    [[-309, -106], [-309, -91], [309, -168], [309, -151], [-178, 172], [179, -176]]
      .map(([x, z]) => ({ x, y: 1.45, z, sx: 5.8, sy: 2.7, sz: 11.7 })));

  // Stationary deliveries sit within loading aprons, clear of through lanes.
  const deliveries = PARCELS.filter((_, index) => index % 3 === 1).slice(0, 5)
    .map(({ x, z, length }) => ({ x: x + 8, z: z + length / 2 + 3.6 }));
  const paleTruck = material('#d1d3cd', .82, .08);
  const tire = material('#313538', 1);
  instanced(root, 'CT2DeliveryTruckCargo', new THREE.BoxGeometry(1, 1, 1), paleTruck,
    deliveries.map(({ x, z }) => ({ x, y: 1.8, z: z - 1.2, sx: 2.6, sy: 2.8, sz: 4.3 })));
  instanced(root, 'CT2DeliveryTruckCabs', new THREE.BoxGeometry(1, 1, 1), wallAlt,
    deliveries.map(({ x, z }) => ({ x, y: 1.27, z: z + 2.1, sx: 2.35, sy: 1.8, sz: 2.3 })));
  instanced(root, 'CT2DeliveryTruckWheels', new THREE.CylinderGeometry(.52, .52, .18, 8), tire,
    deliveries.flatMap(({ x, z }) => [-1.35, 1.35].flatMap((dx) => [-2.9, 1.4]
      .map((dz) => ({ x: x + dx, y: .58, z: z + dz, rotationZ: Math.PI / 2 })))));

  // Frontage fence turns two small warehouses into a readable gated parcel.
  const frontPosts = [];
  for (let x = -81; x <= -5; x += 4) for (const z of [86, 214]) frontPosts.push({ x, y: 1.2, z });
  for (const x of [-81, -5]) for (let z = 90; z <= 210; z += 4) {
    if (x === -5 && z >= 113 && z <= 129) continue; // vehicle gate
    frontPosts.push({ x, y: 1.2, z });
  }
  instanced(root, 'CT2FrontageFencePosts', new THREE.BoxGeometry(.12, 2.4, .12), utilityGray,
    frontPosts);
  const rails = [];
  for (const z of [86, 214]) for (const y of [.65, 1.8]) {
    rails.push({ x: -43, y, z, sx: 76, sy: .045, sz: .045 });
  }
  for (const x of [-81, -5]) for (const y of [.65, 1.8]) {
    const segments = x === -5 ? [[86, 113], [129, 214]] : [[86, 214]];
    for (const [from, to] of segments) {
      rails.push({ x, y, z: (from + to) / 2, sx: .045, sy: .045, sz: to - from });
    }
  }
  instanced(root, 'CT2FrontageFenceRails', new THREE.BoxGeometry(1, 1, 1), utilityGray, rails);
  const gateSpan = new THREE.Mesh(new THREE.BoxGeometry(.12, 2.4, 13),
    material('#596769', .78, .22));
  gateSpan.name = 'CT2FrontageSlidingGate';
  gateSpan.position.set(-5, 1.2, 120);
  gateSpan.userData.ignoreNavigation = true;
  root.add(gateSpan);
  const parcelGuard = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.7, 4), fascia);
  parcelGuard.name = 'CT2FrontageGuardCabin';
  parcelGuard.position.set(-13, 1.43, 119);
  parcelGuard.userData.ignoreNavigation = true;
  root.add(parcelGuard);
  instanced(root, 'CT2FrontageGuardWindows', new THREE.BoxGeometry(1, 1, 1), glazing,
    [
      { x: -13, y: 1.75, z: 121.05, sx: 2.6, sy: .9, sz: .08 },
      { x: -11.15, y: 1.75, z: 119, sx: .08, sy: .9, sz: 2.6 },
    ]);
}

function addRoadsideFurniture(root) {
  const metal = material('#4b5759', .72, .3);
  const lamp = material('#fff2cf', .5, .15);
  lamp.emissive = new THREE.Color('#ffd39a');
  lamp.emissiveIntensity = .45;
  const positions = CT2_DISTRICT_LAMPS;
  instanced(root, 'CT2DistrictLampPoles', new THREE.CylinderGeometry(.09, .14, 7.5, 6), metal,
    positions.map(({ x, z }) => ({ x, y: 3.75, z })));
  instanced(root, 'CT2DistrictLampArms', new THREE.BoxGeometry(1, 1, 1), metal,
    positions.map(({ x, z }) => ({ x: x + (x < 0 ? 1 : -1), y: 7.42, z, sx: 1.9, sy: .09, sz: .1 })));
  instanced(root, 'CT2DistrictLampHeads', new THREE.BoxGeometry(.7, .13, .35), lamp,
    positions.map(({ x, z }) => ({ x: x + (x < 0 ? 1.95 : -1.95), y: 7.35, z })));
  const bollards = [[-96, 193], [96, 193], [-96, -193], [96, -193],
    [-205, 193], [205, 193], [-205, -193], [205, -193]];
  instanced(root, 'CT2DistrictBollards', new THREE.CylinderGeometry(.12, .16, 1, 6), metal,
    bollards.flatMap(([x, z]) => [-1.2, 0, 1.2].map((offset) =>
      ({ x: x + offset, y: .55, z }))));
}

function addLandscapeClusters(root) {
  const dryGrass = material('#998d65', 1);
  dryGrass.side = THREE.DoubleSide;
  const shrub = material('#727d55', 1);
  const stone = material('#817c6e', 1);
  const grass = [];
  const shrubs = [];
  const stones = [];
  const vergeLines = [-205, -96, 96, 205].flatMap((x) =>
    [-196, -142, -88, -34, 20, 74, 128, 182].map((z) => ({ x: x + (x < 0 ? -10 : 10), z })));
  vergeLines.push(...[-65, 65].flatMap((x) => [-173, -128, -83, -38, 7, 52].map((z) => ({ x, z }))));
  vergeLines.push(...[
    [-17, 27], [-36, 34], [-55, 43], [1, 47],
    [-27, 54], [-51, 59], [-11, 66],
    [-48, 65], [-27, 75], [3, 83], [-67, 91], [9, 111],
    [-78, 145], [-4, 150], [8, 179], [-76, 197],
    [75, 64], [76, 108], [75, 151], [74, 190],
  ].map(([x, z]) => ({ x, z })));
  vergeLines.forEach(({ x, z }, index) => {
    // Compact, irregular clusters keep the verge legible and off the pavement.
    const angle = index * 2.399963;
    for (let member = 0; member < 5; member += 1) {
      const theta = angle + member * 1.256;
      const radius = .9 + (member % 3) * .75;
      const px = x + Math.cos(theta) * radius;
      const pz = z + Math.sin(theta) * radius;
      grass.push({ x: px, y: .06, z: pz, sx: .62 + member * .07, sy: .48 + member * .055, sz: .62 });
    }
    if (index % 2 === 0) shrubs.push({ x, y: .55, z, sx: 1.15 + index % 3 * .3, sy: .7, sz: 1.1 });
    if (index % 3 === 0) stones.push({ x: x + 2.3, y: .13, z: z - 1.4, sx: .6, sy: .24, sz: .42, rotation: angle });
  });
  instanced(root, 'CT2RoadsideDryGrassClumps', grassClumpGeometry(), dryGrass, grass);
  instanced(root, 'CT2RoadsideLowShrubs', new THREE.IcosahedronGeometry(1, 0), shrub, shrubs);
  instanced(root, 'CT2RoadsidePebbles', new THREE.IcosahedronGeometry(1, 0), stone, stones);
}

function addDistantBackground(root) {
  const distant = material('#7d8888', 1);
  const roofs = material('#626f74', .9);
  const blocks = [];
  for (const z of [-365, 345]) {
    for (let x = -650; x <= 650; x += 105) {
      if (Math.abs(x) < 40 && z > 0) continue; // keep the entry road legible
      const offset = ((Math.round(x / 105) * 7 + (z > 0 ? 3 : 0)) % 5) * 4;
      blocks.push({ x: x + offset, z, width: 62 + (Math.abs(x) % 3) * 8,
        length: 28 + (Math.abs(x) % 4) * 4, height: 5 + (Math.abs(x) % 5) * .8 });
    }
  }
  instanced(root, 'CT2DistantIndustrialSilhouettes', new THREE.BoxGeometry(1, 1, 1), distant,
    blocks.map(({ x, z, width, length, height }) => ({ x, y: height / 2, z, sx: width, sy: height, sz: length })));
  instanced(root, 'CT2DistantIndustrialRoofs', new THREE.BoxGeometry(1, .2, 1), roofs,
    blocks.map(({ x, z, width, length, height }) => ({ x, y: height + .12, z, sx: width + .5, sz: length + .5 })));
  const poles = [];
  for (const x of [-430, -350, 350, 430]) for (const z of [-300, -120, 70, 260]) poles.push({ x, z });
  const poleMaterial = material('#4d5656', .85, .3);
  instanced(root, 'CT2DistantUtilityPoles', new THREE.CylinderGeometry(.11, .16, 9.5, 5), poleMaterial,
    poles.map(({ x, z }) => ({ x, y: 4.75, z })));
  instanced(root, 'CT2DistantUtilityCrossbars', new THREE.BoxGeometry(4.4, .11, .12), poleMaterial,
    poles.map(({ x, z }) => ({ x, y: 8.7, z })));
}

export function createSouthAfricaSurroundings(root, materials) {
  const district = new THREE.Group();
  district.name = 'CT2DistrictSurroundings';
  root.add(district);
  addDistrictRoads(district, materials.asphalt, materials.concrete);
  addIndustrialParcels(district, materials.concrete);
  addRoadsideFurniture(district);
  addLandscapeClusters(district);
  addDistantBackground(district);
  return district;
}
