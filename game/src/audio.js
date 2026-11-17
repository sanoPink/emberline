// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio files and makes no network request. Effects are written as
// small step lists — [delay, kind, ...args] — and one sequencer turns them
// into noise bursts and sine pings. Silent when audio is unavailable
// (headless capture) instead of throwing.
export function makeSound() {
  let ctx = null;
  let bus = null;
  let hiss = null;
  let live = false;

  function ready() {
    if (ctx) return true;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return false;
      ctx = new AudioCtor();
      bus = ctx.createGain();
      bus.gain.value = 0.35;
      bus.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      hiss = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = hiss.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    live = true;
    if (ready() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function noise(when, len, freq, gain, type = 'lowpass') {
    const src = ctx.createBufferSource();
    src.buffer = hiss;
    const band = ctx.createBiquadFilter();
    band.type = type;
    band.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + len);
    src.connect(band).connect(amp).connect(bus);
    src.start(when);
    src.stop(when + len + 0.02);
  }

  function ping(when, hz, len, gain, type = 'sine', slide = 0) {
    const wave = ctx.createOscillator();
    wave.type = type;
    wave.frequency.setValueAtTime(hz, when);
    if (slide > 0) wave.frequency.exponentialRampToValueAtTime(slide, when + len);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + len);
    wave.connect(amp).connect(bus);
    wave.start(when);
    wave.stop(when + len + 0.02);
  }

  function run(fn) {
    // No sound before the player's first click: creating the context earlier
    // only logs a warning in a headless capture and buys nothing.
    if (!live) return;
    if (!ready() || ctx.state !== 'running') return;
    try {
      fn(ctx.currentTime);
    } catch {
      // A failed effect never fails the game.
    }
  }

  // Play a step list: each step is [delay, 'tone'|'burst', ...args] and the
  // args are passed straight to ping() / noise() after the start time.
  function chart(notes) {
    run((start) => {
      for (const note of notes) {
        const [offset, type, ...args] = note;
        if (type === 'tone') ping(start + offset, ...args);
        else noise(start + offset, ...args);
      }
    });
  }

  return {
    unlock,
    shot(tune = 1) {
      chart([
        [0, 'burst', 0.14, 2400 * tune, 0.9],
        [0, 'tone', 150 * tune, 0.1, 0.55, 'sine', 55],
      ]);
    },
    dryClick() {
      chart([[0, 'tone', 1400, 0.04, 0.3, 'square']]);
    },
    reload() {
      chart([
        [0, 'tone', 900, 0.05, 0.25, 'square'],
        [0.28, 'tone', 620, 0.05, 0.25, 'square'],
      ]);
    },
    hit() {
      chart([[0, 'tone', 2100, 0.06, 0.4, 'sine']]);
    },
    kill() {
      chart([
        [0, 'tone', 1900, 0.07, 0.4, 'sine'],
        [0.08, 'tone', 2400, 0.09, 0.4, 'sine'],
      ]);
    },
    hurt() {
      chart([
        [0, 'burst', 0.12, 700, 0.5],
        [0, 'tone', 110, 0.12, 0.4, 'sine', 70],
      ]);
    },
    plant() {
      chart([
        [0, 'tone', 880, 0.1, 0.4, 'sine'],
        [0.14, 'tone', 1320, 0.16, 0.4, 'sine'],
      ]);
    },
    explosion() {
      chart([
        [0, 'burst', 0.9, 320, 1.0],
        [0, 'tone', 90, 0.8, 0.8, 'sine', 32],
      ]);
    },
    grenadeThrow() {
      chart([[0, 'tone', 500, 0.08, 0.2, 'sine', 300]]);
    },
    roundWin() {
      chart([
        [0, 'tone', 523, 0.14, 0.4, 'triangle'],
        [0.15, 'tone', 659, 0.14, 0.4, 'triangle'],
        [0.3, 'tone', 784, 0.28, 0.45, 'triangle'],
      ]);
    },
    roundLose() {
      chart([
        [0, 'tone', 392, 0.16, 0.35, 'triangle'],
        [0.18, 'tone', 311, 0.3, 0.35, 'triangle'],
      ]);
    },
    buy() {
      chart([[0, 'tone', 1180, 0.07, 0.3, 'sine']]);
    },
  };
}
