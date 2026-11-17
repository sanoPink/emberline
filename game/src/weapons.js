// Weapons: the numbers the buy menu, the HUD and the bots all read. Three guns
// and one grenade, each with a job — the pistol is free and honest, the rifle is
// the workhorse, the marksman rifle rewards a still aim, the spark grenade clears
// a corner. Damage is per body part, so a head shot always matters. The view
// model is built from boxes per weapon and lives on the camera; main.js owns
// the ray that decides what a shot hits.
import * as THREE from 'three';
import { PAINT } from './palette.js';

export const ARMORY = {
  pistol: {
    price: 0,
    id: 'pistol',
    name: 'Kestrel P9',
    kind: 'Pistol',
    damage: {
      head: 80,
      torso: 26,
      leg: 20,
    },
    mag: 12,
    reserve: 48,
    fireGap: 0.17,
    reloadTime: 1.4,
    spreadStill: 0.004,
    spreadMove: 0.02,
    recoil: 0.006,
    automatic: false,
    range: 60,
  },
  rifle: {
    price: 2700,
    id: 'rifle',
    name: 'Longspur-7',
    kind: 'Rifle',
    damage: {
      head: 100,
      torso: 34,
      leg: 25,
    },
    mag: 30,
    reserve: 90,
    fireGap: 0.096,
    reloadTime: 1.9,
    spreadStill: 0.0022,
    spreadMove: 0.028,
    recoil: 0.01,
    automatic: true,
    range: 80,
  },
  dmr: {
    price: 4750,
    id: 'dmr',
    name: 'Vantage DMR',
    kind: 'Marksman',
    damage: {
      head: 200,
      torso: 80,
      leg: 60,
    },
    mag: 5,
    reserve: 20,
    fireGap: 0.85,
    reloadTime: 2.6,
    spreadStill: 0.0008,
    spreadMove: 0.035,
    recoil: 0.032,
    automatic: false,
    range: 100,
  },
};

export const NADE_COST = 300;
export const VEST_COST = 650;

// Where each view model sits on the camera, and how far it kicks back.
const REST_DEPTH = { pistol: -0.42, rifle: -0.55, dmr: -0.56 };

// One view model per gun, box-built and distinct at a glance: short and dark
// for the pistol, long with a barrel for the rifle, long with a scope for the DMR.
function buildViewModel(spec) {
  const gunmetal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.hairline), roughness: 0.7, metalness: 0.2 });
  const bone = new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.ink), roughness: 0.5, metalness: 0.35 });
  const ember = new THREE.MeshStandardMaterial({ color: new THREE.Color(PAINT.accent), roughness: 0.5, metalness: 0.2 });
  const rig = new THREE.Group();
  const part = (w, h, d, material, x = 0, y = 0, z = 0) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    piece.position.set(x, y, z);
    rig.add(piece);
    return piece;
  };
  if (spec.id === 'pistol') {
    part(0.05, 0.05, 0.22, bone);
    part(0.045, 0.11, 0.06, gunmetal, 0, -0.07, 0.08);
    rig.position.set(0.3, -0.26, -0.42);
  } else if (spec.id === 'rifle') {
    part(0.09, 0.1, 0.42, gunmetal);
    part(0.045, 0.045, 0.4, bone, 0, 0.025, -0.38);
    part(0.075, 0.08, 0.22, gunmetal, 0, -0.02, 0.08);
    part(0.03, 0.05, 0.08, ember, 0, 0.08, -0.05);
    rig.position.set(0.3, -0.26, -0.55);
  } else {
    part(0.08, 0.09, 0.55, gunmetal);
    part(0.035, 0.035, 0.55, bone, 0, 0.02, -0.5);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), ember);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.08, -0.1);
    rig.add(lens);
    part(0.07, 0.07, 0.26, gunmetal, 0, -0.02, 0.1);
    rig.position.set(0.3, -0.26, -0.56);
  }
  rig.scale.setScalar(0.55);
  rig.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = false; });
  return rig;
}

