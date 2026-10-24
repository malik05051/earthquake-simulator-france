// Alert sounds and spoken announcements in French or English.
// Built-in sounds are the same files as the Japan simulator (from the original Scratch project),
// mapped to the equivalent French events; the synthesised tones are only a fallback.
// Each alert can be replaced by a user-chosen audio file (stored in IndexedDB).
import { t, getLang } from './i18n.js';

let ctx = null;
let master = null;
let volume = 0.7;
let speechOn = false;

function ac() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'playback' });
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

let idleTimer = null;
function scheduleSuspend(ms) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (ctx && ctx.state === 'running') ctx.suspend(); }, ms + 1500);
}

export function setVolume(v) { volume = v; if (master) master.gain.value = v; }
export function setSpeech(on) { speechOn = on; if (!on) stopSpeech(); }

function tone(freq, start, len, { type = 'sine', gain = 0.3, glide = 0 } = {}) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (glide) o.frequency.linearRampToValueAtTime(freq + glide, c.currentTime + start + len);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + len);
  o.connect(g).connect(master);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + len + 0.05);
  return start + len;
}

// Built-in sounds: [slot, duration in ms, player]
const SYNTH = {
  eew: [1600, () => { tone(880, 0, 0.35); tone(1175, 0.2, 0.35); tone(1480, 0.4, 0.8); }],
  eewAlert: [2600, () => { for (let i = 0; i < 5; i++) { tone(1320, i * 0.5, 0.22, { type: 'square', gain: 0.14 }); tone(990, i * 0.5 + 0.25, 0.22, { type: 'square', gain: 0.14 }); } }],
  update: [400, () => tone(1046, 0, 0.2, { gain: 0.18 })],
  auto: [1400, () => { tone(523, 0, 0.5, { gain: 0.22 }); tone(659, 0.18, 0.5, { gain: 0.22 }); tone(784, 0.36, 0.9, { gain: 0.22 }); }],
  felt: [1400, () => { tone(784, 0, 0.5, { gain: 0.22 }); tone(659, 0.2, 0.9, { gain: 0.22 }); }],
  final: [1200, () => { tone(659, 0, 0.4, { gain: 0.2 }); tone(988, 0.18, 0.8, { gain: 0.2 }); }],
  eewFinal: [600, () => { tone(1175, 0, 0.25, { gain: 0.2 }); tone(880, 0.15, 0.4, { gain: 0.2 }); }],
  tsunamiInformation: [1800, () => { tone(392, 0, 0.6, { type: 'triangle' }); tone(392, 0.8, 0.6, { type: 'triangle' }); }],
  tsunamiVigilance: [2400, () => { for (let i = 0; i < 3; i++) tone(440, i * 0.7, 0.55, { type: 'triangle', glide: -40 }); }],
  tsunamiAlerte: [3600, () => { for (let i = 0; i < 4; i++) tone(330, i * 0.8, 0.7, { type: 'sawtooth', gain: 0.16, glide: 160 }); }],
  shake: [500, (k = 3) => tone(180 + k * 40, 0, 0.35, { type: 'triangle', gain: 0.18 })],
};

export const SOUND_SLOTS = [
  ['eew', 'EEW'], ['eewAlert', 'EEW !'], ['update', '↻'], ['eewFinal', 'EEW final'], ['auto', 'autoLoc'], ['felt', 'felt'], ['final', 'final'],
  ['tsunamiAlerte', 'alerte'], ['tsunamiVigilance', 'vigilance'], ['tsunamiInformation', 'information'],
];

export function slotLabel(slot) {
  const L = {
    eew: `${t('eewTitle')} (1)`, eewAlert: `${t('eewTitle')} — ${t('eewAlert')}`, update: `${t('eewTitle')} (+)`,
    eewFinal: `${t('eewTitle')} — ${t('eewFinal')}`,
    auto: t('autoLoc'), felt: t('felt'), final: t('final'),
    tsunamiAlerte: t('tsunamiTitle').alerte, tsunamiVigilance: t('tsunamiTitle').vigilance, tsunamiInformation: t('tsunamiTitle').information,
  };
  return L[slot] ?? slot;
}

