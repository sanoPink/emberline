// The spark grenade: a thrown charge on a 1.6 s fuse. It arcs, bounces off the
// yard once or twice, then bursts — damage falls with distance, and a wall
// between the blast and a body cuts it to a quarter. The burst is a flash of
// light and an expanding shell; main.js asks for the blast and applies the damage.
import * as THREE from 'three';

const FUSE_SECS = 1.6;
const BLAST_R = 6.5;
const BLAST_CORE = 115;
const BLAST_RIM = 20;
const PULL = 14;

export function makeThrowables(scene, colliders) {
  const flying = [];
  const burstGeo = new THREE.SphereGeometry(1, 20, 14);
  const ballGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.6, metalness: 0.4 });
  const testBox = new THREE.Box3();
  const burstAt = new THREE.Vector3();
  const stepVec = new THREE.Vector3();

  function throwGrenade(at, dir, side) {
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.copy(at);
    ball.castShadow = true;
    scene.add(ball);
    const lamp = new THREE.PointLight(0xff5533, 4, 3, 2);
    ball.add(lamp);
    flying.push({
      ball, team: side,
      fly: dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
      timer: FUSE_SECS, pulse: 0,
    });
  }

  function insideSomething(pos) {
    testBox.min.set(pos.x - 0.09, pos.y - 0.09, pos.z - 0.09);
    testBox.max.set(pos.x + 0.09, pos.y + 0.09, pos.z + 0.09);
    for (const wall of colliders) {
      if (testBox.intersectsBox(wall)) return true;
    }
    return false;
  }

  // Steps all live grenades; returns the blasts that went off this step.
  function step(span) {
    const bursts = [];
    for (let i = flying.length - 1; i >= 0; i -= 1) {
      const shell = flying[i];
      shell.timer -= span;
      shell.pulse += span;
      shell.ball.children[0].intensity = shell.pulse % 0.3 < 0.15 ? 4 : 0.5;
      shell.fly.y -= PULL * span;
      const pos = shell.ball.position;
      const to = stepVec.copy(pos).addScaledVector(shell.fly, span);
      // Resolve each axis on its own, like the mover does: a bounce keeps
      // the throw alive instead of swallowing the grenade in a wall.
      if (insideSomething(new THREE.Vector3(to.x, pos.y, pos.z))) {
        shell.fly.x *= -0.35;
      } else {
        pos.x = to.x;
      }
      if (insideSomething(new THREE.Vector3(pos.x, pos.y, to.z))) {
        shell.fly.z *= -0.35;
      } else {
        pos.z = to.z;
      }
      if (insideSomething(new THREE.Vector3(pos.x, to.y, pos.z)) || to.y < 0.09) {
        if (to.y < 0.09) pos.y = 0.09;
        shell.fly.y = Math.abs(shell.fly.y) * 0.35;
        shell.fly.x *= 0.7;
        shell.fly.z *= 0.7;
      } else {
        pos.y = to.y;
      }
      if (shell.timer <= 0) {
        burstAt.copy(pos);
        const blast = new THREE.Mesh(
          burstGeo,
          new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.85, depthWrite: false }),
        );
        blast.position.copy(burstAt);
        scene.add(blast);
        const flash = new THREE.PointLight(0xff8833, 60, 22, 1.6);
        flash.position.copy(burstAt);
        scene.add(flash);
        bursts.push({ position: burstAt.clone(), team: shell.team, shell: blast, light: flash, age: 0 });
        scene.remove(shell.ball);
        flying.splice(i, 1);
      }
    }
    return bursts;
  }

  function stepBlasts(active, span) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const blast = active[i];
      blast.age += span;
      const age = blast.age / 0.55;
      blast.shell.scale.setScalar(1 + age * BLAST_R);
      blast.shell.material.opacity = Math.max(0, 0.85 * (1 - age));
      blast.light.intensity = Math.max(0, 60 * (1 - age));
      if (age >= 1) {
        scene.remove(blast.shell);
        scene.remove(blast.light);
        active.splice(i, 1);
      }
    }
  }

  function damageAt(range, walled) {
    if (range > BLAST_R) return 0;
    const base = BLAST_RIM + (BLAST_CORE - BLAST_RIM) * (1 - range / BLAST_R);
    return walled ? base * 0.25 : base;
  }

  function reset() {
    for (const shell of flying) scene.remove(shell.ball);
    flying.length = 0;
  }

  return { throwGrenade, step, stepBlasts, damageAt, blastRadius: BLAST_R, reset };
}
