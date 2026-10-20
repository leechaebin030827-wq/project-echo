import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { createCloudTexture, createStarTexture, getLocalSkyHour, getSkyVisibility } from './SkyDetail.js';

const SUN_DIRECTIONS = Object.freeze({
  nevada: new THREE.Vector3(-0.5, 0.79, 0.34).normalize(),
  hamina: new THREE.Vector3(-0.49, 0.8, 0.35).normalize(),
});

// The normal world camera looks slightly downward and both locations have a
// tall horizon. Keep the richer part of the gradient low enough to remain in
// view after landing, with a little extra lift in Hamina's more open skyline.
const SKY_LATITUDE_OFFSETS = Object.freeze({
  nevada: 0.18,
  hamina: 0.15,
});

const SKY_PALETTES = Object.freeze({
  nevada: {
    night: ['#071744', '#0a2052', '#17305c', '#25406a', '#334c70', '#415473', '#485a75', '#485a75', '#485a75'],
    dawn: ['#173a8c', '#3253a0', '#74658e', '#b77b93', '#e69b91', '#f0ad98', '#eab19d', '#eab19d', '#eab19d'],
    day: ['#1655c5', '#246ad0', '#5190d1', '#83b2d8', '#b3d0e0', '#d8dce0', '#d8d9d7', '#d8d9d7', '#d8d9d7'],
    dusk: ['#172f79', '#424a83', '#88638b', '#c1788d', '#e79a8c', '#efac91', '#dba591', '#dba591', '#dba591'],
  },
  hamina: {
    night: ['#0a1d43', '#0d2954', '#1b385f', '#2d4768', '#3a536e', '#485e73', '#485e73', '#485e73', '#485e73'],
    dawn: ['#284785', '#516893', '#848da8', '#b3abbf', '#d5c1c8', '#dfd5d2', '#dedcdb', '#dedcdb', '#dedcdb'],
    day: ['#2b70bd', '#4887c7', '#77a9d0', '#a5c7dc', '#c4d8e2', '#dce3e7', '#dce3e5', '#dce3e5', '#dce3e5'],
    dusk: ['#254278', '#526586', '#8e8da5', '#b7a8b4', '#d1b8bc', '#dccfce', '#d8d8d7', '#d8d8d7', '#d8d8d7'],
  },
});

function getSkyTimeline({ sunrise, sunset }) {
  return [
    [0, 'night'], [Math.max(0.05, sunrise - 1.5), 'night'],
    [sunrise + 0.1, 'dawn'], [sunrise + 1.4, 'day'],
    [sunset - 1.4, 'day'], [sunset + 0.1, 'dusk'],
    [Math.min(23.95, sunset + 1.5), 'night'], [24, 'night'],
  ];
}

function blendPalette(from, to, amount) {
  const eased = amount * amount * (3 - 2 * amount);
  return from.map((color, index) => (
    `#${new THREE.Color(color).lerp(new THREE.Color(to[index]), eased).getHexString()}`
  ));
}

function createFlareTexture(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 63);
  if (type === 'core') {
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.12, 'rgba(255,250,224,1)');
    gradient.addColorStop(0.38, 'rgba(255,220,150,0.72)');
    gradient.addColorStop(1, 'rgba(255,190,96,0)');
  } else {
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.28, 'rgba(225,242,255,0.05)');
    gradient.addColorStop(0.5, 'rgba(220,238,255,0.34)');
    gradient.addColorStop(0.72, 'rgba(180,215,255,0.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = `SkySunFlare-${type}`;
  return texture;
}

