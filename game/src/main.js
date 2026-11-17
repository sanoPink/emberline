// EMBERLINE — a round-based tactical FPS in the Cinder Quay container yard.
// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. Five attackers (you plus four bots) against five Wardens, a
// spark charge to plant at site A or B, money between rounds to buy guns,
// armour and grenades. ?shot=menu|buy|play|plant|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady.
//
// How to play: WASD move, mouse look, click fire, R reload, right mouse aims
// (the DMR zooms), Ctrl/C crouch, Space jump, B opens the buy menu during the
// buy phase, E plants or defuses the spark (hold), G throws a grenade, 1/2/3
// swap weapons.
import * as THREE from 'three';
import { PAINT } from './palette.js';
import { seededStream, drawOne } from './rng.js';
import { makeMover } from './physics.js';
import { buildYard } from './map.js';
import { makeHero } from './player.js';
import { makeSquad } from './bots.js';
import { makeArsenal, ARMORY, NADE_COST, VEST_COST } from './weapons.js';
import { makeThrowables } from './grenade.js';
import { makeEffects } from './particles.js';
import { makeMatch, MATCH } from './rounds.js';
import { makeHud } from './hud.js';
import { makeControls } from './input.js';
import { makeSound } from './audio.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const capture = params.get('shot');
const seedValue = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = seededStream(capture ? seedValue : (Date.now() % 1000000007));

const gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
gl.setSize(window.innerWidth, window.innerHeight);
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(gl.domElement);

const world = new THREE.Scene();
world.background = new THREE.Color(PAINT.canvas);
world.fog = new THREE.Fog(new THREE.Color(PAINT.canvas), 26, 60);
const cam = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
cam.rotation.order = 'YXZ';
world.add(cam);

const yard = buildYard(world);
const physics = makeMover(yard.colliders);
const sound = makeSound();
const display = makeHud();
const match = makeMatch();
const effects = makeEffects(world);
const throwables = makeThrowables(world, yard.colliders);
const arsenal = makeArsenal(cam);
const hero = makeHero(physics, yard.attackSpawns[0]);
const squad = makeSquad(world, yard, physics, rng);
const controls = makeControls(gl.domElement, lockChanged);

// The hero's hitbox: invisible to the eye, solid to a bot's ray.
const heroBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 1.72, 0.45),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
);
heroBox.userData.kind = 'player';
world.add(heroBox);

// The spark charge: a small blinking box, on the ground when dropped or planted.
const chargeMesh = new THREE.Group();
const chargeBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.32, 0.2, 0.22),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.accent), roughness: 0.5, metalness: 0.3 }),
);
const chargeLight = new THREE.PointLight(new THREE.Color(PAINT.danger), 3, 4, 2);
chargeMesh.add(chargeBody, chargeLight);
chargeMesh.visible = false;
world.add(chargeMesh);

const charge = { carrier: 'player', droppedAt: null, planted: false, site: null };
const caster = new THREE.Raycaster();
const targets = [];
const shotDir = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const tracerTip = new THREE.Vector3();
const scratchEye = new THREE.Vector3();
const aimEye = new THREE.Vector3();
const heroEye = new THREE.Vector3();

let ownedGuns = ['pistol'];
let clock = 0;
let held = false;
let acc = 0;
let prevTime = performance.now();
let plantAmt = 0;
let defuseAmt = 0;
let watchBot = null;
let blasts = [];
let targetFov = 74;

function frameCamera() {
  if (!hero.state.alive && watchBot && watchBot.alive) {
    const unit = watchBot;
    cam.position.set(unit.body.position.x, unit.body.position.y + 1.55, unit.body.position.z);
    cam.rotation.set(0, unit.yaw, 0);
    return;
  }
  const frame = hero.body;
  cam.position.set(frame.position.x, frame.position.y + frame.eye, frame.position.z);
  cam.rotation.set(frame.pitch, frame.yaw, 0);
}

function refreshHeroEye() {
  heroEye.set(hero.body.position.x, hero.body.position.y + hero.body.eye, hero.body.position.z);
}

function dropHeroAtSpawn() {
  const spawn = drawOne(rng, yard.attackSpawns);
  hero.body.position.copy(spawn);
  hero.body.velocity.set(0, 0, 0);
  hero.body.yaw = 0; // face north, into the yard
  hero.body.pitch = 0;
  watchBot = null;
  display.setSpectate(false);
}

