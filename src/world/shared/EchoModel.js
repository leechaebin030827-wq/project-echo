import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ECHO_RIG_URL } from '../../config.js';
import { tuneEchoMaterial } from './EchoMaterial.js';

// Preserve the placement authored in each world GLB. Nevada's Echo node is a
// group at scale 4; Hamina's echo node is a mesh at its own authored scale.
export async function replaceEchoModel(source) {
  if (!source) throw new Error('World ECHO node is missing.');
  const { scene } = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(ECHO_RIG_URL);
  const mesh = scene.getObjectByName('ECHO_Mesh');
  if (!mesh?.isSkinnedMesh || !scene.getObjectByName('Body')?.isBone) {
    throw new Error('Replacement ECHO is missing its four-leg rig.');
  }
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
    tuneEchoMaterial(material);
  }

  const retiredMeshes = [];
  source.traverse((object) => {
    if (object.isMesh) retiredMeshes.push(object);
  });

  let mount = source;
  if (source.isMesh) {
    mount = new THREE.Group();
    mount.name = source.name;
    mount.position.copy(source.position);
    mount.quaternion.copy(source.quaternion);
    mount.scale.copy(source.scale);
    source.parent.add(mount);
    source.removeFromParent();
  } else {
    source.clear();
  }
  mount.add(scene);
  mount.updateMatrixWorld(true);
  const retiredMaterials = new Set();
  const retiredTextures = new Set();
  for (const oldMesh of retiredMeshes) {
    oldMesh.geometry?.dispose();
    for (const material of (Array.isArray(oldMesh.material) ? oldMesh.material : [oldMesh.material])) {
      if (!material) continue;
      retiredMaterials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) retiredTextures.add(value);
    }
  }
  for (const material of retiredMaterials) material.dispose();
  for (const texture of retiredTextures) texture.dispose();
  return mount;
}