export function makeArsenal(camera) {
  const burst = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAINT.accent), transparent: true, opacity: 0.9,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  burst.position.set(0.24, -0.17, -0.95);
  burst.visible = false;
  camera.add(burst);
  const burstLight = new THREE.PointLight(new THREE.Color(PAINT.accent), 0, 5);
  burstLight.position.set(0.24, -0.16, -0.6);
  camera.add(burstLight);

  const stocks = {};
  const rigs = {};
  for (const spec of Object.values(ARMORY)) {
    stocks[spec.id] = { mag: spec.mag, reserve: spec.reserve };
    rigs[spec.id] = buildViewModel(spec);
    rigs[spec.id].visible = false;
    camera.add(rigs[spec.id]);
  }

  let active = ARMORY.pistol;
  rigs.pistol.visible = true;
  const clocks = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, zoomed: false };

  function equip(code) {
    if (!ARMORY[code] || active.id === code) return false;
    active = ARMORY[code];
    for (const id of Object.keys(rigs)) rigs[id].visible = id === code;
    clocks.reloadLeft = 0;
    clocks.cooldown = 0.25;
    clocks.kick = 0;
    return true;
  }

  // Finish a reload the moment its timer runs out: top the magazine up from
  // the reserve, and never take more than the reserve holds.
  function finishReload() {
    const cell = stocks[active.id];
    const moved = Math.min(active.mag - cell.mag, cell.reserve);
    cell.mag += moved;
    cell.reserve -= moved;
  }

  return {
    get def() { return active; },
    get mag() { return stocks[active.id].mag; },
    get reserve() { return stocks[active.id].reserve; },
    get reloading() { return clocks.reloadLeft > 0; },
    get zoomed() { return clocks.zoomed; },
    setZoomed(on) { clocks.zoomed = on; },
    equip,
    step(span) {
      clocks.cooldown = Math.max(0, clocks.cooldown - span);
      clocks.flash = Math.max(0, clocks.flash - span);
      clocks.kick += (0 - clocks.kick) * Math.min(1, span * 14);
      const rig = rigs[active.id];
      rig.position.z = REST_DEPTH[active.id] + clocks.kick;
      rig.rotation.x = clocks.kick * 2.2;
      burst.visible = clocks.flash > 0;
      burst.rotation.z = clocks.flash * 30;
      burstLight.intensity = clocks.flash > 0 ? 18 : 0;
      if (clocks.reloadLeft > 0) {
        clocks.reloadLeft = Math.max(0, clocks.reloadLeft - span);
        // Dip the barrel while the magazine is out.
        const done = (active.reloadTime - clocks.reloadLeft) / active.reloadTime;
        rig.rotation.x = -0.55 * Math.min(1, done * 2);
        if (clocks.reloadLeft === 0) finishReload();
      }
    },
    ready() {
      return stocks[active.id].mag > 0 && clocks.cooldown === 0 && clocks.reloadLeft === 0;
    },
    pullTrigger() {
      clocks.cooldown = active.fireGap;
      clocks.flash = 0.06;
      clocks.kick = active.id === 'dmr' ? 0.09 : 0.055;
    },
    takeRound() {
      const cell = stocks[active.id];
      if (cell.mag <= 0) return false;
      cell.mag -= 1;
      return true;
    },
    reload() {
      const cell = stocks[active.id];
      if (clocks.reloadLeft > 0 || cell.mag === active.mag || cell.reserve === 0) return;
      clocks.reloadLeft = active.reloadTime;
    },
    // Spread grows with ground speed: a still aim is tight, a sprint is wild.
    spread(pace) {
      return active.spreadStill + Math.min(1, pace / 5.2) * active.spreadMove;
    },
    refill() {
      for (const spec of Object.values(ARMORY)) stocks[spec.id] = { mag: spec.mag, reserve: spec.reserve };
      clocks.cooldown = 0;
      clocks.reloadLeft = 0;
      clocks.flash = 0;
      clocks.kick = 0;
    },
  };
}