function prepareRound() {
  const site = rng() < 0.5 ? 'A' : 'B';
  squad.loadout(match.state.round);
  squad.bots.forEach((unit, index) => {
    const spawns = unit.team === 'ember' ? yard.attackSpawns : yard.defendSpawns;
    const spawn = spawns[index % spawns.length];
    // Ember faces north into the yard, Wardens face south toward the gate.
    squad.place(unit, spawn, unit.team === 'ember' ? 0 : Math.PI);
  });
  // The hero carries the spark at round start, so no bot starts with it.
  squad.assignRoutes(site, null);
  charge.carrier = 'player';
  charge.droppedAt = null;
  charge.planted = false;
  charge.site = null;
  chargeMesh.visible = false;
  plantAmt = 0;
  defuseAmt = 0;
  throwables.reset();
  blasts = [];
  arsenal.refill();
  hero.reset(yard.attackSpawns[0], hero.state.money);
  dropHeroAtSpawn();
  display.hideBanner();
  display.setBomb(false, 0, '');
}

function beginMatch() {
  ownedGuns = ['pistol'];
  hero.state.money = MATCH.startMoney;
  match.startMatch();
  prepareRound();
  display.hideOverlay();
  display.showBuy(ownedGuns, hero.state.money);
  display.setScore(0, 0, 1);
}

function beginLive() {
  match.startLive();
  display.hideBuy();
  display.hideOverlay();
  controls.requestLock();
}

function finishRound(winner, reason) {
  if (match.state.phase !== 'live') return;
  match.endRound(winner, reason);
  const won = winner === 'ember';
  const prize = won ? MATCH.winMoney : MATCH.lossMoney;
  hero.state.money += prize;
  display.showBanner(won ? 'ROUND WON' : 'ROUND LOST', reason, won);
  display.setMoney(hero.state.money);
  if (won) sound.roundWin();
  else sound.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
}

function maybeRoundOver() {
  if (match.state.phase !== 'live') return;
  if (squad.aliveCount('warden') === 0) {
    finishRound('ember', 'All Wardens eliminated');
  } else if (squad.aliveCount('ember') === 0 && !hero.state.alive) {
    finishRound('warden', 'All Ember eliminated');
  }
}

function lockChanged(locked) {
  if (capture) return;
  if (locked) {
    display.hideOverlay();
  } else if (match.state.phase === 'live' && hero.state.alive) {
    display.showOverlay('paused');
  } else if (match.state.phase === 'menu') {
    display.showOverlay('menu');
  }
}

display.onPlay(() => {
  if (capture) return;
  sound.unlock();
  if (match.state.phase === 'menu' || match.state.phase === 'matchEnd') {
    beginMatch();
  } else if (match.state.phase === 'live') {
    controls.requestLock();
  }
});

display.onDeploy(() => {
  if (match.state.phase === 'buy') beginLive();
});

function purchase(item) {
  if (match.state.phase !== 'buy') return;
  const money = hero.state.money;
  if (item === 'rifle' || item === 'dmr') {
    const def = ARMORY[item];
    if (ownedGuns.includes(item) || money < def.price) return;
    hero.state.money -= def.price;
    ownedGuns.push(item);
    arsenal.equip(item);
    sound.buy();
  } else if (item === 'armor') {
    if (hero.state.armor >= 100 || money < VEST_COST) return;
    hero.state.money -= VEST_COST;
    hero.state.armor = 100;
    sound.buy();
  } else if (item === 'grenade') {
    if (hero.state.grenades >= 2 || money < NADE_COST) return;
    hero.state.money -= NADE_COST;
    hero.state.grenades += 1;
    sound.buy();
  }
  display.setMoney(hero.state.money);
  display.setGrenades(hero.state.grenades);
  display.showBuy(ownedGuns, hero.state.money);
}

display.onBuy((item) => purchase(item));

