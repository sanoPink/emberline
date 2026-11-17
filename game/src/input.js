// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. Edge-triggered keys (buy, grenade, weapon swaps)
// arrive through takePressed(), so main.js sees each press exactly once;
// held keys (movement, reload, plant) are read from the live set.
export function makeControls(el, onLock) {
  const held = new Set();
  const struck = new Set();
  const pad = { keys: held, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };
  // Acquiring pointer lock warps the cursor, and some browsers deliver the warp
  // as one mousemove with a huge movementX/Y. That is not the player looking:
  // ignore the first mousemove after every lock acquisition.
  let skipOne = false;

  function releaseAll() {
    held.clear();
    pad.firing = false;
    pad.aiming = false;
  }

  function trackKey(ev, isDown) {
    if (ev.code === 'Space') ev.preventDefault();
    if (isDown) {
      if (!held.has(ev.code)) struck.add(ev.code);
      held.add(ev.code);
    } else {
      held.delete(ev.code);
    }
  }

  window.addEventListener('keydown', (ev) => trackKey(ev, true));
  window.addEventListener('keyup', (ev) => trackKey(ev, false));
  window.addEventListener('blur', releaseAll);
  window.addEventListener('mousemove', (ev) => {
    if (!pad.locked) return;
    if (skipOne) {
      skipOne = false;
      return;
    }
    pad.lookX += ev.movementX;
    pad.lookY += ev.movementY;
  });
  window.addEventListener('mousedown', (ev) => {
    if (!pad.locked) return;
    if (ev.button === 0) pad.firing = true;
    if (ev.button === 2) pad.aiming = true;
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) pad.firing = false;
    if (ev.button === 2) pad.aiming = false;
  });
  window.addEventListener('contextmenu', (ev) => {
    if (pad.locked) ev.preventDefault();
  });
  function handleLockChange() {
    pad.locked = document.pointerLockElement === el;
    if (pad.locked) skipOne = true;
    if (!pad.locked) releaseAll();
    onLock(pad.locked);
  }
  document.addEventListener('pointerlockchange', handleLockChange);

  return {
    state: pad,
    requestLock: () => {
      try {
        const lockResult = el.requestPointerLock();
        if (lockResult && lockResult.catch) lockResult.catch(() => {});
      } catch {
        // A failed lock leaves the pause panel as the way back in.
      }
    },
    takeLook: () => {
      const dx = pad.lookX;
      const dy = pad.lookY;
      pad.lookX = 0;
      pad.lookY = 0;
      return { x: dx, y: dy };
    },
    takePressed: () => {
      // Return a copy: the caller must see the keys even after we reset the
      // live set for the next frame. Returning the set itself and clearing it
      // would empty the caller's copy too, and silently break every
      // edge-triggered key: G, 1/2/3, B.
      const copy = new Set([...struck]);
      struck.clear();
      return copy;
    },
  };
}
