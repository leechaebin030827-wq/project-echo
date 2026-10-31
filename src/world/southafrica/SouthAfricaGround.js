import * as THREE from 'three';
import { CT2_SITE_LAYOUT } from './SouthAfricaSiteLayout.js';
import { createSouthAfricaRoads } from './SouthAfricaRoads.js';
import { createSouthAfricaSurroundings } from './SouthAfricaSurroundings.js';

const GROUND_EXTENT = 1800;

function loadGroundTexture(name, file, color = true) {
  const texture = new THREE.TextureLoader().load(`/textures/southafrica/ct2-pbr-v2/${file}`);
  texture.name = `CT2PBR-${name}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

// The ground meshes have no reliable UVs. Project every surface from world position
// so adjoining road slabs keep the same texture phase and vertical edges blend.
function triplanarMaterial(name, texture, tileSize, channels) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .96, metalness: 0 });
  material.name = `CT2Triplanar-${name}`;
  material.userData.triplanarTileSize = tileSize;
  material.customProgramCacheKey = () => `ct2-world-triplanar-${name}-v3`;
  material.onBeforeCompile = (shader) => {
    const distanceFade = name === 'DrySoil' ? `
      // Retain the photographed grain; use only a gentle large-scale color drift.
      float macro = sin(vTriPosition.x * 0.014) * sin(vTriPosition.z * 0.011);
      triColor.rgb *= 0.98 + macro * 0.035;
    ` : '';
    shader.uniforms.triplanarScale = { value: 1 / tileSize };
    shader.uniforms.triRoughnessMap = { value: channels.roughness };
    shader.uniforms.triNormalMap = { value: channels.normal };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPosition;\nvarying vec3 vTriNormal;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvTriNormal = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTriPosition;
        varying vec3 vTriNormal;
        uniform float triplanarScale;
        uniform sampler2D triRoughnessMap;
        uniform sampler2D triNormalMap;
        vec4 sampleCT2Triplanar(sampler2D atlas, vec3 coord, vec3 weight) {
          if (weight.y > 0.995) return texture2D(atlas, coord.xz);
          return texture2D(atlas, coord.zy) * weight.x
            + texture2D(atlas, coord.xz) * weight.y
            + texture2D(atlas, coord.xy) * weight.z;
        }
        vec3 sampleCT2WorldNormal(sampler2D atlas, vec3 coord, vec3 surfaceNormal, vec3 weight) {
          vec3 signs = sign(surfaceNormal);
          vec3 yNormal = texture2D(atlas, coord.xz).xyz * 2.0 - 1.0;
          if (weight.y > 0.995) return normalize(vec3(yNormal.x, yNormal.z * signs.y, yNormal.y * signs.y));
          vec3 xNormal = texture2D(atlas, coord.zy).xyz * 2.0 - 1.0;
          vec3 zNormal = texture2D(atlas, coord.xy).xyz * 2.0 - 1.0;
          vec3 xWorld = vec3(xNormal.z * signs.x, xNormal.y, xNormal.x * signs.x);
          vec3 yWorld = vec3(yNormal.x, yNormal.z * signs.y, yNormal.y * signs.y);
          vec3 zWorld = vec3(zNormal.x * signs.z, zNormal.y, zNormal.z * signs.z);
          return normalize(xWorld * weight.x + yWorld * weight.y + zWorld * weight.z);
        }
      `)
      .replace('#include <map_fragment>', `
        vec3 triWeight = pow(abs(normalize(vTriNormal)), vec3(5.0));
        triWeight /= max(triWeight.x + triWeight.y + triWeight.z, 0.0001);
        vec3 triCoord = vTriPosition * triplanarScale;
        vec4 triColor = sampleCT2Triplanar(map, triCoord, triWeight);
        ${distanceFade}
        diffuseColor *= triColor;
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        float roughAtlas = sampleCT2Triplanar(triRoughnessMap, triCoord, triWeight).g;
        roughnessFactor *= mix(0.8, 1.0, roughAtlas);
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 surfaceNormal = normalize(vTriNormal);
        vec3 detailNormal = sampleCT2WorldNormal(triNormalMap, triCoord, surfaceNormal, triWeight);
        normal = normalize(mat3(viewMatrix) * normalize(mix(surfaceNormal, detailNormal, 0.38)));
      `);
  };
  return material;
}