// --- Combat: one ray, shared by the hero's mouse and every bot's burst. ---
function castShot(origin, dir, weapon, shooter) {
  targets.length = 0;
  for (const mesh of yard.shootables) targets.push(mesh);
  for (const unit of squad.bots) {
    if (!unit.alive || unit === shooter) continue;
    targets.push(unit.torso, unit.head, unit.legs[0], unit.legs[1]);
  }
  if (shooter !== 'player' && hero.state.alive) targets.push(heroBox);
  caster.set(origin, dir);
  caster.far = weapon.range;
  const hits = caster.intersectObjects(targets, false);
  if (hits.length === 0) return null;
  return hits[0];
}

function resolveShot(hit, weapon, shooter, origin, dir, from) {
  const fallback = tracerTip.copy(origin).addScaledVector(dir, weapon.range);
  const endPoint = hit ? hit.point : fallback;
  effects.spawnTracer(from, endPoint);
  if (hit === null) return;
  effects.spawnSparks(hit.point, 6, 2.5);
  const object = hit.object;
  if (object.userData.kind === 'player') {
    const part = hit.point.y > hero.body.position.y + 1.4 ? 'head'
      : hit.point.y > hero.body.position.y + 0.6 ? 'torso' : 'leg';
    const damage = weapon.damage[part];
    hero.damage(damage, part);
    sound.hurt();
    if (!hero.state.alive) heroDown(shooter);
    return;
  }
  const unit = object.userData.bot;
  if (!unit) return;
  const part = object.userData.part;
  const damage = weapon.damage[part];
  const killed = squad.damage(unit, damage);
  const shooterName = shooter === 'player' ? 'YOU' : shooter.name;
  if (shooter === 'player') {
    display.hitMarker(killed, killed ? 4000 : 90);
    if (killed) {
      sound.kill();
      hero.state.money += MATCH.killMoney;
      hero.state.kills += 1;
      display.setMoney(hero.state.money);
    } else {
      sound.hit();
    }
  }
  if (killed) {
    display.feed(shooterName, unit.name, part === 'head');
    if (unit.hasBomb) dropCharge(unit.body.position);
    if (shooter === 'player') maybeRoundOver();
  }
}

function heroFire() {
  if (!arsenal.takeRound()) {
    sound.dryClick();
    return;
  }
  cam.getWorldDirection(shotDir);
  const spread = arsenal.spread(hero.groundSpeed()) * (arsenal.zoomed ? 0.4 : 1);
  shotDir.x += (rng() * 2 - 1) * spread;
  shotDir.y += (rng() * 2 - 1) * spread;
  shotDir.z += (rng() * 2 - 1) * spread;
  shotDir.normalize();
  world.updateMatrixWorld(true);
  refreshHeroEye();
  const hit = castShot(heroEye, shotDir, arsenal.def, 'player');
  muzzlePos.set(0.24, -0.18, -0.95);
  cam.localToWorld(muzzlePos);
  resolveShot(hit, arsenal.def, 'player', heroEye, shotDir, muzzlePos);
  arsenal.pullTrigger();
  hero.recoil(arsenal.def.recoil, (rng() * 2 - 1) * arsenal.def.recoil * 0.4);
  squad.hearShot(heroEye, 'ember', clock);
  display.setAmmo(arsenal.mag, arsenal.reserve, arsenal.def.name);
  sound.shot(arsenal.def.id === 'dmr' ? 0.7 : 1);
}

function heroDown(shooter) {
  hero.state.deaths += 1;
  display.feed(shooter === 'player' ? 'YOU' : shooter.name, 'YOU', false);
  if (charge.carrier === 'player') dropCharge(hero.body.position);
  const alive = squad.bots.filter((unit) => unit.alive && unit.team === 'ember');
  watchBot = alive.length > 0 ? drawOne(rng, alive) : null;
  display.setSpectate(true);
  if (document.pointerLockElement) document.exitPointerLock();
  maybeRoundOver();
}

function dropCharge(position) {
  charge.carrier = null;
  charge.droppedAt = position.clone();
  charge.droppedAt.y = 0.15;
  chargeMesh.position.copy(charge.droppedAt);
  chargeMesh.visible = true;
}

function plantCharge(site, byPlayer) {
  charge.planted = true;
  charge.site = site;
  charge.carrier = null;
  charge.droppedAt = null;
  match.plant(site);
  chargeMesh.position.set(yard.sites[site].center.x, 0.15, yard.sites[site].center.z);
  chargeMesh.visible = true;
  if (byPlayer) {
    hero.state.money += MATCH.plantMoney;
    display.setMoney(hero.state.money);
  }
  sound.plant();
}

