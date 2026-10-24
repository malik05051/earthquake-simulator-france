// App controller for the France simulator.
import { Simulation, VP, VS, surfaceRadius } from '../sim/engine.js';
import { PlaceNamer } from '../sim/epicenter.js';
import { CLASSES, classIndex } from '../sim/intensity.js';
import { QuakeMap } from './map.js';
import {
  eewCard, shakingCard, infoCard, deptListCard, tsunamiCard, noTsunamiCard, idleCard, historyItem, legendHtml,
  fmtTime, fmtDate, depthText,
} from './cards.js';
import {
  play, preload, say, stopSpeech, setVolume, setSpeech, SOUND_SLOTS, slotLabel, loadCustomSounds, setCustomSound,
  clearCustomSound, customSoundName,
} from './audio.js';
import { t, setLang, getLang, applyStatic } from './i18n.js';
import * as scale from './scale.js';

// Approximate parameters of notable French earthquakes and two scenarios.
const PRESETS = [
  { id: 'leteil', fr: 'Le Teil 2019 (Mw 4,9)', en: 'Le Teil 2019 (Mw 4.9)', lat: 44.518, lon: 4.671, depth: 1, mag: 4.9 },
  { id: 'laigne', fr: 'La Laigne 2023 (Mw 4,9)', en: 'La Laigne 2023 (Mw 4.9)', lat: 46.21, lon: -0.80, depth: 4, mag: 4.9 },
  { id: 'lambesc', fr: 'Lambesc 1909 (≈ M 6,0)', en: 'Lambesc 1909 (≈ M6.0)', lat: 43.65, lon: 5.40, depth: 10, mag: 6.0 },
  { id: 'arette', fr: 'Arette 1967 (≈ M 5,3)', en: 'Arette 1967 (≈ M5.3)', lat: 43.08, lon: -0.70, depth: 10, mag: 5.3 },
  { id: 'ligure', fr: 'Mer Ligure 1887 (≈ M 6,8)', en: 'Ligurian Sea 1887 (≈ M6.8)', lat: 43.70, lon: 8.05, depth: 10, mag: 6.8 },
  { id: 'bale', fr: 'Bâle 1356 (≈ M 6,6)', en: 'Basel 1356 (≈ M6.6)', lat: 47.47, lon: 7.60, depth: 12, mag: 6.6 },
  { id: 'ubaye', fr: 'Ubaye 2014 (M 4,8)', en: 'Ubaye 2014 (M4.8)', lat: 44.48, lon: 6.71, depth: 8, mag: 4.8 },
  { id: 'nice', fr: 'Scénario : large de Nice (M 7,0)', en: 'Scenario: off Nice (M7.0)', lat: 43.45, lon: 7.40, depth: 12, mag: 7.0 },
];

const $ = (id) => document.getElementById(id);
const STORE = 'quakesim-fr.v1';
const P = { lang: 'fr', scale: 'ems', volume: 0.7, speech: false, eew: true, autoswitch: true, follow: true, lowpower: false, ...load(STORE + '.prefs', {}) };
let history = load(STORE + '.history', []);

const state = {
  sim: null, quake: null, data: null, map: null,
  t: -5, playing: false, speed: 1, lastFrame: 0, lastMapUpdate: 0, lastSide: 0, lastWave: 0,
  pending: null, activeId: null, view: 'realtime', markers: true, rt: null,
  alerted: false, lastEewKey: '', shakeK: 0, loop: 0, tsunamiShownAt: -Infinity,
};
globalThis.quakeSim = state;

async function loadJson(name) { return (await fetch(`data/${name}`)).json(); }

async function init() {
  setLang(P.lang);
  scale.setScale(P.scale);
  applyStatic();
  const [stations, departements, tsunami, land, borders, towns] = await Promise.all(
    ['stations.json', 'departements.json', 'tsunami.json', 'land.json', 'borders.json', 'towns.json'].map(loadJson));
  const data = { stations: stations.stations, departements, tsunami, land, borders };
  data.namer = new PlaceNamer(towns.towns, data.stations);
  data.depByCode = new Map(departements.features.map((f) => [f.properties.code, f]));
  state.data = data;
  state.rt = new Float32Array(data.stations.length);
  state.sim = new Simulation(data);
  state.map = new QuakeMap($('map'), data);
  await state.map.ready;
  state.map.fitFrance();
  wireUi();
  applyPrefs();
  fillPresets();
  renderHistory();
  setView('realtime');
  openSetup();
  idleClock();
}

