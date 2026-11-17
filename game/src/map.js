// Cinder Quay: a freight container yard at dusk, laid out for two sites and
// three lanes. Ember attacks from the south gate; the Wardens hold the yard
// from the north. Every box is both a visible mesh and a collider, and a bullet
// stops on it. Bots do not steer around obstacles — they walk a waypoint graph
// whose edges were checked clear of every collider at build time, and a
// breadth-first search turns any two nodes into a route.
import * as THREE from 'three';
import { PAINT } from './palette.js';

// One entry per solid box: size, centre, and skin. The yard is 44 x 34 m,
// walled at 5 m.
const BLOCKS = [
  // Floor and the four outer walls.
  { width: 44.4, height: 0.4, depth: 34.4, px: 0, py: -0.2, pz: 0, skin: 'floor' },
  { width: 0.4, height: 5.0, depth: 34.4, px: -22.2, py: 2.5, pz: 0, skin: 'wall' },
  { width: 0.4, height: 5.0, depth: 34.4, px: 22.2, py: 2.5, pz: 0, skin: 'wall' },
  { width: 44.4, height: 5.0, depth: 0.4, px: 0, py: 2.5, pz: -17.2, skin: 'wall' },
  { width: 44.4, height: 5.0, depth: 0.4, px: 0, py: 2.5, pz: 17.2, skin: 'wall' },
  // Site A (west, -13, -11): stacked containers frame the pad.
  { width: 6.1, height: 2.6, depth: 2.4, px: -16.5, py: 1.3, pz: -13.5, skin: 'rust' },
  { width: 6.1, height: 2.6, depth: 2.4, px: -16.5, py: 3.9, pz: -13.5, skin: 'teal' },
  { width: 6.1, height: 2.6, depth: 2.4, px: -9.0, py: 1.3, pz: -15.2, skin: 'teal' },
  { width: 2.4, height: 2.6, depth: 6.1, px: -19.2, py: 1.3, pz: -8.0, skin: 'rust' },
  { width: 1.2, height: 1.1, depth: 1.2, px: -12.0, py: 0.55, pz: -7.5, skin: 'crate' },
  { width: 1.2, height: 1.1, depth: 1.2, px: -10.6, py: 0.55, pz: -8.6, skin: 'crate' },
  { width: 0.8, height: 0.8, depth: 0.8, px: -15.5, py: 0.4, pz: -9.0, skin: 'crate' },
  // Site B (east, 13, -11): the mirror of A, colours swapped.
  { width: 6.1, height: 2.6, depth: 2.4, px: 16.5, py: 1.3, pz: -13.5, skin: 'teal' },
  { width: 6.1, height: 2.6, depth: 2.4, px: 16.5, py: 3.9, pz: -13.5, skin: 'rust' },
  { width: 6.1, height: 2.6, depth: 2.4, px: 9.0, py: 1.3, pz: -15.2, skin: 'rust' },
  { width: 2.4, height: 2.6, depth: 6.1, px: 19.2, py: 1.3, pz: -8.0, skin: 'teal' },
  { width: 1.2, height: 1.1, depth: 1.2, px: 12.0, py: 0.55, pz: -7.5, skin: 'crate' },
  { width: 1.2, height: 1.1, depth: 1.2, px: 10.6, py: 0.55, pz: -8.6, skin: 'crate' },
  { width: 0.8, height: 0.8, depth: 0.8, px: 15.5, py: 0.4, pz: -9.0, skin: 'crate' },
  // Mid: the long container spine that splits the yard into lanes.
  { width: 6.1, height: 2.6, depth: 2.4, px: -4.0, py: 1.3, pz: -2.0, skin: 'rust' },
  { width: 6.1, height: 2.6, depth: 2.4, px: 4.0, py: 1.3, pz: -2.0, skin: 'teal' },
  { width: 6.1, height: 2.6, depth: 2.4, px: 0, py: 1.3, pz: 4.5, skin: 'rust' },
  { width: 1.2, height: 1.1, depth: 1.2, px: -8.5, py: 0.55, pz: 1.0, skin: 'crate' },
  { width: 1.2, height: 1.1, depth: 1.2, px: 8.5, py: 0.55, pz: 1.0, skin: 'crate' },
  { width: 0.8, height: 0.8, depth: 0.8, px: -1.5, py: 0.4, pz: 7.5, skin: 'crate' },
  { width: 0.8, height: 0.8, depth: 0.8, px: 1.5, py: 0.4, pz: 7.5, skin: 'crate' },
  // South-gate cover for the attackers' spawn.
  { width: 2.4, height: 1.1, depth: 1.2, px: -6.0, py: 0.55, pz: 11.5, skin: 'crate' },
  { width: 2.4, height: 1.1, depth: 1.2, px: 6.0, py: 0.55, pz: 11.5, skin: 'crate' },
  { width: 1.2, height: 1.1, depth: 1.2, px: 0, py: 0.55, pz: 13.5, skin: 'crate' },
  // Two tall stacks so the yard reads at a glance from the gate.
  { width: 6.1, height: 2.6, depth: 2.4, px: -19.0, py: 1.3, pz: 3.0, skin: 'teal' },
  { width: 6.1, height: 2.6, depth: 2.4, px: 19.0, py: 1.3, pz: 3.0, skin: 'rust' },
];