function defuseCharge() {
  charge.planted = false;
  chargeMesh.visible = false;
  finishRound('warden', 'Spark defused');
}

function siteAt(position) {
  for (const key of ['A', 'B']) {
    if (yard.sites[key].zone.containsPoint(position)) return key;
  }
  return null;
}

function tossGrenade() {
  if (match.state.phase !== 'live') return;
  if (hero.state.grenades <= 0 || !hero.state.alive) return;
  hero.state.grenades -= 1;
  display.setGrenades(hero.state.grenades);
  cam.getWorldDirection(shotDir);
  refreshHeroEye();
  throwables.throwGrenade(heroEye, shotDir, 'ember');
  sound.grenadeThrow();
}

function applyBlast(blast) {
  const from = blast.position;
  for (const unit of squad.bots) {
    if (!unit.alive) continue;
    scratchEye.set(unit.body.position.x, unit.body.position.y + 1.1, unit.body.position.z);
    const dist = from.distanceTo(scratchEye);
    if (dist > throwables.blastRadius) continue;
    const blocked = physics.segmentBlocked(from, scratchEye);
    const amount = throwables.damageAt(dist, blocked);
    if (amount <= 0) continue;
    const killed = squad.damage(unit, amount);
    if (killed) {
      display.feed('YOU', unit.name, false);
      hero.state.money += MATCH.killMoney;
      hero.state.kills += 1;
      display.setMoney(hero.state.money);
      if (unit.hasBomb) dropCharge(unit.body.position);
    }
  }
  if (hero.state.alive) {
    refreshHeroEye();
    const dist = from.distanceTo(heroEye);
    if (dist <= throwables.blastRadius) {
      const blocked = physics.segmentBlocked(from, heroEye);
      const amount = throwables.damageAt(dist, blocked);
      if (amount > 0) {
        hero.damage(amount, 'torso');
        sound.hurt();
        if (!hero.state.alive) heroDown('player');
      }
    }
  }
  maybeRoundOver();
}

// --- The bot API: what bots.js is allowed to ask the world. ---
// eyeFor reuses one scratch vector: callers (fight) consume it at once,
// so no vector is allocated in the hot loop.
function eyeFor(kind, ref, out) {
  if (kind === 'player') {
    refreshHeroEye();
    return out.copy(heroEye);
  }
  return out.set(ref.body.position.x, ref.body.position.y + 1.55, ref.body.position.z);
}

const squadApi = {
  enemiesOf(unit) {
    const list = [];
    if (hero.state.alive && unit.team === 'warden') {
      refreshHeroEye();
      list.push({ eye: heroEye, kind: 'player', ref: 'player' });
    }
    for (const other of squad.bots) {
      if (!other.alive || other.team === unit.team) continue;
      list.push({ eye: other.eyeVec, kind: 'bot', ref: other });
    }
    return list;
  },
  eyeOfTarget(kind, ref) {
    return eyeFor(kind, ref, aimEye);
  },
  shootRay(origin, dir, weapon, shooter) {
    const hit = castShot(origin, dir, weapon, shooter);
    resolveShot(hit, weapon, shooter, origin, dir, origin);
    return hit;
  },
  bombSiteOf(position) {
    return siteAt(position);
  },
  plantedSite() {
    if (!charge.planted) return null;
    return { center: yard.sites[charge.site].center, site: charge.site };
  },
  onPlantTick(unit, progress) {
    display.showProgress(`${unit.name} planting the spark`, progress / MATCH.plantSeconds);
  },
  onPlanted(unit) {
    display.showProgress('', 0);
    plantCharge(siteAt(unit.body.position), false);
    display.showBanner('SPARK PLANTED', `${unit.name} planted at site ${charge.site} — hold it`, true);
  },
  onDefuseTick(unit, progress) {
    display.showProgress(`${unit.name} defusing`, progress / MATCH.defuseSeconds);
  },
  onDefused() {
    display.showProgress('', 0);
    defuseCharge();
  },
};