// ---------------------------------------------------------------- UI wiring
function fillPresets() {
  const sel = $('preset');
  const v = sel.value;
  sel.innerHTML = `<option value="">${t('custom')}</option>` + PRESETS.map((p) => `<option value="${p.id}">${p[getLang()]}</option>`).join('');
  sel.value = v;
}

function wireUi() {
  const sel = $('preset');
  sel.addEventListener('change', () => {
    const p = PRESETS.find((x) => x.id === sel.value);
    if (!p) return;
    $('mag').value = p.mag; $('depth').value = p.depth;
    setPending(p.lat, p.lon);
    syncSetupLabels();
    state.map.flyTo(p.lat, p.lon, p.mag);
  });
  $('mag').addEventListener('input', () => { sel.value = ''; syncSetupLabels(); });
  $('depth').addEventListener('input', () => { sel.value = ''; syncSetupLabels(); });
  $('start').addEventListener('click', startPending);
  $('setup-close').addEventListener('click', closeSetup);
  $('new-quake').addEventListener('click', () => { resetSim(); openSetup(); });
  $('reset').addEventListener('click', resetSim);

  state.map.map.on('click', (e) => {
    if (!$('setup').hidden) { $('preset').value = ''; setPending(e.lngLat.lat, e.lngLat.lng); }
  });
  state.map.map.on('moveend', () => { if (!state.playing) render(true); });

  $('play').addEventListener('click', togglePlay);
  $('replay').addEventListener('click', () => { if (state.quake) { seek(-5); setPlaying(true); } });
  $('timeline').addEventListener('input', (e) => seek(parseFloat(e.target.value)));
  for (const b of document.querySelectorAll('#speeds button')) b.addEventListener('click', () => setSpeed(parseFloat(b.dataset.speed)));
  for (const b of document.querySelectorAll('#tabs [data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
  $('btn-settings').addEventListener('click', () => { $('settings').hidden = !$('settings').hidden; if (!$('settings').hidden) closeSetup(); });
  $('settings-close').addEventListener('click', () => { $('settings').hidden = true; });
  $('btn-zin').addEventListener('click', () => state.map.map.zoomIn());
  $('btn-zout').addEventListener('click', () => state.map.map.zoomOut());
  $('btn-fit').addEventListener('click', () => state.map.fitFrance());
  $('btn-labels').addEventListener('click', () => {
    state.markers = !state.markers;
    $('btn-labels').classList.toggle('off', !state.markers);
    for (const id of ['obs', 'stations-rt']) {
      const on = state.markers && (id === 'obs' ? state.view === 'info' : state.view === 'realtime');
      state.map.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    }
  });

  $('lang').addEventListener('change', (e) => {
    P.lang = e.target.value; savePrefs(); setLang(P.lang); applyStatic();
    fillPresets(); renderSoundSlots(); renderHistory(); syncSetupLabels();
    if (state.pending) setPending(state.pending.lat, state.pending.lon);
    $('legend').innerHTML = legendHtml(state.view);
    lastCards = ''; render(true);
  });
  $('scale').addEventListener('change', (e) => {
    P.scale = e.target.value; savePrefs(); scale.setScale(P.scale);
    state.map.refreshScale();
    $('legend').innerHTML = legendHtml(state.view);
    renderHistory();
    lastCards = ''; render(true);
  });
  $('volume').addEventListener('input', (e) => { P.volume = e.target.value / 100; savePrefs(); applyPrefs(); });
  $('speech').addEventListener('change', (e) => { P.speech = e.target.checked; savePrefs(); applyPrefs(); });
  $('eew').addEventListener('change', (e) => { P.eew = e.target.checked; savePrefs(); lastCards = ''; render(true); });
  $('autoswitch').addEventListener('change', (e) => { P.autoswitch = e.target.checked; savePrefs(); });
  $('follow').addEventListener('change', (e) => { P.follow = e.target.checked; savePrefs(); });
  $('lowpower').addEventListener('change', (e) => { P.lowpower = e.target.checked; savePrefs(); });

  let pickingSlot = null;
  $('sound-slots').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const slot = b.dataset.slot;
    if (b.dataset.act === 'test') play(slot);
    if (b.dataset.act === 'pick') { pickingSlot = slot; $('sound-file').click(); }
    if (b.dataset.act === 'reset') { await clearCustomSound(slot); renderSoundSlots(); }
  });
  $('sound-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !pickingSlot) return;
    try { await setCustomSound(pickingSlot, file); toast(t('soundSet', { name: file.name })); } catch { toast(t('soundBad')); }
    renderSoundSlots();
  });
  loadCustomSounds().then(renderSoundSlots);

  $('history').addEventListener('click', (e) => { const el = e.target.closest('.hist'); if (el) openHistory(el.dataset.id); });
  $('clear-history').addEventListener('click', () => { history = []; save(STORE + '.history', history); renderHistory(); });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || (e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.key === 'n' || e.key === 'N') { resetSim(); openSetup(); }
    if (e.key === 'r' || e.key === 'R') resetSim();
    if (e.key === '1') setView('info');
    if (e.key === '2') setView('realtime');
    if (e.key === '3') setView('tsunami');
    if (e.key === 'Escape') { closeSetup(); $('settings').hidden = true; }
    if (e.key === 'ArrowRight' && state.quake) seek(state.t + 5);
    if (e.key === 'ArrowLeft' && state.quake) seek(state.t - 5);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { state.lastFrame = performance.now(); render(true); } });
}

