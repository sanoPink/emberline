// The bots: nine of them, four fighting beside you and five across the yard.
// Each bot walks the waypoint graph, holds its post, and fights by the same
// rules you do — line of sight, a reaction delay, burst fire with spread, and
// damage by body part. Bots hear gunshots and turn toward them, push a site
// when the spark is planted there, and the carrier plants it when it reaches a
// site. A bot's skill is a roll — reaction time, aim error, burst length — so
// no two bots shoot alike.
import * as THREE from 'three';
import { wobble, between } from './rng.js';
import { PAINT } from './palette.js';
import { ARMORY } from './weapons.js';

const EMBER_CREW = ['Ash', 'Cinder', 'Flint', 'Rook'];
const WARDEN_CREW = ['Gull', 'Mast', 'Tide', 'Buoy', 'Harbor'];
const BOT_PACE = 4.6;
const SEE_RANGE = 55;
const SEE_HALF = 1.35;
const EARSHOT = 26;
const BOT_HEALTH = 100;
const SCAN_EVERY = 0.15;

const chestGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
const skullGeo = new THREE.SphereGeometry(0.16, 14, 10);
const shinGeo = new THREE.BoxGeometry(0.2, 0.5, 0.24);
const rifleGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

function dress(team) {
  const accent = team === 'ember' ? PAINT.accent : PAINT.teal;
  return {
    torso: new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.6, metalness: 0.1 }),
    head: new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.ink), roughness: 0.5, metalness: 0.05 }),
    legs: new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.hairline), roughness: 0.85 }),
  };
}

// Turn a yaw toward a target yaw at most `rate` radians a second.
function turnTo(current, target, rate, span) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + Math.max(-rate * span, Math.min(rate * span, diff));
}