function tick(dt) {
  clock += dt;
  const event = match.tick(dt);
  if (event === 'buyDone' && match.state.phase === 'buy') {
    beginLive();
  } else if (event === 'timeUp') {
    finishRound('warden', charge.planted ? 'Spark fizzled' : 'Time expired — the yard holds');
  } else if (event === 'detonated') {
    finishRound('ember', 'The spark blew site ' + charge.site);
    sound.explosion();
  } else if (event === 'roundEndDone') {
    if (match.matchOver()) {
      match.state.phase = 'matchEnd';
      const won = match.state.score.ember > match.state.score.warden;
      display.showOverlay('matchEnd', `Ember ${match.state.score.ember} — ${match.state.score.warden} Wardens. ${won ? 'The yard is yours.' : 'The Wardens kept the yard.'}`);
      display.hideBuy();
    } else {
      match.startRound(match.state.round + 1, rng() < 0.5 ? 'A' : 'B');
      prepareRound();
      display.showBuy(ownedGuns, hero.state.money);
    }
  }

  if (match.state.phase === 'live') {
    hero.step(dt, controls.state.keys);
    squad.step(dt, squadApi, clock);
    // The spectator's follow target can die mid-round; pick another teammate.
    if (!hero.state.alive && watchBot && !watchBot.alive) {
      const alive = squad.bots.filter((unit) => unit.alive && unit.team === 'ember');
      watchBot = alive.length > 0 ? drawOne(rng, alive) : null;
    }
    // Bomb pickup: a dropped charge is claimed by whoever walks over it.
    if (!charge.planted && charge.droppedAt) {
      const pickUp = (position) => position.distanceTo(charge.droppedAt) < 1.4;
      if (hero.state.alive && pickUp(hero.body.position)) {
        charge.carrier = 'player';
        charge.droppedAt = null;
        chargeMesh.visible = false;
      } else {
        for (const unit of squad.bots) {
          if (unit.alive && unit.team === 'ember' && pickUp(unit.body.position)) {
            charge.carrier = unit;
            unit.hasBomb = true;
            charge.droppedAt = null;
            chargeMesh.visible = false;
            break;
          }
        }
      }
    }
    // Planting and defusing: hold E inside the zone.
    if (hero.state.alive) {
      const zone = siteAt(hero.body.position);
      if (charge.carrier === 'player' && !charge.planted && zone && controls.state.keys.has('KeyE')) {
        plantAmt += dt;
        display.showProgress('Planting the spark', plantAmt / MATCH.plantSeconds);
        if (plantAmt >= MATCH.plantSeconds) {
          plantAmt = 0;
          display.showProgress('', 0);
          plantCharge(zone, true);
          display.showBanner('SPARK PLANTED', `You planted at site ${zone} — hold it`, true);
        }
      } else if (charge.planted && zone === charge.site && controls.state.keys.has('KeyE')) {
        defuseAmt += dt;
        display.showProgress('Defusing the spark', defuseAmt / MATCH.defuseSeconds);
        if (defuseAmt >= MATCH.defuseSeconds) {
          defuseAmt = 0;
          display.showProgress('', 0);
          defuseCharge();
        }
      } else {
        plantAmt = 0;
        defuseAmt = 0;
        display.showProgress('', 0);
      }
    }
    // Grenades and their blasts.
    const freshBlasts = throwables.step(dt);
    for (const blast of freshBlasts) {
      blasts.push(blast);
      sound.explosion();
      applyBlast(blast);
    }
    throwables.stepBlasts(blasts, dt);
    arsenal.step(dt);
    effects.step(dt);
    // Blink the dropped or planted charge.
    if (chargeMesh.visible) {
      chargeLight.intensity = (Math.sin(clock * 8) > 0 ? 4 : 0.5);
    }
    maybeRoundOver();
  }

  // HUD: every setter skips an unchanged value, so this is cheap.
  display.setAmmo(arsenal.mag, arsenal.reserve, arsenal.def.name);
  display.setHealth(hero.state.health, hero.state.armor);
  display.setMoney(hero.state.money);
  display.setGrenades(hero.state.grenades);
  display.setScore(match.state.score.ember, match.state.score.warden, match.state.round || 1);
  display.setAlive(squad.aliveCount('ember') + (hero.state.alive ? 1 : 0), squad.aliveCount('warden'));
  display.setTimer(match.state.phase === 'live' || match.state.phase === 'buy' ? match.state.phaseTime : 0, charge.planted);
  display.setBomb(charge.planted, match.state.fuseLeft, charge.site ?? '');
  display.setCrosshairSpread(arsenal.spread(hero.groundSpeed()));
  heroBox.position.set(hero.body.position.x, hero.body.position.y + 0.86, hero.body.position.z);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;
  if (!held) {
    const look = controls.takeLook();
    hero.look(look.x, look.y);
    const pressed = controls.takePressed();
    if (pressed.has('Digit1')) arsenal.equip('pistol');
    if (pressed.has('Digit2') && ownedGuns.includes('rifle')) arsenal.equip('rifle');
    if (pressed.has('Digit3') && ownedGuns.includes('dmr')) arsenal.equip('dmr');
    if (pressed.has('KeyG')) tossGrenade();
    if (pressed.has('KeyB') && match.state.phase === 'buy') {
      display.showBuy(ownedGuns, hero.state.money);
    }
    if (controls.state.keys.has('KeyR')) arsenal.reload();
    const zooming = controls.state.aiming && arsenal.def.id === 'dmr' && hero.state.alive;
    arsenal.setZoomed(zooming);
    targetFov = zooming ? 40 : 74;
    if (Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 12);
      cam.updateProjectionMatrix();
    }
    if (controls.state.firing && match.state.phase === 'live' && hero.state.alive) {
      if (arsenal.ready()) {
        heroFire();
        if (!arsenal.def.automatic) controls.state.firing = false;
      }
    }
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      tick(STEP);
      acc -= STEP;
      steps += 1;
    }
    if (acc > STEP * 5) acc = 0;
    // A lock that never landed (the buy timer ran out without a click) leaves
    // a live round with a free mouse; the pause panel is the way back in.
    if (match.state.phase === 'live' && !controls.state.locked && hero.state.alive && display.overlayHidden()) {
      display.showOverlay('paused');
    }
    frameCamera();
  }
  gl.render(world, cam);
}

