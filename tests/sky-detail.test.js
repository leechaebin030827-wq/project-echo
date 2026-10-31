import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalSkyHour, getSkyVisibility, getSolarTimes } from '../src/world/shared/SkyDetail.js';

test('stars emerge after dusk and disappear before daylight', () => {
  const noon = getSkyVisibility(12);
  const twilight = getSkyVisibility(19.5);
  const midnight = getSkyVisibility(23);
  assert.equal(noon.daylight, 1);
  assert.equal(noon.stars, 0);
  assert.ok(twilight.daylight < noon.daylight);
  assert.ok(twilight.stars > noon.stars && twilight.stars < midnight.stars);
  assert.equal(midnight.daylight, 0);
  assert.equal(midnight.stars, 1);
  assert.equal(getSkyVisibility(4).stars, 1);
});

test('Cape Town sky follows South African local time', () => {
  const instant = new Date('2026-10-28T10:30:00Z');
  const sky = getLocalSkyHour('southafrica', instant);
  assert.equal(sky.timeZone, 'Africa/Johannesburg');
  assert.equal(sky.localTime, '12:30');
  assert.ok(sky.solarTimes.sunrise < sky.solarTimes.sunset);
});

test('Hamina daylight follows the seasons and differs from Nevada', () => {
  const winter = new Date('2026-12-21T12:00:00Z');
  const summer = new Date('2026-06-21T12:00:00Z');
  const haminaWinter = getSolarTimes('hamina', winter);
  const haminaSummer = getSolarTimes('hamina', summer);
  const nevadaWinter = getSolarTimes('nevada', winter);
  const duration = ({ sunrise, sunset }) => sunset - sunrise;
  assert.ok(duration(haminaWinter) < duration(nevadaWinter));
  assert.ok(duration(haminaSummer) > duration(haminaWinter) + 9);
  assert.equal(getSkyVisibility(19, haminaWinter).stars, 1);
  assert.equal(getSkyVisibility(19, haminaSummer).daylight, 1);
});