export class Atmosphere {
  constructor(scene, world = null, mode = 'nevada') {
    this.scene = scene;
    this.mode = mode;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 16;
    this.canvas.height = 1024;
    this.context = this.canvas.getContext('2d');
    this.transition = null;
    this.timeRefreshElapsed = 0;
    this.worldTimes = {};
    this.sunDirection = SUN_DIRECTIONS[mode].clone();
    this.sunRingTexture = createFlareTexture('ring');
    this.cloudTextures = {
      nevada: createCloudTexture('nevada'),
      hamina: createCloudTexture('hamina'),
    };
    this.starTexture = createStarTexture();
    this.cloudAge = 0;
    this.lensflare = new Lensflare();
    this.lensflare.name = 'AtmosphereLensFlare';
    this.sunElements = [
      new LensflareElement(this.sunRingTexture, 122, 0, new THREE.Color()),
      new LensflareElement(this.sunRingTexture, 46, 0.34, new THREE.Color()),
      new LensflareElement(this.sunRingTexture, 26, 0.62, new THREE.Color()),
      new LensflareElement(this.sunRingTexture, 14, 0.82, new THREE.Color()),
    ];
    this.sunElements.forEach((element) => this.lensflare.addElement(element));
    this.scene.add(this.lensflare);
    this.currentColors = this.getGradient(mode);
    this.configureSun(mode);
    this.drawGradient(this.currentColors);
    this.background = this.createGradientBackground();
    this.skyDome = this.createWorldSky(this.background);
    this.scene.add(this.skyDome);
    // A flat color remains only as a fallback behind the dome. Using the
    // gradient texture directly as scene.background made it screen-locked.
    this.scene.background = new THREE.Color(this.currentColors[0]);
    this.scene.fog = null;
  }

  getGradient(mode) {
    const { timeZone, localTime, hour: decimalHour, solarTimes } = getLocalSkyHour(mode);
    const skyVisibility = getSkyVisibility(decimalHour, solarTimes);
    const timeline = getSkyTimeline(solarTimes);
    let from = timeline[0];
    let to = timeline[timeline.length - 1];
    for (let index = 0; index < timeline.length - 1; index += 1) {
      if (decimalHour >= timeline[index][0]
        && decimalHour <= timeline[index + 1][0]) {
        from = timeline[index];
        to = timeline[index + 1];
        break;
      }
    }
    const span = Math.max(0.001, to[0] - from[0]);
    const progress = THREE.MathUtils.clamp((decimalHour - from[0]) / span, 0, 1);
    this.worldTimes[mode] = {
      timeZone,
      localTime,
      hour: decimalHour,
      from: from[1],
      to: to[1],
      progress: Number(progress.toFixed(3)),
      daylight: Number(skyVisibility.daylight.toFixed(3)),
      stars: Number(skyVisibility.stars.toFixed(3)),
      sunrise: Number(solarTimes.sunrise.toFixed(2)),
      sunset: Number(solarTimes.sunset.toFixed(2)),
    };
    return blendPalette(SKY_PALETTES[mode][from[1]], SKY_PALETTES[mode][to[1]], progress);
  }

  getGradientStops(mode) {
    if (mode === 'hamina') return [0, 0.08, 0.14, 0.19, 0.24, 0.34, 0.48, 0.7, 1];
    return [0, 0.055, 0.09, 0.12, 0.15, 0.245, 0.4, 0.66, 1];
  }

