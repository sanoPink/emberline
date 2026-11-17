// Tracers and impact sparks, pooled so a firefight never allocates. A tracer is
// a short line from muzzle to impact that fades in 80 ms; sparks are a fixed
// cloud of points, each with its own velocity, spawned in bursts. main.js calls
// spawnTracer / spawnSparks on a hit and step() every frame.
import * as THREE from 'three';

const TRACER_SLOTS = 24;
const SPARK_SLOTS = 240;

export function makeEffects(scene) {
  const rays = [];
  for (let i = 0; i < TRACER_SLOTS; i += 1) {
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const ray = new THREE.Line(shape, new THREE.LineBasicMaterial({
      color: 0xffcf7a, transparent: true, opacity: 0, depthWrite: false,
    }));
    ray.visible = false;
    ray.frustumCulled = false;
    scene.add(ray);
    rays.push({ ray, age: 1 });
  }
  let rayCursor = 0;

  const sparkPos = new Float32Array(SPARK_SLOTS * 3);
  const sparkFly = new Float32Array(SPARK_SLOTS * 3);
  const sparkAge = new Float32Array(SPARK_SLOTS);
  for (let i = 0; i < SPARK_SLOTS; i += 1) sparkPos[i * 3 + 1] = -100;
  const sparkShape = new THREE.BufferGeometry();
  sparkShape.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkPoints = new THREE.Points(sparkShape, new THREE.PointsMaterial({
    color: 0xffb347, size: 0.07, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  let sparkNext = 0;

  function spawnTracer(a, b) {
    const cell = rays[rayCursor];
    rayCursor = (rayCursor + 1) % TRACER_SLOTS;
    const ends = cell.ray.geometry.attributes.position.array;
    ends[0] = a.x;
    ends[1] = a.y;
    ends[2] = a.z;
    ends[3] = b.x;
    ends[4] = b.y;
    ends[5] = b.z;
    cell.ray.geometry.attributes.position.needsUpdate = true;
    cell.ray.visible = true;
    cell.ray.material.opacity = 0.9;
    cell.age = 0;
  }

  function spawnSparks(spot, n, pace = 3) {
    for (let k = 0; k < n; k += 1) {
      const slot = sparkNext;
      sparkNext = (sparkNext + 1) % SPARK_SLOTS;
      sparkPos[slot * 3] = spot.x;
      sparkPos[slot * 3 + 1] = spot.y;
      sparkPos[slot * 3 + 2] = spot.z;
      const angle = Math.random() * Math.PI * 2;
      const tilt = Math.random() * Math.PI;
      const power = pace * (0.4 + Math.random() * 0.8);
      sparkFly[slot * 3] = Math.sin(tilt) * Math.cos(angle) * power;
      sparkFly[slot * 3 + 1] = Math.cos(tilt) * power + 1.2;
      sparkFly[slot * 3 + 2] = Math.sin(tilt) * Math.sin(angle) * power;
      sparkAge[slot] = 0.45 + Math.random() * 0.2;
    }
    sparkShape.attributes.position.needsUpdate = true;
  }

  function step(span) {
    for (const cell of rays) {
      if (!cell.ray.visible) continue;
      cell.age += span;
      cell.ray.material.opacity = Math.max(0, 0.9 * (1 - cell.age / 0.08));
      if (cell.age >= 0.08) cell.ray.visible = false;
    }
    let touched = false;
    for (let i = 0; i < SPARK_SLOTS; i += 1) {
      if (sparkAge[i] <= 0) continue;
      sparkAge[i] -= span;
      if (sparkAge[i] <= 0) {
        sparkPos[i * 3 + 1] = -100;
      } else {
        sparkFly[i * 3 + 1] -= 9 * span;
        sparkPos[i * 3] += sparkFly[i * 3] * span;
        sparkPos[i * 3 + 1] += sparkFly[i * 3 + 1] * span;
        sparkPos[i * 3 + 2] += sparkFly[i * 3 + 2] * span;
      }
      touched = true;
    }
    if (touched) sparkShape.attributes.position.needsUpdate = true;
  }

  return { spawnTracer, spawnSparks, step };
}