export function makeSquad(scene, map, mover, random) {
  const crew = [];
  const gaze = new THREE.Vector3();
  const toFoe = new THREE.Vector3();
  const drive = new THREE.Vector3();
  const aim = new THREE.Vector3();

  function spawnBot(team, name, index) {
    const paint = dress(team);
    const rig = new THREE.Group();
    const chest = new THREE.Mesh(chestGeo, paint.torso);
    chest.position.y = 1.06;
    const skull = new THREE.Mesh(skullGeo, paint.head);
    skull.position.y = 1.58;
    const shinL = new THREE.Mesh(shinGeo, paint.legs);
    shinL.position.set(-0.13, 0.25, 0);
    const shinR = new THREE.Mesh(shinGeo, paint.legs);
    shinR.position.set(0.13, 0.25, 0);
    const rifle = new THREE.Mesh(rifleGeo, paint.legs);
    rifle.position.set(0.2, 1.1, -0.3);
    rig.add(chest, skull, shinL, shinR, rifle);
    rig.traverse((mesh) => {
      mesh.castShadow = mesh.receiveShadow = mesh.isMesh;
    });
    scene.add(rig);

    const soldier = {
      team, name, index,
      group: rig, torso: chest, head: skull, legs: [shinL, shinR],
      body: {
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        height: 1.72,
        onGround: true,
      },
      eyeVec: new THREE.Vector3(),
      yaw: 0,
      health: BOT_HEALTH,
      alive: true,
      weapon: ARMORY.rifle,
      state: 'route', // route | hold | engage | plant | retake
      route: [],
      routeIndex: 0,
      hold: null,
      target: null,
      targetKind: null, // 'player' | 'bot'
      reactAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      strafeDir: 1,
      strafeUntil: 0,
      skill: {
        reaction: between(random, 0.32, 0.7),
        error: between(random, 0.012, 0.032),
        burst: Math.floor(3 + random() * 3),
      },
      hasBomb: false,
      plantProgress: 0,
      defuseProgress: 0,
      heard: null,
      heardAt: 0,
      visionAt: 0.03 * index,
      fall: 0,
    };
    for (const [piece, part] of [[chest, 'torso'], [skull, 'head'], [shinL, 'leg'], [shinR, 'leg']]) {
      piece.userData.bot = soldier;
      piece.userData.part = part;
    }
    crew.push(soldier);
  }

  for (let i = 0; i < 4; i += 1) spawnBot('ember', EMBER_CREW[i], i);
  for (let i = 0; i < 5; i += 1) spawnBot('warden', WARDEN_CREW[i], 4 + i);

  function place(soldier, spot, facing) {
    soldier.body.position.copy(spot);
    soldier.body.velocity.multiplyScalar(0);
    soldier.yaw = facing;
    soldier.health = BOT_HEALTH;
    soldier.alive = true;
    soldier.state = 'route';
    soldier.route = [];
    soldier.routeIndex = 0;
    soldier.target = null;
    soldier.targetKind = null;
    soldier.burstLeft = 0;
    soldier.hasBomb = false;
    soldier.plantProgress = 0;
    soldier.defuseProgress = 0;
    soldier.heard = null;
    soldier.fall = 0;
    soldier.group.rotation.set(0, facing, 0);
    soldier.group.position.set(soldier.body.position.x, soldier.body.position.y, soldier.body.position.z);
    soldier.group.visible = true;
  }

  function eyeOf(soldier, into) {
    return into.set(soldier.body.position.x, soldier.body.position.y + 1.55, soldier.body.position.z);
  }

  // Vision: the nearest visible enemy, checked on a stagger so nine bots do
  // not raycast on the same frame. An enemy counts when it is in range, inside
  // the vision cone (or very close), and no wall sits between the two eyes.
  function scanFor(soldier, api, time) {
    soldier.visionAt = time + SCAN_EVERY;
    eyeOf(soldier, gaze);
    let pick = null;
    let pickKind = null;
    let pickDist = Infinity;
    const fx = -Math.sin(soldier.yaw);
    const fz = -Math.cos(soldier.yaw);
    for (const enemy of api.enemiesOf(soldier)) {
      const range = gaze.distanceTo(enemy.eye);
      if (range > SEE_RANGE || range >= pickDist) continue;
      toFoe.copy(enemy.eye).sub(gaze);
      const align = (toFoe.x / range) * fx + (toFoe.z / range) * fz;
      if (range > 7 && align < Math.cos(SEE_HALF)) continue;
      if (mover.segmentBlocked(gaze, enemy.eye)) continue;
      pick = enemy;
      pickKind = enemy.kind;
      pickDist = range;
    }
    if (pick) {
      soldier.target = pick.ref;
      soldier.targetKind = pickKind;
      if (soldier.state !== 'engage') {
        soldier.state = 'engage';
        soldier.reactAt = time + soldier.skill.reaction;
        soldier.burstLeft = 0;
      }
    } else if (soldier.state === 'engage') {
      soldier.target = null;
      soldier.targetKind = null;
      soldier.state = soldier.route.length > 0 ? 'route' : 'hold';
    }
  }

  function walkTo(soldier, span, time) {
    if (soldier.routeIndex >= soldier.route.length) {
      soldier.state = 'hold';
      return;
    }
    const node = soldier.route[soldier.routeIndex];
    const ox = node.x - soldier.body.position.x;
    const oz = node.z - soldier.body.position.z;
    const range = Math.hypot(ox, oz);
    if (range < 0.6) {
      soldier.routeIndex += 1;
      return;
    }
    soldier.yaw = turnTo(soldier.yaw, Math.atan2(-ox, -oz), 3.2, span);
    drive.set(ox / range, 0, oz / range);
    mover.stepBody(soldier.body, drive, BOT_PACE, span, 20, 0, false);
    // A heard shot close by is cleared once the bot walks over it.
    if (soldier.heard && time - soldier.heardAt < 2.5) {
      const near = Math.hypot(soldier.heard.x - soldier.body.position.x, soldier.heard.z - soldier.body.position.z);
      if (near < 4) soldier.heard = null;
    }
  }

  function duel(soldier, span, api, time) {
    const foe = soldier.target;
    if (!foe) return;
    const targetEye = api.eyeOfTarget(soldier.targetKind, foe);
    if (!targetEye) {
      soldier.target = null;
      soldier.state = soldier.route.length > 0 ? 'route' : 'hold';
      return;
    }
    eyeOf(soldier, gaze);
    toFoe.copy(targetEye).sub(gaze);
    const range = toFoe.length();
    soldier.yaw = turnTo(soldier.yaw, Math.atan2(-toFoe.x, -toFoe.z), 4.5, span);
    // Strafe while firing, so a bot is a moving target, not a post.
    if (time > soldier.strafeUntil) {
      soldier.strafeDir = random() > 0.5 ? 1 : -1;
      soldier.strafeUntil = time + 0.5 + random() * 0.7;
    }
    const s = Math.sin(soldier.yaw);
    const c = Math.cos(soldier.yaw);
    drive.set(c * soldier.strafeDir, 0, -s * soldier.strafeDir);
    mover.stepBody(soldier.body, drive, BOT_PACE * 0.45, span, 20, 0, false);
    if (time < soldier.reactAt) return;
    if (soldier.burstLeft <= 0) {
      if (time < soldier.nextShotAt) return;
      soldier.burstLeft = soldier.skill.burst;
      soldier.nextShotAt = time + 0.9 + random() * 0.7;
    }
    if (time < soldier.nextShotAt) return;
    soldier.nextShotAt = time + soldier.weapon.fireGap;
    soldier.burstLeft -= 1;
    aim.copy(targetEye);
    if (random() < 0.22) aim.y += 0.16; // one in five shots goes for the head
    const error = soldier.skill.error * (1 + range / 40) * (1 + (soldier.body.velocity.length() / 5) * 0.8);
    aim.x += wobble(random, error * range);
    aim.y += wobble(random, error * range);
    aim.z += wobble(random, error * range);
    eyeOf(soldier, gaze);
    const ray = aim.sub(gaze).normalize();
    api.shootRay(gaze, ray, soldier.weapon, soldier);
  }

  // Send a bot along the graph toward a position.
  function route(soldier, goal) {
    const start = map.nearestNode(soldier.body.position);
    const end = map.nearestNode(goal);
    soldier.route = map.findPath(start, end);
    soldier.routeIndex = 0;
    soldier.state = 'route';
  }

  function update(soldier, span, api, time) {
    if (!soldier.alive) {
      // Fall over once, then lie still.
      if (soldier.fall < 1) {
        soldier.fall = Math.min(1, soldier.fall + span / 0.4);
        soldier.group.rotation.x = -soldier.fall * 1.45;
        soldier.group.position.y = -soldier.fall * 0.08;
      }
      return;
    }
    if (time >= soldier.visionAt) scanFor(soldier, api, time);
    // The carrier plants when it stands on a site; a defender defuses when
    // the spark is planted and it stands on that site.
    if (soldier.hasBomb && api.bombSiteOf(soldier.body.position)) {
      soldier.state = 'plant';
    }
    if (soldier.state === 'plant') {
      soldier.plantProgress += span;
      api.onPlantTick(soldier, soldier.plantProgress);
      if (soldier.plantProgress >= 3) {
        soldier.hasBomb = false;
        soldier.plantProgress = 0;
        soldier.state = 'hold';
        api.onPlanted(soldier);
      }
      return;
    }
    const spark = api.plantedSite();
    if (spark && soldier.team === 'warden') {
      soldier.state = 'retake';
      const heart = spark.center;
      if (soldier.body.position.distanceTo(heart) < 2.2) {
        soldier.defuseProgress += span;
        api.onDefuseTick(soldier, soldier.defuseProgress);
        if (soldier.defuseProgress >= 5) {
          soldier.defuseProgress = 0;
          api.onDefused(soldier);
        }
        return;
      }
      if (soldier.routeIndex >= soldier.route.length) route(soldier, heart);
      walkTo(soldier, span, time);
      return;
    }
    if (soldier.state === 'engage') {
      duel(soldier, span, api, time);
      return;
    }
    if (soldier.state === 'route') {
      walkTo(soldier, span, time);
      return;
    }
    // Hold: face the site's approach, and listen for gunfire.
    if (soldier.hold) {
      toFoe.copy(soldier.hold.look).sub(soldier.body.position);
      soldier.yaw = turnTo(soldier.yaw, Math.atan2(-toFoe.x, -toFoe.z), 2, span);
    }
    if (soldier.heard && time - soldier.heardAt < 2.5) {
      route(soldier, soldier.heard);
      soldier.heard = null;
    }
  }

  function sync(soldier) {
    soldier.group.position.set(soldier.body.position.x, soldier.body.position.y, soldier.body.position.z);
    if (soldier.alive) soldier.group.rotation.y = soldier.yaw;
    soldier.eyeVec.set(soldier.body.position.x, soldier.body.position.y + 1.55, soldier.body.position.z);
  }

  return {
    bots: crew,
    place,
    loadout(number) {
      for (const soldier of crew) {
        const roll = random();
        if (number <= 1) soldier.weapon = roll < 0.3 ? ARMORY.rifle : ARMORY.pistol;
        else if (number <= 3) soldier.weapon = roll < 0.8 ? ARMORY.rifle : ARMORY.pistol;
        else soldier.weapon = roll < 0.12 ? ARMORY.dmr : ARMORY.rifle;
      }
    },
    assignRoutes(key, holder) {
      const site = map.sites[key];
      const siteStop = map.nearestNode(site.center);
      for (const soldier of crew) {
        if (!soldier.alive) continue;
        if (soldier.team === 'ember') {
          const start = map.nearestNode(soldier.body.position);
          soldier.route = map.findPath(start, siteStop);
          soldier.routeIndex = 0;
          soldier.state = 'route';
          soldier.hasBomb = soldier === holder;
        } else {
          // Wardens split across the holds near the chosen site.
          const holds = key === 'A' ? [20, 21, 22, 26] : [23, 24, 25, 27];
          const hold = holds[soldier.index % holds.length];
          const start = map.nearestNode(soldier.body.position);
          soldier.route = map.findPath(start, hold);
          soldier.routeIndex = 0;
          soldier.state = 'route';
          const siteLook = map.points[siteStop];
          const midLook = map.points[soldier.index % 5];
          soldier.hold = { look: soldier.index % 2 === 0 ? siteLook : midLook };
        }
      }
    },
    hearShot(spot, side, time) {
      for (const soldier of crew) {
        if (!soldier.alive || soldier.team === side) continue;
        if (soldier.body.position.distanceTo(spot) > EARSHOT) continue;
        soldier.heard = spot.clone();
        soldier.heardAt = time;
      }
    },
    damage(soldier, hurt) {
      if (!soldier.alive) return false;
      soldier.health -= hurt;
      if (soldier.health > 0) return false;
      soldier.health = 0;
      soldier.alive = false;
      soldier.target = null;
      soldier.fall = 0;
      return true;
    },
    aliveCount(side) {
      let tally = 0;
      for (const soldier of crew) if (soldier.alive && soldier.team === side) tally += 1;
      return tally;
    },
    step(span, api, time) {
      for (const soldier of crew) {
        update(soldier, span, api, time);
        sync(soldier);
      }
    },
  };
}