// Waypoints as {x, z}: gate rows run south to north, holds sit on the sites.
const STOPS = [
  { x: -18, z: 14 }, { x: -9, z: 14 }, { x: 0, z: 14 }, { x: 9, z: 14 }, { x: 18, z: 14 },
  { x: -18, z: 7 }, { x: -9, z: 7 }, { x: 0, z: 7 }, { x: 9, z: 7 }, { x: 18, z: 7 },
  { x: -18, z: 0 }, { x: -9, z: 0 }, { x: 0, z: 0 }, { x: 9, z: 0 }, { x: 18, z: 0 },
  { x: -18, z: -5 }, { x: -9, z: -5 }, { x: 0, z: -5 }, { x: 9, z: -5 }, { x: 18, z: -5 },
  { x: -13, z: -11 }, { x: -18, z: -11 }, { x: -7, z: -12 },
  { x: 13, z: -11 }, { x: 18, z: -11 }, { x: 7, z: -12 },
  { x: -13, z: -15 }, { x: 13, z: -15 },
];

const ATTACK_POINTS = [{ x: -4, z: 14 }, { x: -1.5, z: 15 }, { x: 1.5, z: 15 }, { x: 4, z: 14 }, { x: 0, z: 12.5 }];
const DEFEND_POINTS = [{ x: -13, z: -14 }, { x: -9, z: -13 }, { x: 13, z: -14 }, { x: 9, z: -13 }, { x: 0, z: -13 }];