function settleSteps(steps) {
  for (let i = 0; i < steps; i += 1) tick(STEP);
}

function pointCamera(point) {
  const frame = hero.body;
  const dx = point.x - frame.position.x;
  const dy = point.y - (frame.position.y + frame.eye);
  const dz = point.z - frame.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  frame.yaw = Math.atan2(-dx, -dz);
  frame.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  frameCamera();
}

function renderTwice() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    frameCamera();
    gl.render(world, cam);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      held = true;
    }
  }
  requestAnimationFrame(paint);
}

function runCapture(name) {
  display.hideOverlay();
  display.hideBuy();
  if (name === 'menu') {
    match.state.phase = 'menu';
    prepareRound();
    hero.body.position.set(9, 0, 15);
    squad.bots.forEach((unit, index) => {
      const spawns = unit.team === 'ember' ? yard.attackSpawns : yard.defendSpawns;
      squad.place(unit, spawns[index % spawns.length], unit.team === 'ember' ? 0 : Math.PI);
    });
    settleSteps(10);
    pointCamera(new THREE.Vector3(0, 1.5, -6));
    display.showOverlay('menu');
  } else if (name === 'buy') {
    beginMatch();
    hero.state.money = 6000;
    purchase('rifle');
    purchase('armor');
    purchase('grenade');
    hero.body.position.set(-2, 0, 13.5);
    settleSteps(10);
    pointCamera(new THREE.Vector3(0, 1.5, -6));
    display.showBuy(ownedGuns, hero.state.money);
  } else if (name === 'play') {
    beginMatch();
    hero.state.money = 6000;
    purchase('rifle');
    match.startLive();
    display.hideBuy();
    hero.body.position.set(0, 0, 2);
    hero.body.yaw = 0;
    // Two Wardens stepped into the open mid lane, down the gap between the
    // container spines, so the volley has a clean sightline.
    const gullBot = squad.bots.find((unit) => unit.name === 'Gull');
    const mastBot = squad.bots.find((unit) => unit.name === 'Mast');
    if (gullBot) gullBot.body.position.set(1, 0, -6);
    if (mastBot) mastBot.body.position.set(3, 0, -8);
    settleSteps(30);
    // Fight: aim at each Warden in the open and fire until the frame is hot.
    for (const target of [gullBot, mastBot]) {
      if (!target || !target.alive) continue;
      scratchEye.set(target.body.position.x, target.body.position.y + 1.1, target.body.position.z);
      pointCamera(scratchEye);
      for (let volley = 0; volley < 4; volley += 1) {
        heroFire();
        settleSteps(6);
      }
      settleSteps(20);
    }
    settleSteps(24);
    // End on the Warden that went down, if one did — the kill is the story.
    const fallen = squad.bots.find((unit) => unit.team === 'warden' && !unit.alive);
    if (fallen) {
      pointCamera(new THREE.Vector3(fallen.body.position.x, 0.9, fallen.body.position.z));
    } else {
      pointCamera(new THREE.Vector3(0, 1.5, -11));
    }
  } else if (name === 'plant') {
    beginMatch();
    match.startLive();
    display.hideBuy();
    // Clear the site: move the Warden holding A to the far corner so the
    // planter is not shot mid-plant; the other four Wardens stay live, so
    // the round does not end by elimination before the plant lands.
    const siteA = new THREE.Vector3(-13, 0, -11);
    let closest = null;
    let closestDist = Infinity;
    for (const unit of squad.bots) {
      if (unit.team !== 'warden' || !unit.alive) continue;
      const gap = unit.body.position.distanceTo(siteA);
      if (gap < closestDist) { closest = unit; closestDist = gap; }
    }
    if (closest) closest.body.position.set(13, 0, 13);
    // The hero carries the spark; stand in site A and hold E through the
    // exact held-key path the live game reads.
    hero.body.position.set(-13, 0, -11);
    controls.state.keys.add('KeyE');
    settleSteps(Math.ceil(MATCH.plantSeconds * 60) + 30);
    controls.state.keys.delete('KeyE');
    settleSteps(10);
    pointCamera(new THREE.Vector3(-13, 1.2, -11));
  } else if (name === 'end') {
    beginMatch();
    hero.state.money = 6000;
    purchase('rifle');
    match.startLive();
    display.hideBuy();
    hero.body.position.set(-6, 0, 2);
    for (const unit of squad.bots) {
      if (unit.team === 'warden') squad.damage(unit, 999);
    }
    finishRound('ember', 'All Wardens eliminated');
    settleSteps(8);
    pointCamera(new THREE.Vector3(-13, 1.2, -11));
  }
  display.setScore(match.state.score.ember, match.state.score.warden, match.state.round || 1);
  display.setAlive(squad.aliveCount('ember') + (hero.state.alive ? 1 : 0), squad.aliveCount('warden'));
  display.setAmmo(arsenal.mag, arsenal.reserve, arsenal.def.name);
  display.setHealth(hero.state.health, hero.state.armor);
  display.setMoney(hero.state.money);
  display.setTimer(match.state.phaseTime, charge.planted);
  renderTwice();
}