function distanceToSegment(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz)
    / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

function terrainHeight(x, z) {
  const campus = Math.max(Math.abs(x) - 75, z - 54, -160 - z, 0);
  const route = CT2_SITE_LAYOUT.entrance.points.reduce((nearest, point, index, points) => (
    index ? Math.min(nearest, distanceToSegment(x, z, points[index - 1], point)) : nearest
  ), Infinity) - 13;
  // The neighboring district is graded before its streets and parcels are laid.
  // Rolling ground resumes beyond the built-up area.
  const district = Math.max(Math.abs(x) - 405, Math.abs(z) - 255, 0);
  const flatten = THREE.MathUtils.smoothstep(Math.min(campus, route, district), 0, 55);
  const broad = Math.sin(x * .016) * .24 + Math.cos(z * .012) * .3
    + Math.sin(x * .011 + z * .008) * .18;
  return -.045 + broad * flatten;
}

function createTerrain(material) {
  const geometry = new THREE.PlaneGeometry(GROUND_EXTENT, GROUND_EXTENT, 144, 144);
  geometry.rotateX(-Math.PI * .5);
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    position.setY(index, terrainHeight(position.getX(index), position.getZ(index)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.ignoreNavigation = true;
  return mesh;
}

function addGrass(root) {
  const geometry = new THREE.PlaneGeometry(.06, .58);
  geometry.translate(0, .29, 0);
  const material = new THREE.MeshStandardMaterial({
    color: '#ab9b66', roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });
  const grass = new THREE.InstancedMesh(geometry, material, 1000);
  grass.name = 'CT2ClusteredDryGrass';
  grass.userData.ignoreNavigation = true;
  const transform = new THREE.Object3D();
  let seed = 33791;
  const random = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const patches = [
    [-83, 47, 22, 17], [83, 50, 22, 20],
    [-82, -80, 18, 28], [84, -118, 23, 25],
    [-28, 64, 13, 12], [56, 81, 9, 20],
    [-70, 12, 9, 18], [-64, -151, 15, 11],
  ];
  for (let index = 0; index < grass.count; index += 1) {
    const [cx, cz, rx, rz] = patches[index % patches.length];
    const theta = random() * Math.PI * 2;
    const radius = Math.sqrt(random());
    const x = cx + Math.cos(theta) * radius * rx;
    const z = cz + Math.sin(theta) * radius * rz;
    transform.position.set(x, terrainHeight(x, z), z);
    transform.rotation.set(0, random() * Math.PI, (random() - .5) * .2);
    const scale = .42 + random() * .95;
    transform.scale.set(scale, scale, scale);
    transform.updateMatrix();
    grass.setMatrixAt(index, transform.matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  root.add(grass);
  return grass;
}

function addPerimeterFence(root) {
  const metal = new THREE.MeshStandardMaterial({ color: '#56615b', metalness: .35, roughness: .72 });
  const postPositions = [];
  for (const x of [-53, 53]) for (let z = -63; z >= -135; z -= 8) postPositions.push([x, z]);
  for (let x = -53; x <= 53; x += 8) postPositions.push([x, -135]);
  for (const x of [-53, -15, 17, 53]) postPositions.push([x, -25]);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.1, 2.2, .1), metal, postPositions.length);
  posts.name = 'CT2PerimeterFencePosts';
  posts.userData.ignoreNavigation = true;
  const transform = new THREE.Object3D();
  postPositions.forEach(([x, z], index) => {
    transform.position.set(x, 1.1, z);
    transform.updateMatrix();
    posts.setMatrixAt(index, transform.matrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  root.add(posts);
  const sections = [
    [-53, -99, .06, 72], [53, -99, .06, 72],
    [-34, -25, 38, .06], [35, -25, 36, .06],
    [-47.5, -135, 11, .06], [42.5, -135, 21, .06],
  ];
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), metal,
    sections.length * 3);
  rails.name = 'CT2PerimeterFenceRails';
  rails.userData.ignoreNavigation = true;
  let railIndex = 0;
  for (const [x, z, width, length] of sections) for (const y of [.45, 1.2, 2.05]) {
    transform.position.set(x, y, z);
    transform.scale.set(width, .045, length);
    transform.updateMatrix();
    rails.setMatrixAt(railIndex++, transform.matrix);
  }
  rails.instanceMatrix.needsUpdate = true;
  rails.computeBoundingSphere();
  root.add(rails);
}

function addRepeatedSiteDetails(root) {
  const metal = new THREE.MeshStandardMaterial({ color: '#565c59', metalness: .6, roughness: .5 });
  const transform = new THREE.Object3D();
  const lampPositions = CT2_SITE_LAYOUT.streetLamps;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075, .12, 7, 7), metal, lampPositions.length);
  poles.name = 'CT2RoadLightPoles';
  poles.userData.ignoreNavigation = true;
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, .09, .12), metal, lampPositions.length);
  arms.name = 'CT2RoadLightArms';
  arms.userData.ignoreNavigation = true;
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: '#fff2cf', emissive: '#ffc987', emissiveIntensity: 1, metalness: .1, roughness: .5,
  });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.62, .16, .4), lampMaterial, lampPositions.length);
  heads.name = 'CT2RoadLightHeads';
  heads.userData.ignoreNavigation = true;
  lampPositions.forEach(({ x, z }, index) => {
    const direction = x < 0 ? 1 : -1;
    transform.position.set(x, 3.5, z);
    transform.updateMatrix();
    poles.setMatrixAt(index, transform.matrix);
    transform.position.set(x + direction * .58, 7.03, z);
    transform.updateMatrix();
    arms.setMatrixAt(index, transform.matrix);
    transform.position.set(x + direction * 1.18, 6.98, z);
    transform.updateMatrix();
    heads.setMatrixAt(index, transform.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  arms.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  root.add(poles, arms, heads);
  return { poles, arms, heads, lampPositions };
}

function addFacilityGround(root, concrete, plantedGround) {
  const pad = CT2_SITE_LAYOUT.servicePad;
  const forecourt = new THREE.Mesh(new THREE.BoxGeometry(100, .08, 18), concrete);
  forecourt.name = 'CT2LobbyForecourt';
  forecourt.position.set(0, -.005, -17);
  forecourt.receiveShadow = true;
  forecourt.userData.ignoreNavigation = true;
  root.add(forecourt);

  const bedMaterial = new THREE.MeshStandardMaterial({ color: '#747b65', roughness: 1 });
  const bedGeometry = new THREE.BoxGeometry(12, .11, 3.2);
  for (const x of [-33, 33]) {
    const bed = new THREE.Mesh(bedGeometry, bedMaterial);
    bed.name = 'CT2FacadePlantingBed';
    bed.position.set(x, .085, -9.7);
    bed.receiveShadow = true;
    bed.userData.ignoreNavigation = true;
    root.add(bed);
  }
  const serviceApron = new THREE.Mesh(
    new THREE.BoxGeometry(pad.width, .1, pad.length), concrete,
  );
  serviceApron.name = 'CT2RaisedServiceApron';
  serviceApron.position.set(pad.x, -.01, pad.z);
  serviceApron.receiveShadow = true;
  serviceApron.userData.ignoreNavigation = true;
  root.add(serviceApron);

  const vergeGeometry = new THREE.BoxGeometry(7, .045, 116);
  for (const x of [-70, 70]) {
    const verge = new THREE.Mesh(vergeGeometry, plantedGround);
    verge.name = 'CT2PerimeterLandscapeVerge';
    verge.position.set(x, -.024, -82);
    verge.receiveShadow = true;
    verge.userData.ignoreNavigation = true;
    root.add(verge);
  }

  const rearYard = new THREE.Mesh(new THREE.BoxGeometry(76, .09, 11), concrete);
  rearYard.name = 'CT2RearMaintenanceYard';
  rearYard.position.set(0, -.005, -152);
  rearYard.receiveShadow = true;
  rearYard.userData.ignoreNavigation = true;
  root.add(rearYard);
  const unitMaterial = new THREE.MeshStandardMaterial({ color: '#747e7f', roughness: .82, metalness: .16 });
  const units = new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, 2.2, 6.7), unitMaterial, 4);
  units.name = 'CT2RearServiceEquipment';
  units.userData.ignoreNavigation = true;
  const transform = new THREE.Object3D();
  [-25, -8, 8, 25].forEach((x, index) => {
    transform.position.set(x, 1.16, -152);
    transform.updateMatrix();
    units.setMatrixAt(index, transform.matrix);
  });
  units.instanceMatrix.needsUpdate = true;
  root.add(units);
}