function applyPrefs() {
  $('lang').value = P.lang;
  $('scale').value = P.scale;
  $('volume').value = Math.round(P.volume * 100);
  $('vol-val').textContent = `${Math.round(P.volume * 100)}%`;
  $('speech').checked = P.speech;
  $('eew').checked = P.eew;
  $('autoswitch').checked = P.autoswitch;
  $('follow').checked = P.follow;
  $('lowpower').checked = P.lowpower;
  setVolume(P.volume);
  setSpeech(P.speech);
}

function renderSoundSlots() {
  $('sound-slots').innerHTML = SOUND_SLOTS.map(([slot]) => {
    const name = customSoundName(slot);
    return `<div class="slot"><span>${slotLabel(slot)}</span>
      <button data-slot="${slot}" data-act="test">▶</button>
      <button data-slot="${slot}" data-act="pick">${t('choose')}</button>
      <button data-slot="${slot}" data-act="reset" ${name ? '' : 'disabled'}>${t('reset')}</button>
      <span class="file">${name ? name.replace(/[<>&]/g, '') : t('builtin')}</span></div>`;
  }).join('');
}

function syncSetupLabels() {
  const m = parseFloat($('mag').value).toFixed(1);
  $('mag-val').textContent = getLang() === 'fr' ? m.replace('.', ',') : m;
  $('depth-val').textContent = depthText(parseInt($('depth').value, 10));
}

function setPending(lat, lon) {
  state.pending = { lat, lon };
  $('setup-place').textContent = state.data.namer.label(lat, lon, getLang());
  $('setup-coords').textContent = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  $('start').disabled = false;
  state.map.setEpicenter(state.pending, { pending: true });
}

function openSetup() {
  $('setup').hidden = false;
  $('settings').hidden = true;
  document.body.classList.add('picking');
  syncSetupLabels();
}

function closeSetup() {
  $('setup').hidden = true;
  document.body.classList.remove('picking');
  if (state.quake) state.map.setEpicenter(state.quake);
  else if (!state.pending) state.map.setEpicenter(null);
}

function setView(view) {
  state.view = view;
  for (const b of document.querySelectorAll('#tabs [data-view]')) b.classList.toggle('on', b.dataset.view === view);
  state.map.setView(view);
  if (!state.markers) for (const id of ['obs', 'stations-rt']) state.map.map.setLayoutProperty(id, 'visibility', 'none');
  $('legend').innerHTML = legendHtml(view);
  lastCards = '';
  render(true);
}

function autoView(view) {
  if (!P.autoswitch || state.view === view) return;
  if (view !== 'tsunami' && state.t - state.tsunamiShownAt < 20) return;
  setView(view);
}

function startPending() {
  if (!state.pending) return;
  const q = { lat: state.pending.lat, lon: state.pending.lon, depth: parseInt($('depth').value, 10), mag: parseFloat($('mag').value), origin: Date.now() + 5000 };
  closeSetup();
  preload();
  startQuake(q, { autoplay: true });
}

