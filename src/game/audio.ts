/** Procedural SFX + a quiet pentatonic bed. Unlocks on first gesture. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let music: GainNode | null = null;
let sfx: GainNode | null = null;
let musicTimer: number | null = null;
let muted = false;
const musicOn = true;

export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    music = ctx.createGain();
    sfx = ctx.createGain();
    music.gain.value = 0.12;
    sfx.gain.value = 0.28;
    master.gain.value = muted ? 0 : 0.7;
    music.connect(master);
    sfx.connect(master);
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx?.state === "suspended") void ctx.resume();
  });
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.7, ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.2, detune = 0): void {
  if (!ctx || !sfx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq * (1 + (Math.random() * 2 - 1) * 0.02);
  o.detune.value = detune;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g);
  g.connect(sfx);
  o.start();
  o.stop(ctx.currentTime + dur + 0.02);
}

export const sfxPlay = {
  confirm: () => beep(520, 0.06, "square", 0.12),
  cancel: () => beep(220, 0.08, "square", 0.1),
  menu: () => beep(390, 0.04, "square", 0.08),
  hit: () => beep(180, 0.1, "sawtooth", 0.16),
  crit: () => {
    beep(520, 0.08, "square", 0.14);
    beep(780, 0.12, "square", 0.1);
  },
  heal: () => beep(660, 0.14, "sine", 0.12),
  catch: () => {
    beep(392, 0.08, "triangle", 0.12);
    beep(523, 0.1, "triangle", 0.1);
    beep(659, 0.16, "triangle", 0.1);
  },
  fail: () => beep(110, 0.2, "sawtooth", 0.12),
  faint: () => beep(90, 0.3, "triangle", 0.14),
  step: () => beep(90 + Math.random() * 20, 0.03, "square", 0.04),
  encounter: () => {
    beep(330, 0.08, "square", 0.14);
    beep(220, 0.12, "square", 0.12);
  },
  save: () => beep(523, 0.2, "sine", 0.12),
  level: () => {
    beep(392, 0.08, "square", 0.1);
    beep(523, 0.1, "square", 0.1);
    beep(784, 0.18, "square", 0.1);
  },
};

const SCALE = [196, 220, 247, 294, 330, 392, 440];

export function startMusic(): void {
  if (!ctx || !music || musicTimer != null || !musicOn) return;
  const tick = () => {
    if (!ctx || !music || muted) {
      musicTimer = window.setTimeout(tick, 900);
      return;
    }
    const now = ctx.currentTime;
    const note = SCALE[Math.floor(Math.random() * SCALE.length)]!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = note / 2;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    o.connect(g);
    g.connect(music);
    o.start(now);
    o.stop(now + 1.5);
    if (Math.random() < 0.5) {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.value = note;
      g2.gain.setValueAtTime(0.0001, now + 0.15);
      g2.gain.exponentialRampToValueAtTime(0.05, now + 0.2);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      o2.connect(g2);
      g2.connect(music);
      o2.start(now + 0.15);
      o2.stop(now + 1);
    }
    musicTimer = window.setTimeout(tick, 700 + Math.random() * 500);
  };
  tick();
}

export function stopMusic(): void {
  if (musicTimer != null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}
