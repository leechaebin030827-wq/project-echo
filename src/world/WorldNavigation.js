import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);

export class WorldNavigation {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.walkableMeshes = [];
    this.obstacles = [];
    this.worldBounds = new THREE.Box3();
    this.surfaceBounds = new THREE.Box3();
    this.routes = [];
    this.rayOrigin = new THREE.Vector3();
    this.hitPoint = new THREE.Vector3();
    this.surfaceCellSize = 2.5;
    this.surfaceCells = new Map();
    this.surfaceTriangleCount = 0;
  }

  configure(world) {
    this.world = world;
    this.walkableMeshes = [];
    this.obstacles = [];
    this.routes = [];
    this.worldBounds.copy(world.bounds);
    this.surfaceBounds.makeEmpty();
    const walkableSet = new Set();
    for (const root of world.walkableRoots) {
      root.traverse((object) => {
        walkableSet.add(object);
        if (object.isMesh) this.walkableMeshes.push(object);
      });
      this.surfaceBounds.union(new THREE.Box3().setFromObject(root));
    }
    this.buildSurfaceIndex();

    const obstacleNamesToIgnore = new Set(['mountain']);
    for (const child of world.root.children) {
      if (walkableSet.has(child) || child.userData.ignoreNavigation
        || obstacleNamesToIgnore.has(child.name.toLowerCase())) continue;
      const box = new THREE.Box3().setFromObject(child);
      if (box.isEmpty()) continue;
      const size = box.getSize(new THREE.Vector3());
      if (size.x > world.size.x * 0.85 && size.z > world.size.z * 0.85) continue;
      box.min.x -= 0.42;
      box.min.z -= 0.42;
      box.max.x += 0.42;
      box.max.z += 0.42;
      this.obstacles.push(box);
    }
    const anchorName = world.navigationAnchorName ?? 'garage';
    const garage = world.root.getObjectByName(anchorName);
    if (!garage && !world.navigationBounds) {
      throw new Error(`${world.root.name}에서 ${anchorName} 경로 기준 영역을 찾을 수 없습니다.`);
    }
    this.garageBox = world.navigationBounds?.clone() ?? new THREE.Box3().setFromObject(garage);
    this.garageCenter = this.garageBox.getCenter(new THREE.Vector3());
    this.garageSize = this.garageBox.getSize(new THREE.Vector3());
    console.info(`[Navigation] ${anchorName} bounds:`, {
      min: this.garageBox.min.toArray(),
      max: this.garageBox.max.toArray(),
      center: this.garageCenter.toArray(),
      size: this.garageSize.toArray(),
    });
    this.routes = this.buildRoutes(15);
    return this;
  }

  buildSurfaceIndex() {
    this.surfaceCells.clear();
    this.surfaceTriangleCount = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const cellSize = this.surfaceCellSize;
    for (const mesh of this.walkableMeshes) {
      mesh.updateWorldMatrix(true, false);
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.index;
      const count = index?.count ?? position.count;
      for (let offset = 0; offset < count; offset += 3) {
        a.fromBufferAttribute(position, index ? index.getX(offset) : offset).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2).applyMatrix4(mesh.matrixWorld);
        const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(denominator) < 1e-8) continue;
        const triangle = {
          ax: a.x, ay: a.y, az: a.z,
          bx: b.x, by: b.y, bz: b.z,
          cx: c.x, cy: c.y, cz: c.z,
          denominator,
        };
        const minCellX = Math.floor(Math.min(a.x, b.x, c.x) / cellSize);
        const maxCellX = Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
        const minCellZ = Math.floor(Math.min(a.z, b.z, c.z) / cellSize);
        const maxCellZ = Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
            const key = `${cellX},${cellZ}`;
            if (!this.surfaceCells.has(key)) this.surfaceCells.set(key, []);
            this.surfaceCells.get(key).push(triangle);
          }
        }
        this.surfaceTriangleCount += 1;
      }
    }
    console.info(`[Navigation] indexed ${this.surfaceTriangleCount} walkable triangles`);
  }

  sampleHeight(x, z) {
    const cellX = Math.floor(x / this.surfaceCellSize);
    const cellZ = Math.floor(z / this.surfaceCellSize);
    const candidates = this.surfaceCells.get(`${cellX},${cellZ}`);
    let height = null;
    for (const triangle of candidates ?? []) {
      const weightA = ((triangle.bz - triangle.cz) * (x - triangle.cx)
        + (triangle.cx - triangle.bx) * (z - triangle.cz)) / triangle.denominator;
      const weightB = ((triangle.cz - triangle.az) * (x - triangle.cx)
        + (triangle.ax - triangle.cx) * (z - triangle.cz)) / triangle.denominator;
      const weightC = 1 - weightA - weightB;
      if (weightA < -1e-5 || weightB < -1e-5 || weightC < -1e-5) continue;
      const candidate = weightA * triangle.ay + weightB * triangle.by + weightC * triangle.cy;
      if (height === null || candidate > height) height = candidate;
    }
    if (height !== null) return height;

    // Degenerate or unusually large authored faces fall back to raycasting.
    this.rayOrigin.set(x, this.worldBounds.max.y + 24, z);
    this.raycaster.set(this.rayOrigin, DOWN);
    this.raycaster.far = this.worldBounds.max.y - this.worldBounds.min.y + 48;
    const hit = this.raycaster.intersectObjects(this.walkableMeshes, false)[0];
    return hit ? hit.point.y : null;
  }

  isClear(x, y, z) {
    for (const box of this.obstacles) {
      if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z
        && y <= box.max.y + 0.35) return false;
    }
    return true;
  }

  isInActivityArea(x, z, padding = 0) {
    if (this.world.root.name !== 'NevadaWorld') return true;
    return x >= this.garageBox.min.x + padding && x <= this.garageBox.max.x - padding
      && z >= this.garageBox.min.z + padding && z <= this.garageBox.max.z - padding;
  }

  makeEllipse(centerX, centerZ, radiusX, radiusZ, samples = 36) {
    const points = [];
    for (let index = 0; index < samples; index += 1) {
      const angle = (index / samples) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radiusX;
      const z = centerZ + Math.sin(angle) * radiusZ;
      const y = this.sampleHeight(x, z);
      if (y === null || !this.isClear(x, y, z) || !this.isInActivityArea(x, z, 0.45)) return null;
      points.push(new THREE.Vector3(x, y, z));
    }
    return this.finishRoute(points);
  }

  finishRoute(points) {
    let length = 0;
    const cumulative = [0];
    for (let index = 0; index < points.length; index += 1) {
      length += points[index].distanceTo(points[(index + 1) % points.length]);
      cumulative.push(length);
    }
    return { points, cumulative, length };
  }

  buildRoutes(count) {
    const bounds = this.garageBox ?? this.surfaceBounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const routes = [];
    const xFractions = [-0.38, -0.19, 0, 0.19, 0.38];
    const zFractions = [-0.32, 0, 0.32];
    const offsets = [
      [0, 0], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4],
      [2.4, 2.4], [-2.4, -2.4], [4.8, 0], [-4.8, 0],
    ];

    for (let row = 0; row < zFractions.length; row += 1) {
      for (let column = 0; column < xFractions.length; column += 1) {
        const baseX = center.x + size.x * xFractions[column];
        const baseZ = center.z + size.z * zFractions[row];
        let route = null;
        for (const [offsetX, offsetZ] of offsets) {
          for (const radiusScale of [1, 0.78, 0.6]) {
            route = this.makeEllipse(
              baseX + offsetX,
              baseZ + offsetZ,
              Math.max(1.45, size.x * 0.045 * radiusScale),
              Math.max(1.05, size.z * 0.07 * radiusScale),
              32,
            );
            if (route) break;
          }
          if (route) break;
        }
        if (route) routes.push(route);
        if (routes.length >= count) break;
      }
      if (routes.length >= count) break;
    }

    if (routes.length < count) {
      const road = this.world.root.getObjectByName('road');
      const roadBox = road ? new THREE.Box3().setFromObject(road) : bounds;
      const roadSize = roadBox.getSize(new THREE.Vector3());
      for (let row = 0; row < 4 && routes.length < count; row += 1) {
        for (let column = 0; column < 6 && routes.length < count; column += 1) {
          const route = this.makeEllipse(
            THREE.MathUtils.lerp(roadBox.min.x + 3, roadBox.max.x - 3, column / 5),
            THREE.MathUtils.lerp(roadBox.min.z + 2, roadBox.max.z - 2, row / 3),
            Math.max(1.2, roadSize.x * 0.025),
            Math.max(0.9, roadSize.z * 0.055),
            28,
          );
          if (route) routes.push(route);
        }
      }
    }
    if (!routes.length) throw new Error(`${this.world.root.name}에서 안전한 캐릭터 경로를 만들 수 없습니다.`);
    if (routes.length < count) {
      console.warn(`[Navigation] validated ${routes.length}/${count} unique routes; reusing the safest routes.`);
    }
    const finalRoutes = Array.from({ length: count }, (_, index) => routes[index % routes.length]);
    console.info(`[Navigation] ${routes.length} route clusters validated`);
    return finalRoutes;
  }

  getRoute(index) {
    return this.routes[index % this.routes.length];
  }

  sampleRoute(route, distance, target = new THREE.Vector3()) {
    const wrapped = ((distance % route.length) + route.length) % route.length;
    let segment = 0;
    while (segment < route.points.length - 1 && route.cumulative[segment + 1] < wrapped) segment += 1;
    const start = route.points[segment];
    const end = route.points[(segment + 1) % route.points.length];
    const startDistance = route.cumulative[segment];
    const segmentLength = Math.max(0.0001, start.distanceTo(end));
    return target.lerpVectors(start, end, (wrapped - startDistance) / segmentLength);
  }

  constrainCamera(position) {
    const padding = 2;
    position.x = THREE.MathUtils.clamp(position.x, this.worldBounds.min.x + padding, this.worldBounds.max.x - padding);
    position.z = THREE.MathUtils.clamp(position.z, this.worldBounds.min.z + padding, this.worldBounds.max.z - padding);
    const floor = this.sampleHeight(position.x, position.z);
    if (floor !== null) position.y = Math.max(position.y, floor + 1.25);
    position.y = Math.min(position.y, this.worldBounds.max.y + 22);
  }
}