function startQuake(q, { autoplay = true, seekTo = -5 } = {}) {
  stopSpeech();
  state.quake = state.sim.start(q);
  state.pending = null;
  state.map.setEpicenter(state.quake);
  $('timeline').max = state.sim.duration().toFixed(1);
  $('timeline').disabled = false;
  if (P.follow && autoplay) state.map.flyTo(q.lat, q.lon, q.mag);
  if (q.id) state.activeId = q.id;
  else { state.activeId = `q${state.quake.origin}`; addHistory(); }
  renderHistory();
  if (autoplay) setView('realtime');
  seek(seekTo);
  setPlaying(autoplay);
}

function resetSim() {
  setPlaying(false);
  stopSpeech();
  Object.assign(state, { quake: null, activeId: null, pending: null, t: -5, alerted: false, lastEewKey: '', shakeK: 0, tsunamiShownAt: -Infinity });
  state.map.setEpicenter(null);
  $('start').disabled = true;
  $('setup-place').textContent = '—';
  $('setup-coords').textContent = '—';
  $('timeline').value = -5;
  $('timeline').disabled = true;
  lastCards = '';
  renderHistory();
  render(true);
}

// ---------------------------------------------------------------- history
function addHistory() {
  const q = state.quake;
  history.unshift({ id: state.activeId, origin: q.origin, lat: q.lat, lon: q.lon, depth: q.depth, mag: q.mag, seed: q.seed, maxClass: q.maxClass });
  history = history.slice(0, 50);
  save(STORE + '.history', history);
}

function openHistory(id) {
  const h = history.find((x) => x.id === id);
  if (!h) return;
  closeSetup();
  startQuake({ ...h }, { autoplay: false, seekTo: 0 });
  seek(state.sim.duration());
  setView('info');
  state.map.flyTo(h.lat, h.lon, h.mag);
}

function renderHistory() {
  $('history').innerHTML = history.length
    ? history.map((h) => historyItem({ ...h, name: state.data.namer.label(h.lat, h.lon, getLang()) }, h.id === state.activeId)).join('')
    : `<div class="empty">${t('historyEmpty')}</div>`;
}

// ---------------------------------------------------------------- playback
function togglePlay() {
  if (!state.quake) { openSetup(); return; }
  if (!state.playing && state.t >= state.sim.duration()) seek(-5);
  setPlaying(!state.playing);
}

function setPlaying(p) {
  state.playing = p;
  $('icon-play').hidden = p;
  $('icon-pause').hidden = !p;
  if (p) { state.lastFrame = performance.now(); if (!state.loop) state.loop = requestAnimationFrame(frame); }
  else stopSpeech();
}

function setSpeed(s) {
  state.speed = s;
  for (const b of document.querySelectorAll('#speeds button')) b.classList.toggle('on', parseFloat(b.dataset.speed) === s);
}

function seek(tt) {
  if (!state.quake) return;
  state.t = Math.max(-5, Math.min(state.sim.duration(), tt));
  const e = state.sim.eewAt(state.t);
  state.alerted = !!e?.isAlert;
  state.lastEewKey = e ? eewKey(e) : '';
  state.shakeK = 0;
  state.tsunamiShownAt = -Infinity;
  stopSpeech();
  render(true);
}

function frame(now) {
  state.loop = 0;
  if (!state.playing || !state.quake) return;
  const dt = Math.min(0.25, (now - state.lastFrame) / 1000) * state.speed;
  state.lastFrame = now;
  const t0 = state.t;
  const t1 = Math.min(state.sim.duration(), t0 + dt);
  state.t = t1;
  for (const ev of state.sim.eventsBetween(t0, t1)) announce(ev);
  if (t1 >= state.sim.duration()) setPlaying(false);
  if (!document.hidden) render(false);
  if (state.playing) state.loop = requestAnimationFrame(frame);
}

function idleClock() {
  if (!state.quake) renderClock();
  setTimeout(idleClock, 1000 - (Date.now() % 1000) + 5);
}

// ---------------------------------------------------------------- rendering
function clock(tt) { return new Date(state.quake ? state.quake.origin + tt * 1000 : Date.now()); }

