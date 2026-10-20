import * as THREE from 'three';
import { TERRAIN_TEXTURE_CONFIG } from '../../config.js';

export class TerrainTextureSystem {
  constructor(config = TERRAIN_TEXTURE_CONFIG, options = {}) {
    this.loader = new THREE.TextureLoader();
    this.config = config;
    this.options = options;
    this.cache = new Map();
  }

  async apply(root) {
    const mergedBase = root.getObjectByName('Base');
    if (mergedBase) {
      await this.applyMergedBase(mergedBase);
      return;
    }
    const snowMap = this.options.triplanar && this.options.snowTextureUrl
      ? await this.loadTexture(this.options.snowTextureUrl, 1, true)
      : null;
    await Promise.all(Object.entries(this.config).map(async ([nodeName, config]) => {
      const aliases = [nodeName, nodeName.replaceAll(' ', '_')];
      const meshes = [];
      root.traverse((object) => {
        if (!object.isMesh) return;
        if (aliases.some((alias) => object.name === alias || object.name.startsWith(`${alias}.`))) {
          meshes.push(object);
        }
      });
      if (!meshes.length) {
        console.warn(`[Terrain] texture target not found: ${nodeName}`);
        return;
      }

      const [map, normalMap, roughnessMap] = await Promise.all([
        this.loadTexture(config.baseColor, config.repeat, true),
        this.loadTexture(config.normal, config.repeat),
        this.loadTexture(config.roughness, config.repeat),
      ]);

      for (const mesh of meshes) {
        const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          .map((source) => {
            const material = source.clone();
            material.map = map;
            material.normalMap = normalMap;
            material.roughnessMap = roughnessMap;
            material.color.set(config.color);
            material.roughness = config.roughnessValue;
            material.metalness = 0;
            material.normalScale.setScalar(config.normalScale);
            if (this.options.triplanar) {
              this.applyTriplanarShader(material, {
                scale: config.triplanarScale ?? 0.18,
                snowMap: snowMap ?? map,
                snowBlend: config.snowBlend ?? 0,
              });
            }
            material.needsUpdate = true;
            return material;
          });

        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      }
    }));
  }

  normalizeTerrainName(name = '') {
    return name.replaceAll('_', ' ').trim().toLowerCase();
  }

  terrainNameForMaterial(name = '') {
    const normalized = this.normalizeTerrainName(name);
    return this.options.materialAliases?.[normalized] ?? normalized;
  }

