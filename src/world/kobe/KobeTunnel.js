import * as THREE from 'three';
import { tileGeometry } from './KobeMaterialManager.js';

const UP = new THREE.Vector3(0, 1, 0);

function rodMatrix(from, to, dummy) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  dummy.position.copy(from).add(to).multiplyScalar(0.5);
  dummy.quaternion.setFromUnitVectors(UP, direction.normalize());
  dummy.scale.set(1, length, 1);
  dummy.updateMatrix();
  return dummy.matrix.clone();
}

export function createKobeTunnel({
  width = 7,
  wallHeight = 3.5,
  length = 64,
  bracketSpacing = 2,
  bracketArmLength = 0.9,
  rightSide = true,
  tileSize = 2.5,
  materials,
} = {}) {
  if (!materials) throw new Error('Kobe tunnel materials are required.');
  const group = new THREE.Group();
  group.name = 'KobeProceduralTunnel';
  const half = width / 2;
  const radius = half;
  const centerZ = -length / 2;

  const floor = new THREE.Mesh(
    tileGeometry(new THREE.PlaneGeometry(width, length, 6, 28), width, length, tileSize),
    materials.floor,
  );
  floor.name = 'KobeFloor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, centerZ);
  floor.receiveShadow = true;
  group.add(floor);

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      tileGeometry(new THREE.PlaneGeometry(length, wallHeight, 28, 4), length, wallHeight, tileSize),
      materials.concrete,
    );
    wall.name = side < 0 ? 'KobeWallLeft' : 'KobeWallRight';
    wall.position.set(side * half, wallHeight / 2, centerZ);
    wall.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    wall.receiveShadow = true;
    group.add(wall);
  }

  const roof = new THREE.Mesh(
    tileGeometry(
      new THREE.CylinderGeometry(radius, radius, length, 40, 28, true, 0, Math.PI),
      Math.PI * radius, length, tileSize,
    ),
    materials.concrete,
  );
  roof.name = 'KobeArchRoof';
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(0, wallHeight, centerZ);
  roof.receiveShadow = true;
  group.add(roof);

  const seamMaterial = materials.seam;
  const arc = [];
  for (let index = 0; index <= 32; index += 1) {
    const theta = Math.PI * index / 32;
    arc.push(new THREE.Vector3(-radius * Math.cos(theta), wallHeight + radius * Math.sin(theta), 0));
  }
  for (let z = -8; z > -length; z -= 8) {
    const arch = new THREE.Mesh(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(arc.map((point) => point.clone().setZ(z))), 36, 0.012, 5,
    ), seamMaterial);
    arch.name = 'KobeExpansionJoint';
    group.add(arch);
    for (const side of [-1, 1]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.022, wallHeight, 0.024), seamMaterial);
      seam.position.set(side * half, wallHeight / 2, z);
      group.add(seam);
    }
  }

  const sides = rightSide ? [-1, 1] : [-1];
  const dummy = new THREE.Object3D();
  const braces = [];
  const plates = [];
  for (const side of sides) {
    const anchorX = side * (half - 0.025);
    const tipX = side * (half - bracketArmLength);
    const top = wallHeight - 0.22;
    const bottom = top - 0.68;
    const rail = new THREE.Mesh(
      tileGeometry(new THREE.BoxGeometry(0.13, 0.13, length), 0.52, length, tileSize),
      materials.metal,
    );
    rail.name = 'KobeServiceRail';
    rail.position.set(tipX, top + 0.05, centerZ);
    group.add(rail);
    const pipe = new THREE.Mesh(
      tileGeometry(new THREE.CylinderGeometry(0.04, 0.04, length, 10), 0.25, length, tileSize),
      materials.metal,
    );
    pipe.name = 'KobeServicePipe';
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(tipX + side * 0.16, top + 0.17, centerZ);
    group.add(pipe);
    for (let z = -0.8; z > -length + 0.5; z -= bracketSpacing) {
      const wallTop = new THREE.Vector3(anchorX, top, z);
      const tip = new THREE.Vector3(tipX, top, z);
      const wallBottom = new THREE.Vector3(anchorX, bottom, z);
      braces.push(rodMatrix(wallTop, tip, dummy));
      braces.push(rodMatrix(wallBottom, tip, dummy));
      braces.push(rodMatrix(wallBottom, wallTop, dummy));
      dummy.position.set(anchorX, (top + bottom) / 2, z);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      plates.push(dummy.matrix.clone());
    }
  }
  const braceMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.032, 0.032, 1, 8), materials.metal, braces.length,
  );
  braceMesh.name = 'KobeTriangularBrackets';
  braces.forEach((matrix, index) => braceMesh.setMatrixAt(index, matrix));
  braceMesh.instanceMatrix.needsUpdate = true;
  group.add(braceMesh);
  const plateMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.065, 0.18, 0.16), materials.metal, plates.length,
  );
  plateMesh.name = 'KobeWallMounts';
  plates.forEach((matrix, index) => plateMesh.setMatrixAt(index, matrix));
  plateMesh.instanceMatrix.needsUpdate = true;
  group.add(plateMesh);

  const lightCount = Math.max(1, Math.floor(length / 7));
  const lightFrames = new THREE.InstancedMesh(
    new THREE.BoxGeometry(width * 0.56, 0.055, 0.075), materials.metal, lightCount,
  );
  lightFrames.name = 'KobeLightFrames';
  const lightPanels = new THREE.InstancedMesh(
    new THREE.BoxGeometry(width * 0.26, 0.035, 0.22), materials.light, lightCount,
  );
  lightPanels.name = 'KobeLightPanels';
  for (let index = 0; index < lightCount; index += 1) {
    const z = -3.5 - index * 7;
    dummy.position.set(0, wallHeight + radius * 0.74, z);
    dummy.quaternion.identity();
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lightFrames.setMatrixAt(index, dummy.matrix);
    dummy.position.y -= 0.08;
    dummy.updateMatrix();
    lightPanels.setMatrixAt(index, dummy.matrix);
  }
  lightFrames.instanceMatrix.needsUpdate = true;
  lightPanels.instanceMatrix.needsUpdate = true;
  group.add(lightFrames, lightPanels);

  // A long, dry industrial conveyor establishes the Kobe reference language:
  // dark rubber belt, galvanized frame and high-visibility yellow guards.
  const conveyorWidth = Math.min(2.55, width * 0.38);
  const conveyorLength = length - 5;
  const conveyorZ = -length / 2 - 0.8;
  const belt = new THREE.Mesh(
    tileGeometry(new THREE.BoxGeometry(conveyorWidth, 0.18, conveyorLength),
      conveyorWidth, conveyorLength, tileSize),
    materials.belt,
  );
  belt.name = 'KobeConveyorBelt';
  belt.position.set(0, 0.82, conveyorZ);
  group.add(belt);

  for (const side of [-1, 1]) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.34, conveyorLength), materials.metal,
    );
    frame.name = 'KobeConveyorFrame';
    frame.position.set(side * (conveyorWidth / 2 + 0.07), 0.66, conveyorZ);
    group.add(frame);
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, conveyorLength, 8), materials.safety,
    );
    rail.name = 'KobeSafetyRail';
    rail.rotation.x = Math.PI / 2;
    rail.position.set(side * (conveyorWidth / 2 + 0.34), 1.72, conveyorZ);
    group.add(rail);
  }

  const supportCount = Math.floor(conveyorLength / 2.4);
  const supportTransforms = [];
  const railPostTransforms = [];
  for (let index = 0; index < supportCount; index += 1) {
    const z = -3.5 - index * 2.4;
    for (const side of [-1, 1]) {
      dummy.position.set(side * (conveyorWidth / 2 + 0.07), 0.35, z);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      supportTransforms.push(dummy.matrix.clone());
      dummy.position.set(side * (conveyorWidth / 2 + 0.34), 1.22, z);
      dummy.updateMatrix();
      railPostTransforms.push(dummy.matrix.clone());
    }
  }
  const supports = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.7, 0.12), materials.metal, supportTransforms.length,
  );
  supportTransforms.forEach((matrix, index) => supports.setMatrixAt(index, matrix));
  supports.instanceMatrix.needsUpdate = true;
  supports.name = 'KobeConveyorSupports';
  group.add(supports);
  const railPosts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1, 8), materials.safety, railPostTransforms.length,
  );
  railPostTransforms.forEach((matrix, index) => railPosts.setMatrixAt(index, matrix));
  railPosts.instanceMatrix.needsUpdate = true;
  railPosts.name = 'KobeSafetyRailPosts';
  group.add(railPosts);

  for (const z of [-7.2, -length + 2.2]) {
    for (const side of [-1, 1]) {
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 1.28, 1.55), materials.safety,
      );
      housing.name = 'KobeConveyorGuard';
      housing.position.set(side * (conveyorWidth / 2 + 0.2), 0.78, z);
      group.add(housing);
    }
    const crossGuard = new THREE.Mesh(
      new THREE.BoxGeometry(conveyorWidth, 0.5, 0.16), materials.safety,
    );
    crossGuard.name = 'KobeConveyorCrossGuard';
    crossGuard.position.set(0, 1.22, z);
    group.add(crossGuard);
  }

  group.userData.parameters = {
    width, wallHeight, length, bracketSpacing, bracketArmLength, rightSide, tileSize,
  };
  group.userData.floor = floor;
  group.userData.bracketCount = plates.length;
  return group;
}
