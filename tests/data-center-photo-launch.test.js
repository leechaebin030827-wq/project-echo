import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DataCenterArchive } from '../src/ui/DataCenterArchive.js';
import { CinematicCameraController } from '../src/camera/CinematicCameraController.js';
import { EXPERIENCE_STATES } from '../src/config.js';

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
  const skyCenter = archive.cards.reduce((center, card) => center.add(card.sky),
    new THREE.Vector3()).divideScalar(archive.cards.length);
  assert.ok(path.sky.distanceTo(skyCenter) < 1e-6);
  archive.camera = new THREE.PerspectiveCamera();
  archive.elapsed = 0;
  let completed = 0;
  archive.onFallComplete = () => { completed += 1; };
  for (let frame = 0; frame < 90; frame += 1) {
    DataCenterArchive.prototype.update.call(archive, 0.05);
  }
  assert.equal(archive.dropActive, true, 'the shot remains active while copies descend');
  assert.ok(archive.cards.some((card) => card.mesh.position.y > card.landing.y + 1));
  for (let frame = 0; frame < 90; frame += 1) {
    DataCenterArchive.prototype.update.call(archive, 0.05);
  }
  assert.equal(archive.dropActive, false);
  assert.equal(completed, 1);
  assert.ok(archive.cards.every((card) => card.mesh.position.distanceTo(card.landing) < 0.001));
  currentImage.geometry.dispose();
  currentImage.material.dispose();
  previousImage.geometry.dispose();
  previousImage.material.dispose();
});

test('archive camera joins its rising-photo path without a position or aim jump', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(-12, 6, 7);
  const controller = new CinematicCameraController(camera, {});
  controller.target.set(-20, 7, 0);
  const region = { name: 'Data Center' };
  controller.state = EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS;
  controller.interactiveFocus = region;
  controller.interactiveFilm = { region };
  controller.focusArchiveDrop({
    launch: new THREE.Vector3(-12, 9, 0),
    echo: new THREE.Vector3(0, 3, 0),
    groundY: 0,
    outward: new THREE.Vector3(1, 0, 0),
    sky: new THREE.Vector3(0, 30, 0),
  });
  const transitionEnd = controller.transition.destination.clone();
  const targetEnd = controller.transition.destinationTarget.clone();
  camera.position.copy(transitionEnd);
  controller.target.copy(targetEnd);
  controller.transition = null;
  const archive = { dropActive: true, dropElapsed: 1.05 };
  controller.applyInteractiveFilm(0, archive);
  assert.ok(camera.position.distanceTo(transitionEnd) < 1e-6);
  assert.ok(controller.target.distanceTo(targetEnd) < 1e-6);
  archive.dropElapsed = 1.06;
  controller.applyInteractiveFilm(0, archive);
  assert.ok(camera.position.distanceTo(transitionEnd) < 0.001);
  assert.ok(controller.target.distanceTo(targetEnd) < 0.001);
  archive.dropElapsed = 8.2;
  controller.applyInteractiveFilm(0, archive);
  assert.ok(camera.position.distanceTo(controller.archiveDropFilm.widePosition) < 1e-6);
  assert.ok(controller.target.distanceTo(controller.archiveDropFilm.wideTarget) < 1e-6);
});

test('settled archive snapshot keeps every previous and newly dropped photo', () => {
  const oldImage = {
    id: 10,
    blob: new Blob(['old']),
    geometry: new THREE.PlaneGeometry(0.5, 0.7),
  };
  const newImage = {
    id: 11,
    blob: new Blob(['new']),
    geometry: new THREE.PlaneGeometry(0.6, 0.8),
  };
  const makeCard = (image, x) => {
    const mesh = new THREE.Mesh(image.geometry);
    mesh.position.set(x, 0.1, 2);
    mesh.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, x));
    return { image, mesh, landing: mesh.position.clone(), origin: null };
  };
  const archive = {
    world: { root: { name: 'NevadaWorld' } },
    images: [oldImage, newImage],
    cards: [makeCard(oldImage, 1), makeCard(newImage, 2)],
  };

  const snapshot = DataCenterArchive.prototype.createSettledSnapshot.call(archive);

  assert.equal(snapshot.world, 'NevadaWorld');
  assert.equal(snapshot.photoSizeScale, 0.6);
  assert.deepEqual(snapshot.images.map(({ id }) => id), [10, 11]);
  assert.deepEqual(snapshot.cards.map(({ id }) => id), [10, 11]);
  assert.deepEqual(snapshot.cards.map(({ position }) => position), [[1, 0.1, 2], [2, 0.1, 2]]);
  oldImage.geometry.dispose();
  newImage.geometry.dispose();
});
