// Sonido de teclas, sintetizado con Web Audio (no hay archivos de audio). Apagado por defecto.
import { load, save } from './store.js';

const GAIN = { low: 0.05, high: 0.15 };
let level = ['off', 'low', 'high'].includes(load('sound', 'off')) ? load('sound', 'off') : 'off';
let ac = null;
let noise = null;

function ctx() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

function noiseBuffer(c) {
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

// Un golpe corto: ruido filtrado más un tono grave que cae
function tap(c, vol, freq, tone) {
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq * (0.9 + Math.random() * 0.2);
  band.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  src.connect(band).connect(g).connect(c.destination);
  src.start(t);
  const o = c.createOscillator();
  const og = c.createGain();
  o.frequency.setValueAtTime(tone, t);
  o.frequency.exponentialRampToValueAtTime(tone / 2, t + 0.05);
  og.gain.setValueAtTime(vol * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(og).connect(c.destination);
  o.start(t);
  o.stop(t + 0.07);
}

function note(c, vol, freq, at, len, type = 'sine') {
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

export const sound = {
  get level() { return level; },
  set(next) {
    level = next;
    save('sound', next);
    if (next !== 'off') this.play('key');
  },
  // kind: key, space, error, done
  play(kind) {
    if (level === 'off') return;
    const c = ctx();
    if (!c) return;
    const v = GAIN[level];
    if (kind === 'key') tap(c, v, 3200, 190);
    else if (kind === 'space') tap(c, v * 1.1, 2200, 130);
    else if (kind === 'error') note(c, v * 0.9, 150, 0, 0.14, 'sawtooth');
    else if (kind === 'done') { note(c, v * 1.2, 660, 0, 0.16); note(c, v * 1.2, 880, 0.11, 0.24); }
  },
};