export function createSouthAfricaGround(root) {
  const textures = {
    earth: loadGroundTexture('DrySoil', 'soil-color.png'),
    asphalt: loadGroundTexture('RoadAsphalt', 'asphalt-color.png'),
    concrete: loadGroundTexture('IndustrialConcrete', 'concrete-color.png'),
    earthRoughness: loadGroundTexture('DrySoilRoughness', 'soil-roughness.png', false),
    earthNormal: loadGroundTexture('DrySoilNormal', 'soil-normal.png', false),
    asphaltRoughness: loadGroundTexture('RoadAsphaltRoughness', 'asphalt-roughness.png', false),
    asphaltNormal: loadGroundTexture('RoadAsphaltNormal', 'asphalt-normal.png', false),
    concreteRoughness: loadGroundTexture('IndustrialConcreteRoughness', 'concrete-roughness.png', false),
    concreteNormal: loadGroundTexture('IndustrialConcreteNormal', 'concrete-normal.png', false),
  };
  const materials = {
    // Nevada's world-space projection uses a several-metre tile, so texture detail
    // survives minification at the visitor's normal camera height.
    earth: triplanarMaterial('DrySoil', textures.earth, 6.5,
      { roughness: textures.earthRoughness, normal: textures.earthNormal }),
    asphalt: triplanarMaterial('RoadAsphalt', textures.asphalt, 16,
      { roughness: textures.asphaltRoughness, normal: textures.asphaltNormal }),
    concrete: triplanarMaterial('IndustrialConcrete', textures.concrete, 14,
      { roughness: textures.concreteRoughness, normal: textures.concreteNormal }),
  };
  materials.vegetation = triplanarMaterial('DrySoilVerges', textures.earth, 6.5,
    { roughness: textures.earthRoughness, normal: textures.earthNormal });
  materials.vegetation.color.set('#a7b8a0');
  const earth = createTerrain(materials.earth);
  earth.name = 'SouthAfricaEndlessPlain';
  root.add(earth);
  addFacilityGround(root, materials.concrete, materials.vegetation);
  createSouthAfricaRoads(root, materials);
  createSouthAfricaSurroundings(root, materials);
  addPerimeterFence(root);
  const grass = addGrass(root);
  const details = addRepeatedSiteDetails(root);

  // Navigation indexes only the near activity zone, never the 1.8 km visual
  // plane. The latter would otherwise create hundreds of thousands of cells.
  const walkable = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ visible: false }),
  );
  walkable.name = 'CT2NavigationSurface';
  walkable.rotation.x = -Math.PI * .5;
  walkable.userData.isHitVolume = true;
  root.add(walkable);
  return { earth, walkable, grass, textures, ...details };
}
