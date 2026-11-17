// The hero's body: acceleration, friction, gravity, crouch and jump, all
// resolved through the shared mover. This module also owns the numbers that
// belong to the person rather than the gun — health, armour, money, grenades —
// and main.js reads them for the HUD and the round rules. Nothing here knows
// about rounds, bots or the buy menu.
import * as THREE from 'three';

const STAND = 1.72;
const CROUCH = 1.12;
const EYE_UP = 1.6;
const EYE_DOWN = 1.02;
const BASE_PACE = 5.2;
const LOW_PACE = 2.4;
const PULL = 20;
const JUMP = 6.2;

export function makeHero(mover, spawn) {
  const form = {
    position: new THREE.Vector3().set(spawn.x, spawn.y, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: EYE_UP,
    onGround: true,
    crouching: false,
    height: STAND,
  };
  const stats = {
    health: 100,
    armor: 0,
    money: 800,
    grenades: 0,
    alive: true,
    kills: 0,
    deaths: 0,
  };
  const drive = new THREE.Vector3();

  function look(dx, dy, sense = 0.0022) {
    form.yaw -= dx * sense;
    form.pitch = Math.max(-1.45, Math.min(1.45, form.pitch - dy * sense));
  }

  function recoil(up, side) {
    form.pitch = Math.min(1.45, form.pitch + up);
    form.yaw += side;
  }

  function setCrouch(on) {
    if (on === form.crouching) return;
    if (on) {
      form.crouching = true;
      form.height = CROUCH;
      return;
    }
    // Standing up under a low ceiling is refused: stay crouched instead.
    const jammed = mover.overlaps(form.position.x, form.position.y, form.position.z, STAND, 0.02);
    if (!jammed) {
      form.crouching = false;
      form.height = STAND;
    }
  }

  function step(span, keys) {
    if (!stats.alive) return;
    setCrouch(keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'));
    const eyeGoal = form.crouching ? EYE_DOWN : EYE_UP;
    form.eye += (eyeGoal - form.eye) * Math.min(1, span * 12);

    const advance = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    drive.set(0, 0, 0);
    if (advance !== 0 || side !== 0) {
      const s = Math.sin(form.yaw);
      const c = Math.cos(form.yaw);
      drive.set(-s * advance + c * side, 0, -c * advance - s * side);
      drive.normalize();
    }
    const pace = form.crouching ? LOW_PACE : BASE_PACE;
    mover.stepBody(form, drive, pace, span, PULL, JUMP, keys.has('Space'));
  }

  // Damage after armour: armour eats half of torso and leg hits until it runs
  // out. Head shots ignore armour entirely — the helmet is decorative.
  function damage(hit, zone) {
    if (!stats.alive) return 0;
    let hurt = hit;
    if (zone !== 'head' && stats.armor > 0) {
      const soaked = Math.min(stats.armor, hurt * 0.5);
      stats.armor -= soaked;
      hurt -= soaked;
    }
    stats.health -= hurt;
    if (stats.health <= 0) {
      stats.health = 0;
      stats.alive = false;
    }
    return hurt;
  }

  function reset(at, cash) {
    form.position.copy(at);
    form.velocity.multiplyScalar(0);
    form.yaw = 0;
    form.pitch = 0;
    form.eye = EYE_UP;
    form.height = STAND;
    form.crouching = false;
    form.onGround = true;
    stats.health = 100;
    stats.alive = true;
    stats.money = cash;
    stats.grenades = 0;
  }

  function groundSpeed() {
    return Math.hypot(form.velocity.x, form.velocity.z);
  }

  return { body: form, state: stats, step, look, recoil, damage, reset, groundSpeed };
}