function render(force) {
  const now = performance.now();
  renderWaves(now, force);
  if (force || now - state.lastMapUpdate >= (P.lowpower ? 250 : 100)) { state.lastMapUpdate = now; renderMap(); }
  if (force || now - state.lastSide >= 250) { state.lastSide = now; renderClock(); renderCards(); renderTimeline(); }
}

// The P and S rings move every frame (30 fps in power-saver mode), independently of the
// slower map refresh, so they expand smoothly.
function renderWaves(now, force) {
  if (!state.quake || state.view !== 'realtime') return;
  if (!force && P.lowpower && now - state.lastWave < 33) return;
  state.lastWave = now;
  const q = state.quake;
  const t = state.t;
  const pR = t > 0 ? surfaceRadius(t, q.depth, VP) : 0;
  const sR = t > 0 ? surfaceRadius(t, q.depth, VS) : 0;
  state.map.setWaves(q, pR < 1500 ? pR : 0, sR < 1500 ? sR : 0);
}

function renderTimeline() {
  const tl = $('timeline');
  if (document.activeElement !== tl) tl.value = state.t.toFixed(1);
  const a = Math.abs(state.t);
  $('elapsed').textContent = state.quake ? `${state.t < 0 ? '−' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(Math.floor(a % 60)).padStart(2, '0')}` : '--:--';
}

function renderClock() {
  const d = clock(state.t);
  $('clock-date').textContent = fmtDate(d);
  $('clock-time').textContent = fmtTime(d);
  $('clock-tag').textContent = !state.quake ? t('idle') : state.playing ? t('simulated') : state.t >= state.sim.duration() ? t('finished') : t('paused');
}

function currentReports(tt) {
  const sim = state.sim;
  const eew = P.eew ? sim.eewAt(tt) : null;
  const info = sim.reports.filter((r) => r.at <= tt && r.type !== 'tsunami').at(-1) || null;
  const tsunami = sim.reports.find((r) => r.type === 'tsunami' && r.at <= tt) ? sim.tsunami : null;
  return { eew: eew && !(eew.isFinal && tt - eew.at > 60) ? eew : null, info, tsunami };
}

let lastCards = '';
function renderCards() {
  const ctx = { q: state.quake, sim: state.sim, clock, depByCode: state.data.depByCode, t: state.t };
  let html = '';
  if (!state.quake) {
    html = state.view === 'tsunami' ? noTsunamiCard() : idleCard();
  } else {
    const { eew, info, tsunami } = currentReports(state.t);
    if (state.view === 'realtime') {
      if (eew) html += eewCard(eew, ctx);
      html += shakingCard(state.sim.realtimeDepts(state.t), ctx);
    } else if (state.view === 'info') {
      if (info) {
        html += infoCard(info, ctx);
        if (info.type !== 'auto') html += deptListCard(state.sim.deptsAt(Infinity), ctx);
      } else {
        html += idleCard(state.t < 0 ? t('waitingQuake') : t('noReportYet'));
      }
    } else {
      html += tsunami ? tsunamiCard(tsunami, ctx, state.t) : noTsunamiCard();
    }
  }
  if (html !== lastCards) {
    const sc = $('cards').scrollTop;
    $('cards').innerHTML = html;
    $('cards').scrollTop = sc;
    lastCards = html;
  }
}

function renderMap() {
  const m = state.map;
  const sim = state.sim;
  const rt = state.rt;
  if (!state.quake) {
    rt.fill(0);
    m.setStations(rt); m.setWaves(null, 0, 0); m.setAreas(new Map(), new Map(), new Set());
    m.setTsunami(new Map()); m.setObserved([]); m.setBlink(false);
    return;
  }
  const tt = state.t;
  const q = state.quake;
  const { eew, info, tsunami } = currentReports(tt);
  m.setBlink(state.view === 'tsunami' && tsunami?.level === 'alerte');
  if (state.view === 'realtime') {
    for (let i = 0; i < rt.length; i++) rt[i] = sim.realtime(i, tt);
    m.setStations(rt);
    checkShaking();
    m.setAreas(new Map(), eew ? eew.forecast : new Map(), eew && eew.isAlert ? eew.alertAreas : new Set());
  } else {
    const felt = info && info.type !== 'auto' ? sim.deptsAt(Infinity) : new Map();
    m.setAreas(felt, new Map(), new Set());
    if (state.view === 'info') {
      const pts = [];
      if (info && info.type !== 'auto') {
        state.data.stations.forEach((s, i) => { const k = classIndex(sim.st.peak[i]); if (k >= 2) pts.push({ lat: s[0], lon: s[1], k }); });
      }
      m.setObserved(pts);
    } else {
      m.setTsunami(tsunami ? tsunami.areas : new Map());
    }
  }
}