// slot -> built-in file (same sounds as the Japan app)
const FILES = {
  eew: 'eew.wav', eewAlert: 'eew-warning.mp3', update: 'eew-update.mp3', eewFinal: 'eew-final.mp3',
  auto: 'info-hypocenter.mp3', felt: 'info-flash.mp3', final: 'info-detail.mp3',
  tsunamiInformation: 'tsa01.mp3', tsunamiVigilance: 'tsa02.mp3', tsunamiAlerte: 'tsa03.mp3',
};
// EMS class of new shaking -> "shaking detected" tone (III..IX and above)
const SHAKE_FILE = (k) => `newshi${Math.max(0, Math.min(6, k - 3))}.wav`;

const files = new Map(); // file -> Promise<AudioBuffer|null>
function fileBuffer(name) {
  if (!files.has(name)) {
    files.set(name, fetch(`sounds/${name}`).then((r) => r.arrayBuffer()).then((b) => ac().decodeAudioData(b)).catch(() => null));
  }
  return files.get(name);
}

const custom = new Map();

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('quakesim-fr-sounds', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sounds');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbOp(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('sounds', mode);
    const req = fn(tx.objectStore('sounds'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadCustomSounds() {
  try {
    for (const [slot] of SOUND_SLOTS) {
      const rec = await dbOp('readonly', (s) => s.get(slot));
      if (rec) custom.set(slot, { name: rec.name, buffer: await ac().decodeAudioData(await rec.blob.arrayBuffer()) });
    }
    scheduleSuspend(0);
  } catch { /* nothing stored */ }
}
export async function setCustomSound(slot, file) {
  const buffer = await ac().decodeAudioData(await file.arrayBuffer());
  await dbOp('readwrite', (s) => s.put({ name: file.name, blob: file }, slot));
  custom.set(slot, { name: file.name, buffer });
}
export async function clearCustomSound(slot) {
  await dbOp('readwrite', (s) => s.delete(slot));
  custom.delete(slot);
}
export function customSoundName(slot) { return custom.get(slot)?.name ?? null; }

let current = null;
function playBuffer(buffer, exclusive) {
  if (exclusive) { try { current?.stop(); } catch { /* already stopped */ } }
  const src = ac().createBufferSource();
  src.buffer = buffer;
  src.connect(master);
  src.start();
  if (exclusive) current = src;
  scheduleSuspend(buffer.duration * 1000);
}

export async function play(slot, arg) {
  try {
    const c = custom.get(slot);
    if (c) { playBuffer(c.buffer, true); return; }
    const file = slot === 'shake' ? SHAKE_FILE(arg ?? 3) : FILES[slot];
    const buffer = file ? await fileBuffer(file) : null;
    if (buffer) { playBuffer(buffer, slot !== 'shake'); return; }
    const s = SYNTH[slot];
    if (!s) return;
    s[1](arg);
    scheduleSuspend(s[0]);
  } catch { /* audio not available */ }
}

export function preload() {
  for (const f of Object.values(FILES)) fileBuffer(f);
  for (let k = 3; k <= 9; k++) fileBuffer(SHAKE_FILE(k));
}

// ------------------------------------------------------------------ speech
let voices = [];
function pickVoices() { voices = speechSynthesis.getVoices(); }
if ('speechSynthesis' in globalThis) { pickVoices(); speechSynthesis.onvoiceschanged = pickVoices; }

export function say(text, { interrupt = false } = {}) {
  if (!speechOn || !('speechSynthesis' in globalThis)) return;
  if (interrupt) speechSynthesis.cancel();
  const fr = getLang() === 'fr';
  const u = new SpeechSynthesisUtterance(text);
  u.lang = fr ? 'fr-FR' : 'en-GB';
  const v = voices.find((x) => x.lang.replace('_', '-').startsWith(fr ? 'fr' : 'en'));
  if (v) u.voice = v;
  u.volume = Math.min(1, volume * 1.2);
  speechSynthesis.speak(u);
}

export function stopSpeech() { if ('speechSynthesis' in globalThis) speechSynthesis.cancel(); }
