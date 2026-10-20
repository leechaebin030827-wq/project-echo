// Increase the color contrast of the Meshy albedo without altering its texture
// or the glossy material response. Apply again to cloned materials: Three.js
// does not copy onBeforeCompile in Material.clone().
const tunedMaterials = new WeakSet();

export function tuneEchoMaterial(material) {
  if (!material || tunedMaterials.has(material)) return material;
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float echoLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = clamp(mix(vec3(echoLuma), diffuseColor.rgb, 1.34), 0.0, 1.0);`,
    );
  };
  tunedMaterials.add(material);
  material.needsUpdate = true;
  return material;
}