function checkShaking() {
  if (!state.playing) return;
  let maxI = 0;
  for (let i = 0; i < state.rt.length; i++) if (state.rt[i] > maxI) maxI = state.rt[i];
  const k = classIndex(maxI);
  if (k >= 3 && k > state.shakeK) { state.shakeK = k; play('shake', k); }
}

// ---------------------------------------------------------------- announcements
function eewKey(r) { return `${r.maxClass}|${r.isAlert}|${r.alertAreas.size}`; }

function announce(ev) {
  const r = ev.report;
  const q = state.quake;
  const lang = getLang();
  const place = (lat, lon) => state.sim.label(lat, lon, lang);
  if (ev.kind === 'eew') {
    if (!P.eew) return;
    autoView('realtime');
    const key = eewKey(r);
    if (r.serial === 1) {
      play(r.isAlert ? 'eewAlert' : 'eew');
      say(t('sayEew', { place: place(r.lat, r.lon), cls: scale.spoken(scale.fromEmsClass(r.maxClass)) }), { interrupt: true });
    } else if (r.isAlert && !state.alerted) {
      play('eewAlert');
      const areas = [...r.alertAreas].slice(0, 5).map((c) => state.data.depByCode.get(c)?.properties.name).join(', ');
      say(t('sayEewAlert', { areas }), { interrupt: true });
    } else if (r.isFinal) {
      play('eewFinal');
    } else if (key !== state.lastEewKey) {
      play('update');
    }
    if (r.isAlert) state.alerted = true;
    state.lastEewKey = key;
    return;
  }
  const mag = (m) => (lang === 'fr' ? m.toFixed(1).replace('.', ',') : m.toFixed(1));
  const depth = q.depth <= 0 ? t('veryShallow') : t('km', { d: Math.round(q.depth) });
  if (ev.kind === 'auto') {
    autoView('info');
    play('auto');
    say(t('sayAuto', { mag: mag(r.mag), place: place(q.lat, q.lon), depth }));
    toast(t('autoLoc'));
  } else if (ev.kind === 'felt') {
    autoView('info');
    play('felt');
    const felt = [...state.sim.deptsAt(Infinity)].sort((a, b) => b[1] - a[1]);
    const top = felt.filter(([, k]) => k === felt[0]?.[1]).map(([c]) => state.data.depByCode.get(c)?.properties.name).slice(0, 3).join(', ');
    say(t('sayFelt', { cls: scale.spoken(scale.fromEmsClass(q.maxClass)), areas: top }));
    toast(t('felt'));
  } else if (ev.kind === 'final') {
    autoView('info');
    play('final');
    const lvl = state.sim.tsunami.level;
    say(t('sayFinal', { mag: mag(q.mag), tsunami: lvl === 'none' ? t('tsunamiNone') + '.' : t('tsunamiActive') + '.' }));
  } else if (ev.kind === 'tsunami') {
    autoView('tsunami');
    state.tsunamiShownAt = state.t;
    const ts = state.sim.tsunami;
    play({ alerte: 'tsunamiAlerte', vigilance: 'tsunamiVigilance', information: 'tsunamiInformation' }[ts.level]);
    const names = [...ts.areas].filter(([, a]) => a.level === ts.level).map(([c]) => state.data.depByCode.get(c)?.properties.name).slice(0, 4).join(', ');
    say(t('sayTsunami', { title: t('tsunamiTitle')[ts.level], areas: names, advice: t('tsunamiAdvice')[ts.level] }), { interrupt: true });
    toast(t('tsunamiTitle')[ts.level]);
  }
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function load(key, fb) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fb; } catch { return fb; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* unavailable */ } }
function savePrefs() { save(STORE + '.prefs', P); }

init().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:0;left:0;color:#f88;padding:8px">${String(err && err.stack || err)}</pre>`);
});
