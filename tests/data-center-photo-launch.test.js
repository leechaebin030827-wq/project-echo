import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DataCenterArchive } from '../src/ui/DataCenterArchive.js';

test('data center launches only the current visitor photo toward dispersed echo landings', () => {
  const currentImage = {
    id: 27,
    geometry: new THREE.PlaneGeometry(0.5, 0.7),
    material: new THREE.MeshBasicMaterial(),
  };
  const previousImage = {
    id: 26,
    geometry: new THREE.PlaneGeometry(0.5, 0.7),
    material: new THREE.MeshBasicMaterial(),
  };
  const archive = {
    visible: true,
    dropActive: false,
    currentImage,
    images: [previousImage, currentImage],
    cards: [],
    group: new THREE.Group(),
    world: {
      echoCenter: new THREE.Vector3(0, 3, 0),
      interactiveRegions: [{
        name: 'Data Center',
        center: new THREE.Vector3(-20, 4, 0),
        radius: 11,
        bounds: new THREE.Box3(
          new THREE.Vector3(-25, 0, -5), new THREE.Vector3(-15, 8, 5),
        ),
      }],
    },
    findEchoLanding(index) {
      const angle = index * Math.PI * 2 / 16;
      return new THREE.Vector3(Math.cos(angle) * 10, 0.1, Math.sin(angle) * 10);
    },
  };
  const path = DataCenterArchive.prototype.releaseCopies.call(archive);
  assert.ok(path.launch.x > -15, 'photos should launch outside the building facade');
  assert.equal(archive.cards.length, 16);
  assert.ok(archive.cards.every((card) => card.image === currentImage));
  assert.ok(archive.cards.every((card) => card.rise.y > path.launch.y + 17));
  assert.ok(archive.cards.some((card) => card.landing.x > 8));
  assert.ok(archive.cards.some((card) => card.landing.x < -8));
  assert.ok(archive.cards.some((card) => card.landing.z > 8));
  assert.ok(archive.cards.some((card) => card.landing.z < -8));
  currentImage.geometry.dispose();
  currentImage.material.dispose();
  previousImage.geometry.dispose();
  previousImage.material.dispose();
});
