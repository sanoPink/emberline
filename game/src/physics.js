// Movement and line-of-sight, shared by the hero and every bot, so both
// sides agree about what is solid. A body is a vertical capsule approximated
// by a box of fixed radius; each axis resolves on its own, so sliding along a
// wall works and a floor always catches a falling body. The probe box and the
// scratch vector are built once here and reused — nothing is allocated while
// a body moves, which keeps the 60 Hz step cheap.
import * as THREE from 'three';

const BODY_R = 0.34;
const MAX_FALL = -30;

export function makeMover(solids) {
  const testBox = new THREE.Box3();
  const probeVec = new THREE.Vector3();

  // The box a body would occupy at (x, y, z); `lift` shrinks it a little so a
  // body standing exactly on a floor does not count as intersecting it.
  function hitBox(x, y, z, height, lift) {
    testBox.min.set(x - BODY_R, y + lift, z - BODY_R);
    testBox.max.set(x + BODY_R, y + height - lift, z + BODY_R);
    for (let i = 0; i < solids.length; i += 1) {
      if (testBox.intersectsBox(solids[i])) return solids[i];
    }
    return null;
  }

  // Step one body for span. `drive` is a unit direction on the ground plane (or
  // zero for standing still), `pace` the target ground speed, `pull` and
  // `hop` the vertical constants; a `hop` of 0 means the body never jumps.
  // unit: { position: Vector3, velocity: Vector3, height, onGround }.
  function moveBody(unit, drive, pace, span, pull, hop, hopNow) {
    const gain = unit.onGround ? 42 : 9;
    const mix = Math.min(1, (gain * span) / Math.max(pace, 0.01));
    unit.velocity.x += (drive.x * pace - unit.velocity.x) * mix;
    unit.velocity.z += (drive.z * pace - unit.velocity.z) * mix;
    if (unit.onGround && drive.x === 0 && drive.z === 0) {
      const drag = Math.max(0, 1 - 9 * span);
      unit.velocity.x *= drag;
      unit.velocity.z *= drag;
    }
    if (hopNow && unit.onGround && hop > 0) {
      unit.velocity.y = hop;
      unit.onGround = false;
    }
    unit.velocity.y -= pull * span;

    const toX = unit.position.x + unit.velocity.x * span;
    if (!hitBox(toX, unit.position.y, unit.position.z, unit.height, 0.04)) {
      unit.position.x = toX;
    } else {
      unit.velocity.x = 0;
    }
    const toZ = unit.position.z + unit.velocity.z * span;
    if (!hitBox(unit.position.x, unit.position.y, toZ, unit.height, 0.04)) {
      unit.position.z = toZ;
    } else {
      unit.velocity.z = 0;
    }

    unit.position.y += unit.velocity.y * span;
    unit.onGround = false;
    const solid = hitBox(unit.position.x, unit.position.y, unit.position.z, unit.height, 0);
    if (solid && unit.velocity.y <= 0) {
      unit.position.y = solid.max.y;
      unit.velocity.y = 0;
      unit.onGround = true;
    } else if (solid) {
      unit.position.y = solid.min.y - unit.height;
      unit.velocity.y = 0;
    }
    if (unit.position.y < 0) {
      unit.position.y = 0;
      unit.velocity.y = 0;
      unit.onGround = true;
    }
    unit.velocity.y = Math.max(MAX_FALL, unit.velocity.y);
  }

  // Cheap line-of-sight: walk the segment in 0.6 m samples; blocked when any
  // sample lands inside a collider. Bot vision and grenade cover both use it.
  function blockedBetween(from, to) {
    const count = Math.max(1, Math.ceil(from.distanceTo(to) / 0.6));
    for (let i = 1; i < count; i += 1) {
      probeVec.lerpVectors(from, to, i / count);
      for (let k = 0; k < solids.length; k += 1) {
        if (solids[k].containsPoint(probeVec)) return true;
      }
    }
    return false;
  }

  return { stepBody: moveBody, overlaps: hitBox, segmentBlocked: blockedBetween, radius: BODY_R, colliders: solids };
}