export function buildYard(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mats = {
    floor: new THREE.MeshStandardMaterial({ color: 0x2e3641, roughness: 0.95, metalness: 0.02 }),
    wall: new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.surface), roughness: 0.9, metalness: 0.04 }),
    rust: new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.rust), roughness: 0.72, metalness: 0.28 }),
    teal: new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.teal), roughness: 0.72, metalness: 0.28 }),
    crate: new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.hairline), roughness: 0.85, metalness: 0.08 }),
  };
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PAINT.accent), transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false,
  });

  const solids = [];
  const targets = [];
  for (const box of BLOCKS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.width, box.height, box.depth), mats[box.skin]);
    mesh.position.set(box.px, box.py, box.pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    solids.push(new THREE.Box3().setFromObject(mesh));
    targets.push(mesh);
  }

  // Site markers: a glowing floor pad plus a lamp mast, so each site reads
  // from across the yard. The zone is the box a planter must stand inside.
  const zones = {};
  for (const pin of [{ key: 'A', x: -13, z: -11 }, { key: 'B', x: 13, z: -11 }]) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glowMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(pin.x, 0.02, pin.z);
    group.add(pad);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), mats.crate);
    mast.position.set(pin.x + 3.6, 2.7, pin.z + 3.6);
    mast.castShadow = true;
    group.add(mast);
    const lamp = new THREE.PointLight(new THREE.Color(PAINT.accent), 26, 16, 1.8);
    lamp.position.set(pin.x + 3.6, 5.2, pin.z + 3.6);
    group.add(lamp);
    zones[pin.key] = {
      center: new THREE.Vector3(pin.x, 0, pin.z),
      zone: new THREE.Box3(
        new THREE.Vector3(pin.x - 3.5, 0, pin.z - 3.5),
        new THREE.Vector3(pin.x + 3.5, 4, pin.z + 3.5),
      ),
      pad,
    };
  }

  // Dusk light: a low amber sun with shadows, a cool sky fill, and the two
  // site lamps above. The hemisphere light keeps the shadow side readable.
  const hemi = new THREE.HemisphereLight(new THREE.Color(0x3a4a63), new THREE.Color(0x14100c), 1.45);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(new THREE.Color(0xffb066), 3.4);
  sunLight.position.set(-14, 10, 18);
  sunLight.target.position.set(0, 0, -4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -26;
  sunLight.shadow.camera.right = 26;
  sunLight.shadow.camera.top = 24;
  sunLight.shadow.camera.bottom = -24;
  sunLight.shadow.camera.far = 70;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight, sunLight.target);
  const fillLight = new THREE.DirectionalLight(new THREE.Color(0x5a7290), 0.8);
  fillLight.position.set(12, 12, -14);
  scene.add(fillLight);

  // Waypoint graph: join two nodes when they are close and a straight walk
  // between them clears every collider, sampled every half metre.
  const nodes = STOPS.map((stop) => new THREE.Vector3(stop.x, 0.9, stop.z));
  const edges = nodes.map(() => []);
  const sample = new THREE.Vector3();
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const span = nodes[a].distanceTo(nodes[b]);
      if (span > 9.5) continue;
      let cut = false;
      const count = Math.ceil(span / 0.5);
      for (let k = 1; k < count && !cut; k += 1) {
        sample.lerpVectors(nodes[a], nodes[b], k / count);
        for (const wall of solids) {
          if (wall.containsPoint(sample)) { cut = true; break; }
        }
      }
      if (!cut) {
        edges[a].push(b);
        edges[b].push(a);
      }
    }
  }

  function nearest(position) {
    let near = 0;
    let nearDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const gap = nodes[i].distanceToSquared(position);
      if (gap < nearDist) { nearDist = gap; near = i; }
    }
    return near;
  }

  // Breadth-first route between nodes, returned as waypoint positions.
  // When no route exists (it should not happen on this map), walk straight
  // to the destination node instead of standing still.
  function pathfind(fromIndex, toIndex) {
    if (fromIndex === toIndex) return [nodes[toIndex].clone()];
    const cameFrom = new Array(nodes.length).fill(-1);
    const frontier = [fromIndex];
    cameFrom[fromIndex] = fromIndex;
    while (frontier.length > 0) {
      const node = frontier.shift();
      for (const step of edges[node]) {
        if (cameFrom[step] !== -1) continue;
        cameFrom[step] = node;
        if (step === toIndex) {
          const path = [];
          let at = step;
          while (at !== fromIndex) {
            path.unshift(nodes[at].clone());
            at = cameFrom[at];
          }
          return path;
        }
        frontier.push(step);
      }
    }
    return [nodes[toIndex].clone()];
  }

  return {
    group,
    colliders: solids,
    shootables: targets,
    sites: zones,
    points: nodes,
    nearestNode: nearest,
    findPath: pathfind,
    attackSpawns: ATTACK_POINTS.map((spot) => new THREE.Vector3(spot.x, 0, spot.z)),
    defendSpawns: DEFEND_POINTS.map((spot) => new THREE.Vector3(spot.x, 0, spot.z)),
  };
}