window.addEventListener('resize', () => {
  cam.aspect = window.innerWidth / window.innerHeight;
  cam.updateProjectionMatrix();
  gl.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for playtests (not part of the game): live state, read-only.
window.__game = {
  get phase() { return match.state.phase; },
  get round() { return match.state.round; },
  get score() { return { ...match.state.score }; },
  get player() {
    return {
      alive: hero.state.alive, health: hero.state.health, money: hero.state.money,
      kills: hero.state.kills, position: hero.body.position.toArray(), yaw: hero.body.yaw,
    };
  },
  get bomb() {
    return {
      carrier: charge.carrier === 'player' ? 'player' : charge.carrier ? charge.carrier.name : null,
      dropped: !!charge.droppedAt, planted: charge.planted, site: charge.site,
    };
  },
  get bots() {
    return squad.bots.map((unit) => ({
      name: unit.name, team: unit.team, alive: unit.alive, health: unit.health,
      state: unit.state, position: unit.body.position.toArray(),
    }));
  },
  get alive() {
    return { ember: squad.aliveCount('ember') + (hero.state.alive ? 1 : 0), warden: squad.aliveCount('warden') };
  },
};

frameCamera();
refreshHeroEye();
if (capture) runCapture(capture);
else {
  display.showOverlay('menu');
  requestAnimationFrame(loop);
}
