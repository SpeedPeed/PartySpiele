// Chiptune sound effects synthesized with WebAudio – no audio files needed.
let ctx: AudioContext | null = null;
let soundOn = true;
let vibrateOn = true;

export function setSoundEnabled(v: boolean) {
  soundOn = v;
}
export function setVibrationEnabled(v: boolean) {
  vibrateOn = v;
}

function ac(): AudioContext | null {
  if (!soundOn) return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; to?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + (opts.at ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const vol = opts.vol ?? 0.06;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.15, at = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + at;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  click: () => tone(660, 0.05, { vol: 0.04 }),
  select: () => {
    tone(523, 0.06);
    tone(784, 0.08, { at: 0.06 });
  },
  card: () => {
    noise(0.06, 0.06);
    tone(880, 0.05, { at: 0.03, vol: 0.03, type: 'triangle' });
  },
  coin: () => {
    tone(988, 0.08);
    tone(1319, 0.25, { at: 0.08 });
  },
  success: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, { at: i * 0.08 }));
  },
  fail: () => {
    tone(300, 0.18, { type: 'sawtooth', to: 120 });
    tone(150, 0.3, { at: 0.18, type: 'sawtooth', to: 60 });
  },
  tick: () => tone(1200, 0.03, { vol: 0.03, type: 'triangle' }),
  tock: () => tone(800, 0.03, { vol: 0.03, type: 'triangle' }),
  buzzer: () => tone(140, 0.6, { type: 'sawtooth', vol: 0.09 }),
  boom: () => {
    noise(0.9, 0.35);
    tone(120, 0.7, { type: 'sawtooth', to: 30, vol: 0.12 });
  },
  fanfare: () => {
    const n = [523, 523, 523, 698, 880, 784, 880, 1047];
    const d = [0.1, 0.1, 0.1, 0.3, 0.15, 0.1, 0.1, 0.45];
    let t = 0;
    n.forEach((f, i) => {
      tone(f, d[i], { at: t, vol: 0.05 });
      tone(f / 2, d[i], { at: t, vol: 0.03, type: 'triangle' });
      t += d[i];
    });
  },
  drumroll: (secs = 1.5) => {
    for (let t = 0; t < secs; t += 0.05) noise(0.04, 0.05 + (t / secs) * 0.08, t);
  },
  whoosh: () => tone(200, 0.25, { type: 'triangle', to: 1600, vol: 0.04 }),
  powerup: () => {
    for (let i = 0; i < 8; i++) tone(300 + i * 90, 0.05, { at: i * 0.04 });
  },
};

export function buzz(pattern: number | number[] = 40) {
  if (!vibrateOn) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