  drawGradient(colors, stops = this.getGradientStops(this.mode)) {
    const gradient = this.context.createLinearGradient(0, 0, 0, this.canvas.height);
    colors.forEach((color, index) => gradient.addColorStop(stops[index], color));
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.background) this.background.needsUpdate = true;
    if (this.scene.background?.isColor) this.scene.background.set(colors[0]);
  }

  createGradientBackground() {
    const texture = new THREE.CanvasTexture(this.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  createWorldSky(texture) {
    const geometry = new THREE.SphereGeometry(720, 48, 32);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        gradientMap: { value: texture },
        latitudeOffset: { value: SKY_LATITUDE_OFFSETS[this.mode] },
        nevadaClouds: { value: this.cloudTextures.nevada },
        haminaClouds: { value: this.cloudTextures.hamina },
        starsMap: { value: this.starTexture },
        worldBlend: { value: this.mode === 'hamina' ? 1 : 0 },
        daylight: { value: this.worldTimes[this.mode].daylight },
        starVisibility: { value: this.worldTimes[this.mode].stars },
        cloudAge: { value: 0 },
        sunDirection: { value: this.sunDirection },
      },
      vertexShader: `
        varying vec3 vSkyDirection;
        void main() {
          vSkyDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D gradientMap;
        uniform sampler2D nevadaClouds;
        uniform sampler2D haminaClouds;
        uniform sampler2D starsMap;
        uniform float latitudeOffset;
        uniform float worldBlend;
        uniform float daylight;
        uniform float starVisibility;
        uniform float cloudAge;
        uniform vec3 sunDirection;
        varying vec3 vSkyDirection;
        void main() {
          // Canvas row 0 is the zenith color. Pin it to world latitude so
          // pitching the camera reveals a different part of the same sky.
          // Keep the atmospheric horizon band close enough to remain visible
          // from the normal, slightly downward world camera.
          // The band is still world-anchored; only its latitude is lowered.
          vec3 direction = normalize(vSkyDirection);
          float gradientV = clamp(latitudeOffset - direction.y * 0.72, 0.0, 1.0);
          // Canvas textures are uploaded with a vertical flip in WebGL.
          vec3 sky = texture2D(gradientMap, vec2(0.5, 1.0 - gradientV)).rgb;
          vec2 skyUv = vec2(fract(atan(direction.z, direction.x) / 6.2831853 + 0.5),
            asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265 + 0.5);
          vec3 cloudNevada = texture2D(nevadaClouds,
            vec2(fract(skyUv.x + cloudAge * 0.000011), skyUv.y)).rgb;
          vec3 cloudHamina = texture2D(haminaClouds,
            vec2(fract(skyUv.x - cloudAge * 0.000006), skyUv.y)).rgb;
          vec3 cloudSample = mix(cloudNevada, cloudHamina, worldBlend);
          float cloud = cloudSample.r
            * smoothstep(-0.035, 0.14, direction.y);
          float sunFacing = max(dot(direction, normalize(sunDirection)), 0.0);
          vec3 daylightCloud = mix(vec3(0.61, 0.68, 0.75), vec3(0.98, 0.98, 0.97),
            0.5 + 0.42 * sunFacing);
          daylightCloud = mix(daylightCloud, vec3(0.73, 0.77, 0.80), worldBlend * 0.36);
          vec3 nightCloud = mix(vec3(0.18, 0.23, 0.33), vec3(0.27, 0.34, 0.41), worldBlend);
          vec3 cloudColor = mix(nightCloud, daylightCloud, daylight);
          cloudColor *= mix(0.7, 1.05, cloudSample.g * 0.72 + cloudSample.b * 0.28);
          sky = mix(sky, cloudColor, cloud * mix(0.5, 0.82, daylight)
            * mix(1.0, 1.12, worldBlend));
          float starsAboveHorizon = smoothstep(0.03, 0.18, direction.y);
          vec3 stars = texture2D(starsMap, skyUv).rgb;
          sky += stars * starVisibility * starsAboveHorizon
            * (1.0 - cloud * 0.95) * mix(0.78, 0.44, worldBlend);
          float solarDisk = pow(sunFacing, 700.0) * daylight;
          float solarGlow = pow(sunFacing, 30.0) * daylight;
          sky += vec3(1.0, 0.79, 0.52) * (solarDisk * 0.38 + solarGlow * 0.045);
          gl_FragColor = vec4(sky, 1.0);
          #include <colorspace_fragment>
        }
      `,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const dome = new THREE.Mesh(geometry, material);
    dome.name = 'AtmosphereWorldSky';
    dome.renderOrder = -10000;
    dome.frustumCulled = false;
    dome.raycast = () => {};
    return dome;
  }

  configureSun(mode) {
    const hamina = mode === 'hamina';
    const colors = hamina
      ? ['#506879', '#5f8098', '#89aabd', '#607f94']
      : ['#735d40', '#826746', '#a8875a', '#765d3f'];
    const daylight = this.worldTimes[mode]?.daylight ?? 1;
    const flareStrength = Math.max(0, daylight);
    this.lensflare.visible = flareStrength > 0.03;
    this.sunElements.forEach((element, index) => (
      element.color.set(colors[index]).multiplyScalar(flareStrength)
    ));
  }

  transitionTo(mode, duration = 3.8, world = null) {
    if (mode === this.mode && !this.transition) return;
    const from = this.currentColors ?? this.getGradient(this.mode);
    const to = this.getGradient(mode);
    this.transition = {
      mode,
      duration,
      elapsed: 0,
      from: from.map((color) => new THREE.Color(color)),
      to: to.map((color) => new THREE.Color(color)),
      world,
    };
  }

  finishTransition(mode, world = null) {
    this.mode = mode;
    this.transition = null;
    this.currentColors = this.getGradient(mode);
    this.drawGradient(this.currentColors);
    this.sunDirection.copy(SUN_DIRECTIONS[mode]);
    this.skyDome.material.uniforms.worldBlend.value = mode === 'hamina' ? 1 : 0;
    this.skyDome.material.uniforms.daylight.value = this.worldTimes[mode].daylight;
    this.skyDome.material.uniforms.starVisibility.value = this.worldTimes[mode].stars;
    this.configureSun(mode);
    this.scene.fog = null;
  }

  update(delta, camera) {
    this.cloudAge += delta;
    this.skyDome.material.uniforms.cloudAge.value = this.cloudAge;
    this.timeRefreshElapsed += delta;
    if (this.transition) {
      this.transition.elapsed += delta;
      const progress = Math.min(1, this.transition.elapsed / this.transition.duration);
      const eased = progress * progress * (3 - 2 * progress);
      this.currentColors = this.transition.from.map((color, index) => (
        `#${color.clone().lerp(this.transition.to[index], eased).getHexString()}`
      ));
      const fromStops = this.getGradientStops(this.mode);
      const toStops = this.getGradientStops(this.transition.mode);
      const currentStops = fromStops.map((stop, index) => (
        THREE.MathUtils.lerp(stop, toStops[index], eased)
      ));
      this.skyDome.material.uniforms.latitudeOffset.value = THREE.MathUtils.lerp(
        SKY_LATITUDE_OFFSETS[this.mode],
        SKY_LATITUDE_OFFSETS[this.transition.mode],
        eased,
      );
      this.skyDome.material.uniforms.worldBlend.value = this.transition.mode === 'hamina'
        ? eased : 1 - eased;
      this.skyDome.material.uniforms.daylight.value = THREE.MathUtils.lerp(
        this.worldTimes[this.mode].daylight,
        this.worldTimes[this.transition.mode].daylight,
        eased,
      );
      this.skyDome.material.uniforms.starVisibility.value = THREE.MathUtils.lerp(
        this.worldTimes[this.mode].stars,
        this.worldTimes[this.transition.mode].stars,
        eased,
      );
      this.lensflare.visible = this.skyDome.material.uniforms.daylight.value > 0.03;
      this.sunDirection.copy(SUN_DIRECTIONS[this.mode])
        .lerp(SUN_DIRECTIONS[this.transition.mode], eased).normalize();
      this.drawGradient(this.currentColors, currentStops);
      if (progress >= 1) this.finishTransition(this.transition.mode, this.transition.world);
    } else if (this.timeRefreshElapsed >= 20) {
      this.timeRefreshElapsed = 0;
      const refreshed = this.getGradient(this.mode);
      this.currentColors = this.currentColors.map((color, index) => (
        `#${new THREE.Color(color).lerp(new THREE.Color(refreshed[index]), 0.18).getHexString()}`
      ));
      this.configureSun(this.mode);
      this.skyDome.material.uniforms.daylight.value = this.worldTimes[this.mode].daylight;
      this.skyDome.material.uniforms.starVisibility.value = this.worldTimes[this.mode].stars;
      this.drawGradient(this.currentColors);
    }
    if (camera) {
      // Follow only the camera position. The dome never inherits camera
      // rotation, so its latitude bands stay locked to the world's up axis.
      this.skyDome.position.copy(camera.position);
      // Keep the sun fixed to one world direction as the camera turns.
      // Lensflare depth occlusion hides it naturally behind the scene.
      this.lensflare.position.copy(camera.position).addScaledVector(this.sunDirection, 420);
    }
  }

  dispose() {
    this.background.dispose();
    this.cloudTextures.nevada.dispose();
    this.cloudTextures.hamina.dispose();
    this.starTexture.dispose();
    this.skyDome.geometry.dispose();
    this.skyDome.material.dispose();
    this.skyDome.removeFromParent();
    this.lensflare.removeFromParent();
    this.lensflare.dispose();
    this.sunRingTexture.dispose();
    this.scene.fog = null;
  }
}
