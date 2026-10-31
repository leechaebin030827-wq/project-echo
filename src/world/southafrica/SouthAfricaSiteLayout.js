// Planned CT2 study layout in world metres. The supplied data center remains one building.
export const CT2_SITE_LAYOUT = Object.freeze({
  building: Object.freeze({
    url: '/models/southafrica/CT2.optimized.glb',
    position: Object.freeze([0, 0, -80]),
    scale: 48,
  }),
  servicePad: Object.freeze({ x: 0, z: -80, width: 100, length: 108 }),
  gate: Object.freeze({ z: -23, halfWidth: 6 }),
  entrance: Object.freeze({
    width: 6.8,
    points: Object.freeze([[39, 210], [39, 155], [34, 112], [25, 76], [16, 43], [13, 19], [11, 9]]),
  }),
  dropOff: Object.freeze({ center: Object.freeze([0, 0]), radiusX: 16.5, radiusZ: 12, width: 5.3 }),
  service: Object.freeze({ halfX: 59, frontZ: -18, rearZ: -143, cornerRadius: 12, width: 5.6 }),
  parking: Object.freeze({ x: -42, z: 19, width: 28, length: 25 }),
  parkingEntry: Object.freeze({
    width: 5.5,
    points: Object.freeze([[-16, 0], [-20, 3], [-25, 7], [-29, 11]]),
  }),
  streetLamps: Object.freeze([
    // Follow the entry road at roughly 42 m intervals, then the forecourt and service loop.
    ...[[23, 62], [31, 105], [43, 147], [43, 188]].map(([x, z], index) =>
      Object.freeze({ x, z, light: index % 2 === 0 })),
    ...[-18, 18].map((x) => Object.freeze({ x, z: 13, light: true })),
    Object.freeze({ x: -54, z: 37, light: false }),
    ...[-116, -68, -26].flatMap((z, row) => [-65, 65].map((x) =>
      Object.freeze({ x, z, light: row === 0 }))),
    ...[-37, 37].map((x) => Object.freeze({ x, z: -149, light: false })),
  ]),
});

// Even spacing follows the four district roads. Only selected fixtures use real lights;
// the rest share one emissive instanced mesh to keep the scene inexpensive.
export const CT2_DISTRICT_LAMPS = Object.freeze(
  [-205, -96, 96, 205].flatMap((roadX) =>
    [-192, -134, -76, -18, 40, 98, 156, 210].map((z) => Object.freeze({
      x: roadX + (roadX < 0 ? -6.1 : 6.1),
      z,
      light: Math.abs(roadX) === 96 && (z === -76 || z === 98),
    }))),
);

const placements = (xs, zs, scale) => xs.flatMap((x) => zs.map((z) => ({ x, z, scale })));

// Index order is the left-to-right order in the supplied five-object GLBs.
// Landscaping follows access, parking, forecourt, and perimeter zones.
export const CT2_KIT_PLACEMENTS = Object.freeze({
  plant: Object.freeze([
    [{ x: -90, z: 67, scale: 19 }, { x: 90, z: -92, scale: 20 },
      { x: -30, z: 46, scale: 19, rotation: .65 },
      { x: -65, z: 54, scale: 17, rotation: 1.8 },
      { x: -8, z: 82, scale: 20, rotation: 1.1 },
      { x: -10, z: 158, scale: 18, rotation: .25 },
      ...[-178, -75, 45, 154].flatMap((z, index) => [
        { x: -112, z, scale: 19 + index % 2 * 3, rotation: index * .6 },
        { x: 112, z: z + 15, scale: 20 + index % 3 * 2, rotation: index * .8 },
      ]),
      ...[-173, 62, 177].flatMap((z, index) => [
        { x: -220, z, scale: 22 - index, rotation: index * .7 },
        { x: 220, z: z - 13, scale: 21 + index, rotation: index * .5 },
      ])],
    [{ x: 39, z: 63, scale: 12 }, { x: 45, z: 91, scale: 12 },
      { x: 48, z: 119, scale: 13 }, { x: 50, z: 151, scale: 13 },
      { x: 50, z: 183, scale: 12 }, { x: 17, z: 92, scale: 11 },
      { x: 22, z: 129, scale: 12 }, { x: 25, z: 169, scale: 12 },
      { x: -58, z: 14, scale: 13 }, { x: -58, z: 31, scale: 13 },
      ...[-142, -38, 96, 174].flatMap((z, index) => [
        { x: -119, z, scale: 14 + index % 2 * 2 },
        { x: 119, z: z - 9, scale: 15 + index % 2 * 2 },
      ])],
    [{ x: -82, z: -113, scale: 14 }, { x: 82, z: -40, scale: 14 },
      { x: -91, z: -52, scale: 12 }, { x: 87, z: 30, scale: 12 }],
    placements([-37, -28, 28, 37], [-10], 7).concat(
      placements([-57, -27], [7, 17, 29], 6),
      placements([-116, 116, -219, 219], [-180, -73, 52, 166], 9)),
    placements([-23, 23], [-8, 5, 18], 6).concat(
      placements([-116, 116], [-191, -81, 39, 157], 8)),
  ]),
  security: Object.freeze([
    placements([-53, 53], [-38, -55], 16).map((item) => ({
      ...item, rotation: Math.PI / 2, stretchX: 2.9,
    })),
    [{ x: 0, z: -23, scale: 24 }],
    [{ x: -10, z: -23, scale: 12 }],
    [{ x: 12, z: -23, scale: 16 }],
    [-36, -16, 5, 26].map((x) => ({ x, z: -135, scale: 16, stretchX: 1.7 })),
  ]),
});