  async applyMergedBase(base) {
    const terrainEntries = Object.entries(this.config);
    const terrainIndex = new Map(terrainEntries.map(([name], index) => [
      this.normalizeTerrainName(name),
      index,
    ]));
    const textureSets = await Promise.all(terrainEntries.map(async ([, config]) => {
      const [map, normalMap, roughnessMap] = await Promise.all([
        this.loadTexture(config.baseColor, config.repeat, true),
        this.loadTexture(config.normal, config.repeat),
        this.loadTexture(config.roughness, config.repeat),
      ]);
      return { map, normalMap, roughnessMap, config };
    }));

    base.updateMatrixWorld(true);
    const primitiveEntries = [];
    const geometries = new Set();
    base.traverse((mesh) => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materials = sourceMaterials.map((source) => {
        const index = terrainIndex.get(this.terrainNameForMaterial(source.name));
        if (index === undefined) return source;
        const { map, normalMap, roughnessMap, config } = textureSets[index];
        const material = source.clone();
        material.map = map;
        material.normalMap = normalMap;
        material.roughnessMap = roughnessMap;
        material.color.set('#ffffff');
        material.roughness = config.roughnessValue;
        material.metalness = 0;
        material.normalScale.setScalar(config.normalScale);
        this.applyBlendedTriplanarShader(material, {
          scale: (config.triplanarScale ?? (1 / Math.max(config.repeat, 1))) * 1.5,
          terrainMaps: textureSets.map((set) => set.map),
          terrainNormalMaps: textureSets.map((set) => set.normalMap),
          terrainNormalScales: textureSets.map((set) => set.config.normalScale),
          terrainColors: textureSets.map((set) => new THREE.Color(set.config.color)),
          primaryColor: new THREE.Color(config.color),
          primaryIndex: index,
        });
        material.needsUpdate = true;
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];

      const groups = mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count, materialIndex: 0 }];
      for (const group of groups) {
        const material = materials[group.materialIndex ?? 0];
        const index = terrainIndex.get(this.terrainNameForMaterial(material?.name));
        if (index === undefined) continue;
        primitiveEntries.push({ mesh, geometry: mesh.geometry, group, terrainIndex: index });
      }
    });

    for (const geometry of geometries) {
      const count = geometry.attributes.position.count;
      geometry.setAttribute('terrainBlendIndex', new THREE.BufferAttribute(new Float32Array(count), 1));
      geometry.setAttribute('terrainBlendFactor', new THREE.BufferAttribute(new Float32Array(count), 1));
    }

    const ownersByPosition = new Map();
    const positionByKey = new Map();
    const point = new THREE.Vector3();
    for (const entry of primitiveEntries) {
      const { geometry, group, mesh } = entry;
      const position = geometry.attributes.position;
      const indices = geometry.index?.array;
      const end = group.start + group.count;
      const visited = new Set();
      for (let offset = group.start; offset < end; offset += 1) {
        const vertexIndex = indices ? indices[offset] : offset;
        if (visited.has(vertexIndex)) continue;
        visited.add(vertexIndex);
        point.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
        const key = `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)},${Math.round(point.z * 1000)}`;
        if (!ownersByPosition.has(key)) ownersByPosition.set(key, []);
        if (!positionByKey.has(key)) positionByKey.set(key, point.clone());
        ownersByPosition.get(key).push({ geometry, vertexIndex, terrainIndex: entry.terrainIndex });
      }
    }

    const hardEdgeIndex = terrainIndex.get('building floor');
    const baseSize = new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3());
    const blendRadius = THREE.MathUtils.clamp(Math.max(baseSize.x, baseSize.z) * 0.028, 2.2, 3.8);
    const seamGrid = new Map();
    const gridKey = (position) => `${Math.floor(position.x / blendRadius)},${Math.floor(position.z / blendRadius)}`;
    const seamRecords = [];

    for (const [key, owners] of ownersByPosition) {
      const materials = [...new Set(owners.map((owner) => owner.terrainIndex))];
      if (materials.length < 2 || materials.includes(hardEdgeIndex)) continue;
      const position = positionByKey.get(key);
      for (let first = 0; first < materials.length; first += 1) {
        for (let second = first + 1; second < materials.length; second += 1) {
          const record = { position, first: materials[first], second: materials[second] };
          seamRecords.push(record);
          const cell = gridKey(position);
          if (!seamGrid.has(cell)) seamGrid.set(cell, []);
          seamGrid.get(cell).push(record);
        }
      }
    }

    let boundaryVertexCount = 0;
    for (const [key, owners] of ownersByPosition) {
      const position = positionByKey.get(key);
      const cellX = Math.floor(position.x / blendRadius);
      const cellZ = Math.floor(position.z / blendRadius);
      for (const owner of owners) {
        if (owner.terrainIndex === hardEdgeIndex) continue;
        let closest = null;
        let closestDistanceSq = blendRadius * blendRadius;
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          for (let zOffset = -1; zOffset <= 1; zOffset += 1) {
            const records = seamGrid.get(`${cellX + xOffset},${cellZ + zOffset}`) ?? [];
            for (const record of records) {
              if (record.first !== owner.terrainIndex && record.second !== owner.terrainIndex) continue;
              const distanceSq = position.distanceToSquared(record.position);
              if (distanceSq >= closestDistanceSq) continue;
              closest = record;
              closestDistanceSq = distanceSq;
            }
          }
        }
        if (!closest) continue;
        const neighbourIndex = closest.first === owner.terrainIndex ? closest.second : closest.first;
        const proximity = 1 - Math.sqrt(closestDistanceSq) / blendRadius;
        const smoothProximity = proximity * proximity * (3 - 2 * proximity);
        owner.geometry.attributes.terrainBlendIndex.setX(owner.vertexIndex, neighbourIndex);
        owner.geometry.attributes.terrainBlendFactor.setX(owner.vertexIndex, smoothProximity * 0.5);
        boundaryVertexCount += 1;
      }
    }
    for (const geometry of geometries) {
      geometry.attributes.terrainBlendIndex.needsUpdate = true;
      geometry.attributes.terrainBlendFactor.needsUpdate = true;
    }
    console.info(`[Terrain] merged Base: ${primitiveEntries.length} materials, ${seamRecords.length} soft seams, ${boundaryVertexCount} blended vertices`);
  }

  applyBlendedTriplanarShader(material, {
    scale,
    terrainMaps,
    terrainNormalMaps,
    terrainNormalScales,
    terrainColors,
    primaryColor,
    primaryIndex,
  }) {
    material.normalMap = null;
    material.userData.triplanar = { scale, blended: true };
    material.onBeforeCompile = (shader) => {
      terrainMaps.forEach((map, index) => {
        shader.uniforms[`terrainMap${index}`] = { value: map };
        shader.uniforms[`terrainNormalMap${index}`] = { value: terrainNormalMaps[index] };
      });
      shader.uniforms.terrainScale = { value: scale };
      shader.uniforms.terrainPrimaryTint = { value: primaryColor };
      shader.uniforms.terrainPrimaryIndex = { value: primaryIndex };
      terrainColors.forEach((color, index) => {
        shader.uniforms[`terrainTint${index}`] = { value: color };
      });
      terrainNormalScales.forEach((normalScale, index) => {
        shader.uniforms[`terrainNormalStrength${index}`] = { value: normalScale };
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float terrainBlendIndex;
          attribute float terrainBlendFactor;
          varying vec3 vTerrainWorldPosition;
          varying vec3 vTerrainWorldNormal;
          varying float vTerrainBlendIndex;
          varying float vTerrainBlendFactor;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
          vTerrainBlendIndex = terrainBlendIndex;
          vTerrainBlendFactor = terrainBlendFactor;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vTerrainWorldPosition;
          varying vec3 vTerrainWorldNormal;
          varying float vTerrainBlendIndex;
          varying float vTerrainBlendFactor;
          uniform float terrainScale;
          uniform sampler2D terrainMap0;
          uniform sampler2D terrainMap1;
          uniform sampler2D terrainMap2;
          uniform sampler2D terrainMap3;
          uniform sampler2D terrainMap4;
          uniform sampler2D terrainNormalMap0;
          uniform sampler2D terrainNormalMap1;
          uniform sampler2D terrainNormalMap2;
          uniform sampler2D terrainNormalMap3;
          uniform sampler2D terrainNormalMap4;
          uniform vec3 terrainPrimaryTint;
          uniform vec3 terrainTint0;
          uniform vec3 terrainTint1;
          uniform vec3 terrainTint2;
          uniform vec3 terrainTint3;
          uniform vec3 terrainTint4;
          uniform float terrainPrimaryIndex;
          uniform float terrainNormalStrength0;
          uniform float terrainNormalStrength1;
          uniform float terrainNormalStrength2;
          uniform float terrainNormalStrength3;
          uniform float terrainNormalStrength4;

          vec4 sampleTerrainTriplanar(sampler2D tex, vec3 position, vec3 normal) {
            vec3 weights = pow(abs(normal), vec3(5.0));
            weights /= max(weights.x + weights.y + weights.z, 0.0001);
            vec4 xColor = texture2D(tex, position.zy * terrainScale);
            vec4 yColor = texture2D(tex, position.xz * terrainScale);
            vec4 zColor = texture2D(tex, position.xy * terrainScale);
            return xColor * weights.x + yColor * weights.y + zColor * weights.z;
          }

          vec4 sampleTerrainLayer(float index, vec3 position, vec3 normal) {
            if (index < 0.5) return sampleTerrainTriplanar(terrainMap0, position, normal);
            if (index < 1.5) return sampleTerrainTriplanar(terrainMap1, position, normal);
            if (index < 2.5) return sampleTerrainTriplanar(terrainMap2, position, normal);
            if (index < 3.5) return sampleTerrainTriplanar(terrainMap3, position, normal);
            return sampleTerrainTriplanar(terrainMap4, position, normal);
          }

          vec3 sampleTriplanarNormal(sampler2D tex, vec3 position, vec3 surfaceNormal) {
            vec3 weights = pow(abs(surfaceNormal), vec3(5.0));
            weights /= max(weights.x + weights.y + weights.z, 0.0001);
            vec3 xNormal = texture2D(tex, position.zy * terrainScale).xyz * 2.0 - 1.0;
            vec3 yNormal = texture2D(tex, position.xz * terrainScale).xyz * 2.0 - 1.0;
            vec3 zNormal = texture2D(tex, position.xy * terrainScale).xyz * 2.0 - 1.0;
            vec3 signs = sign(surfaceNormal);
            vec3 xWorld = vec3(xNormal.z * signs.x, xNormal.y, xNormal.x * signs.x);
            vec3 yWorld = vec3(yNormal.x, yNormal.z * signs.y, yNormal.y * signs.y);
            vec3 zWorld = vec3(zNormal.x * signs.z, zNormal.y, zNormal.z * signs.z);
            return normalize(xWorld * weights.x + yWorld * weights.y + zWorld * weights.z);
          }

          vec3 sampleTerrainNormalLayer(float index, vec3 position, vec3 surfaceNormal) {
            if (index < 0.5) return sampleTriplanarNormal(terrainNormalMap0, position, surfaceNormal);
            if (index < 1.5) return sampleTriplanarNormal(terrainNormalMap1, position, surfaceNormal);
            if (index < 2.5) return sampleTriplanarNormal(terrainNormalMap2, position, surfaceNormal);
            if (index < 3.5) return sampleTriplanarNormal(terrainNormalMap3, position, surfaceNormal);
            return sampleTriplanarNormal(terrainNormalMap4, position, surfaceNormal);
          }

          vec3 sampleTerrainTint(float index) {
            if (index < 0.5) return terrainTint0;
            if (index < 1.5) return terrainTint1;
            if (index < 2.5) return terrainTint2;
            if (index < 3.5) return terrainTint3;
            return terrainTint4;
          }

          float sampleTerrainNormalStrength(float index) {
            if (index < 0.5) return terrainNormalStrength0;
            if (index < 1.5) return terrainNormalStrength1;
            if (index < 2.5) return terrainNormalStrength2;
            if (index < 3.5) return terrainNormalStrength3;
            return terrainNormalStrength4;
          }

          vec3 perturbTerrainNormal(vec3 surfacePosition, vec3 surfaceNormal, vec2 heightGradient, float facing) {
            vec3 sigmaX = normalize(dFdx(surfacePosition));
            vec3 sigmaY = normalize(dFdy(surfacePosition));
            vec3 r1 = cross(sigmaY, surfaceNormal);
            vec3 r2 = cross(surfaceNormal, sigmaX);
            float determinant = dot(sigmaX, r1) * facing;
            vec3 gradient = sign(determinant) * (heightGradient.x * r1 + heightGradient.y * r2);
            return normalize(abs(determinant) * surfaceNormal - gradient);
          }

          float terrainBlendNoise(vec3 position) {
            return fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
          }`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec4 primaryTerrain = sampleTerrainTriplanar(map, vTerrainWorldPosition, vTerrainWorldNormal);
            vec4 blendedTerrain = primaryTerrain;
            vec3 blendedTint = terrainPrimaryTint;
            if (vTerrainBlendFactor > 0.001) {
              vec4 neighbourTerrain = sampleTerrainLayer(vTerrainBlendIndex, vTerrainWorldPosition, vTerrainWorldNormal);
              float edgeNoise = (terrainBlendNoise(vTerrainWorldPosition * 1.7) - 0.5) * 0.12;
              float blendAmount = clamp(vTerrainBlendFactor + edgeNoise * smoothstep(0.02, 0.5, vTerrainBlendFactor), 0.0, 0.5);
              blendedTerrain = mix(primaryTerrain, neighbourTerrain, blendAmount);
              blendedTint = mix(terrainPrimaryTint, sampleTerrainTint(vTerrainBlendIndex), blendAmount);
            }
            diffuseColor.rgb *= blendedTerrain.rgb * blendedTint;
            diffuseColor.a *= blendedTerrain.a;
          #endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            vec4 texelRoughness = sampleTerrainTriplanar(roughnessMap, vTerrainWorldPosition, vTerrainWorldNormal);
            roughnessFactor *= mix(0.8, 1.0, texelRoughness.g);
          #endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `float terrainNormalNoise = (terrainBlendNoise(vTerrainWorldPosition * 1.7) - 0.5) * 0.12;
          float terrainNormalBlend = clamp(vTerrainBlendFactor + terrainNormalNoise * smoothstep(0.02, 0.5, vTerrainBlendFactor), 0.0, 0.5);
          vec3 terrainSurfaceNormal = normalize(vTerrainWorldNormal) * faceDirection;
          vec3 primaryDetailNormal = sampleTerrainNormalLayer(
            terrainPrimaryIndex, vTerrainWorldPosition, terrainSurfaceNormal);
          vec3 detailNormal = primaryDetailNormal;
          float terrainBumpStrength = sampleTerrainNormalStrength(terrainPrimaryIndex) * 2.4;
          if (vTerrainBlendFactor > 0.001) {
            vec3 neighbourDetailNormal = sampleTerrainNormalLayer(
              vTerrainBlendIndex, vTerrainWorldPosition, terrainSurfaceNormal);
            detailNormal = normalize(mix(primaryDetailNormal, neighbourDetailNormal, terrainNormalBlend));
            terrainBumpStrength = mix(
              sampleTerrainNormalStrength(terrainPrimaryIndex),
              sampleTerrainNormalStrength(vTerrainBlendIndex),
              terrainNormalBlend
            ) * 2.4;
          }
          vec3 worldDetailNormal = normalize(mix(terrainSurfaceNormal, detailNormal,
            clamp(terrainBumpStrength, 0.0, 1.0)));
          normal = normalize(mat3(viewMatrix) * worldDetailNormal);`,
        );
    };
    material.customProgramCacheKey = () => 'nevada-merged-base-triplanar-v3';
  }

  applyTriplanarShader(material, { scale, snowMap, snowBlend }) {
    // UV stretching is especially visible on Hamina's steep snow banks. Base color and
    // roughness are sampled in world space; the shared snow layer keeps adjacent terrain
    // materials visually continuous instead of exposing their mesh/UV boundaries.
    material.normalMap = null;
    material.userData.triplanar = { scale, snowBlend };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.triScale = { value: scale };
      shader.uniforms.triSnowMap = { value: snowMap };
      shader.uniforms.triSnowBlend = { value: snowBlend };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vTriWorldPosition;
          varying vec3 vTriWorldNormal;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vTriWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTriWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vTriWorldPosition;
          varying vec3 vTriWorldNormal;
          uniform float triScale;
          uniform sampler2D triSnowMap;
          uniform float triSnowBlend;

          vec4 sampleTriplanar(sampler2D tex, vec3 worldPosition, vec3 worldNormal) {
            vec3 weights = pow(abs(worldNormal), vec3(5.0));
            weights /= max(weights.x + weights.y + weights.z, 0.0001);
            vec4 xProjection = texture2D(tex, worldPosition.zy * triScale);
            vec4 yProjection = texture2D(tex, worldPosition.xz * triScale);
            vec4 zProjection = texture2D(tex, worldPosition.xy * triScale);
            return xProjection * weights.x + yProjection * weights.y + zProjection * weights.z;
          }

          float terrainHash(vec2 cell) {
            return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
          }

          float terrainPatchNoise(vec3 position) {
            vec2 coordinate = position.xz * 0.085;
            vec2 cell = floor(coordinate);
            vec2 fraction = fract(coordinate);
            fraction = fraction * fraction * (3.0 - 2.0 * fraction);
            float a = terrainHash(cell);
            float b = terrainHash(cell + vec2(1.0, 0.0));
            float c = terrainHash(cell + vec2(0.0, 1.0));
            float d = terrainHash(cell + vec2(1.0, 1.0));
            return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
          }`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec4 sampledDiffuseColor = sampleTriplanar(map, vTriWorldPosition, vTriWorldNormal);
            vec4 sampledSnowColor = sampleTriplanar(triSnowMap, vTriWorldPosition, vTriWorldNormal);
            float upward = smoothstep(0.42, 0.86, normalize(vTriWorldNormal).y);
            float patchFactor = mix(0.72, 1.0, terrainPatchNoise(vTriWorldPosition));
            float snowMask = clamp(triSnowBlend * upward * patchFactor, 0.0, 0.88);
            diffuseColor *= mix(sampledDiffuseColor, sampledSnowColor, snowMask);
          #endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            vec4 texelRoughness = sampleTriplanar(roughnessMap, vTriWorldPosition, vTriWorldNormal);
            roughnessFactor *= texelRoughness.g;
          #endif`,
        );
    };
    material.customProgramCacheKey = () => `hamina-triplanar-${scale}-${snowBlend}`;
  }

  async loadTexture(url, repeat, isColor = false) {
    const key = `${url}|${repeat}|${isColor}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, this.loader.loadAsync(url).then((texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat * 1.3, repeat * 1.3);
        texture.anisotropy = 16;
        if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      }));
    }
    return this.cache.get(key);
  }
}
