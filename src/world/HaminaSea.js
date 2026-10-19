import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { HAMINA_TERRAIN_TEXTURE_CONFIG } from '../config.js';

// The authored Ocean mesh marks the exact sea level and extent. Keep its
// geometry completely fixed; only the normal-map lighting and reflections move.
export async function createHaminaSea(root, terrainTextures) {
  const ocean = root.getObjectByName('Ocean');
  if (!ocean?.isMesh) throw new Error('Hamina1018 Ocean plane is missing.');

  const bounds = ocean.geometry.boundingBox ?? (ocean.geometry.computeBoundingBox(), ocean.geometry.boundingBox);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const normals = await terrainTextures.loadTexture(HAMINA_TERRAIN_TEXTURE_CONFIG.water.normal, 1);
  normals.wrapS = THREE.RepeatWrapping;
  normals.wrapT = THREE.RepeatWrapping;
  normals.anisotropy = 8;

  const water = new Water(new THREE.PlaneGeometry(size.x, size.z, 1, 1), {
    textureWidth: 256,
    textureHeight: 256,
    waterNormals: normals,
    sunDirection: new THREE.Vector3(-0.48, 0.78, 0.39).normalize(),
    sunColor: '#9fb2c2',
    waterColor: '#06182d',
    distortionScale: 0.72,
    alpha: 1,
    fog: true,
  });
  water.name = 'HaminaSea';
  water.position.copy(ocean.position).add(center);
  water.position.y += 0.045;
  water.rotation.x = -Math.PI / 2;
  water.scale.copy(ocean.scale);
  // Broad, low contrast normal movement reads as a heavy winter sea without
  // making the surface look stormy or vertically unstable.
  water.material.uniforms.size.value = 4.8;

  // The planar reflection is the most expensive Hamina pass. Updating at
  // 20fps remains fluid under the animated normal map and avoids doubling the
  // whole-world render cost on every display frame.
  const renderReflection = water.onBeforeRender.bind(water);
  let reflectionFrame = 0;
  water.onBeforeRender = (...args) => {
    reflectionFrame = (reflectionFrame + 1) % 3;
    if (reflectionFrame === 0) renderReflection(...args);
  };

  ocean.visible = false;
  ocean.parent.add(water);
  return water;
}
