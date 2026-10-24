// MapLibre map for France: départements coloured by EMS-98 intensity, stations, wave fronts,
// coastal départements coloured by tsunami message level. Only changed data is pushed to the GPU.
import { circleRing } from '../sim/geo.js';
import { RT_RAMP } from '../sim/intensity.js';
import * as scale from './scale.js';

const maplibregl = globalThis.maplibregl;

const SEA = '#1d2633';
const LAND = '#2f343b';
const FRANCE = '#3b4148';
export const TSUNAMI_COLOR = { alerte: '#ef2f2f', vigilance: '#ff9a1f', information: '#f5d327' };

// Fill colour from the class rank stored in feature-state, for the current display scale.
const classFill = (prop) => {
  const m = ['match', ['coalesce', ['feature-state', prop], 0]];
  for (const key of scale.allKeys()) { const r = scale.rank(key); if (r > 0) m.push(r, scale.color(key)); }
  m.push(FRANCE);
  return m;
};
const depFill = () => ['case',
  ['>', ['coalesce', ['feature-state', 'k'], 0], 0], classFill('k'),
  ['>', ['coalesce', ['feature-state', 'f'], 0], 0], classFill('f'),
  FRANCE];

export class QuakeMap {
  constructor(el, data) {
    this.data = data;
    this.view = 'realtime';
    this.map = new maplibregl.Map({
      container: el,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': SEA } }] },
      center: [2.5, 46.6],
      zoom: 5,
      minZoom: 3.5,
      maxZoom: 12,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
      fadeDuration: 0,
      pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2),
    });
    this.map.touchZoomRotate.disableRotation();
    this.depState = new Map();
    this.tsuState = new Map();
    this.ready = new Promise((res) => this.map.on('load', () => { this.setup(); res(); }));
  }

  setup() {
    const m = this.map;
    const d = this.data;
    this.addIcons();
    m.addSource('land', { type: 'geojson', data: d.land });
    m.addSource('borders', { type: 'geojson', data: d.borders });
    m.addSource('dep', { type: 'geojson', data: d.departements, promoteId: 'code' });
    m.addSource('tsu', { type: 'geojson', data: d.tsunami, promoteId: 'code' });
    this.stationsGeo = {
      type: 'FeatureCollection',
      features: d.stations.map((s) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [s[1], s[0]] }, properties: { i: 0, ic: '', k: 0 },
      })),
    };
    m.addSource('stations', { type: 'geojson', data: this.stationsGeo });
    m.addSource('obs', { type: 'geojson', data: empty() });
    m.addSource('waves', { type: 'geojson', data: empty() });

    m.addLayer({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': LAND } });
    m.addLayer({ id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#5a626d', 'line-width': 0.8 } });
    m.addLayer({
      id: 'dep-fill', type: 'fill', source: 'dep',
      paint: { 'fill-color': depFill() },
    });
    m.addLayer({ id: 'dep-line', type: 'line', source: 'dep', paint: { 'line-color': '#78818c', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 9, 1.2] } });
    m.addLayer({
      id: 'alert-line', type: 'line', source: 'dep',
      paint: {
        'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 2.5],
        'line-opacity': ['case', ['boolean', ['feature-state', 'w'], false], 0.9, 0],
      },
    });
    m.addLayer({
      id: 'tsu-line', type: 'line', source: 'tsu',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['coalesce', ['feature-state', 'lvl'], ''],
          'alerte', TSUNAMI_COLOR.alerte, 'vigilance', TSUNAMI_COLOR.vigilance, 'information', TSUNAMI_COLOR.information, 'rgba(0,0,0,0)'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 9, 10],
      },
    });
    m.addLayer({
      id: 'stations', type: 'circle', source: 'stations',
      paint: { 'circle-color': RT_RAMP, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.4, 10, 6], 'circle-stroke-width': 0.6, 'circle-stroke-color': 'rgba(0,0,0,.5)' },
    });
    m.addLayer({ id: 'wave-s-fill', type: 'fill', source: 'waves', filter: ['==', ['get', 'kind'], 'S'], paint: { 'fill-color': '#ff3b30', 'fill-opacity': 0.14 } });
    m.addLayer({
      id: 'wave-line', type: 'line', source: 'waves',
      paint: { 'line-color': ['match', ['get', 'kind'], 'P', '#e8eef5', '#ff3b30'], 'line-width': ['match', ['get', 'kind'], 'S', 2.4, 1.3] },
    });
    m.addLayer({
      id: 'stations-rt', type: 'symbol', source: 'stations', filter: ['!=', ['get', 'ic'], ''],
      layout: { 'icon-image': ['get', 'ic'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.45, 10, 0.8], 'symbol-sort-key': ['-', 0, ['get', 'k']], 'icon-allow-overlap': false },
    });
    m.addLayer({
      id: 'obs', type: 'symbol', source: 'obs',
      layout: { 'icon-image': ['get', 'ic'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 0.85], 'symbol-sort-key': ['-', 0, ['get', 'k']], 'icon-allow-overlap': false, 'icon-padding': 1 },
    });
    this.setView(this.view);
  }

  // Square (observed) and round (live) intensity icons for both display scales, drawn once.
  addIcons() {
    const keep = scale.getScale();
    for (const sc of ['ems', 'jma']) {
      scale.setScale(sc);
      for (const key of scale.allKeys()) this.addIconPair(sc, key);
    }
    scale.setScale(keep);
  }

  addIconPair(sc, cls) {
    const w = 56;
    const h = 44;
    const k = scale.rank(cls);
    if (k <= 0) return;
    for (const shape of ['sq', 'ci']) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const r = shape === 'sq' ? 7 : h / 2;
      g.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(g, 1, 1, w - 2, h - 2, r); g.fill();
      g.fillStyle = scale.color(cls);
      roundRect(g, 3, 3, w - 6, h - 6, r - 2); g.fill();
      g.fillStyle = scale.text(cls);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (sc === 'ems') {
        g.font = `800 ${cls.length > 3 ? 18 : cls.length > 2 ? 21 : 25}px "Noto Serif", "Times New Roman", serif`;
        g.fillText(cls, w / 2, h / 2 + 1);
      } else if (cls.length > 1) {
        g.font = '800 26px "Noto Sans", Arial, sans-serif';
        g.fillText(cls[0], w / 2 - 5, h / 2 + 2);
        g.font = '800 17px "Noto Sans", Arial, sans-serif';
        g.fillText(cls[1] === '-' ? '−' : '+', w / 2 + 10, h / 2 - 7);
      } else {
        g.font = '800 28px "Noto Sans", Arial, sans-serif';
        g.fillText(cls, w / 2, h / 2 + 2);
      }
      this.map.addImage(`${sc}-${shape}${k}`, g.getImageData(0, 0, w, h), { pixelRatio: 2 });
    }
  }

  // Redraw everything that depends on the display scale.
  refreshScale() {
    if (!this.map.getLayer('dep-fill')) return;
    this.map.setPaintProperty('dep-fill', 'fill-color', depFill());
    this.depState.clear();
    this._obsKey = null;
    for (const f of this.stationsGeo.features) f.properties.i = NaN;
  }

  setView(view) {
    this.view = view;
    const m = this.map;
    if (!m.getLayer('stations')) return;
    const vis = (id, on) => m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    for (const id of ['stations', 'stations-rt', 'wave-line', 'wave-s-fill', 'alert-line']) vis(id, view === 'realtime');
    vis('obs', view === 'info');
    vis('tsu-line', view === 'tsunami');
    m.setPaintProperty('dep-fill', 'fill-opacity', view === 'tsunami' ? 0.35 : 1);
  }

  setStations(intensities) {
    const f = this.stationsGeo.features;
    let changed = false;
    for (let i = 0; i < f.length; i++) {
      const v = Math.round(intensities[i] * 10) / 10;
      const p = f[i].properties;
      if (p.i === v) continue;
      p.i = v;
      const key = scale.fromEms(v);
      const k = scale.rank(key);
      p.k = k;
      p.ic = key ? `${scale.getScale()}-ci${k}` : '';
      changed = true;
    }
    if (changed) this.map.getSource('stations')?.setData(this.stationsGeo);
  }

  setObserved(points) {
    const key = points.length + ':' + points.reduce((a, p) => a + p.k, 0);
    if (key === this._obsKey) return;
    this._obsKey = key;
    this.map.getSource('obs')?.setData({
      type: 'FeatureCollection',
      features: points.map((p) => {
        const key = scale.fromEmsClass(p.k);
        const k = scale.rank(key);
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { ic: key ? `${scale.getScale()}-sq${k}` : '', k } };
      }).filter((f) => f.properties.ic),
    });
  }

  setWaves(q, pR, sR) {
    const key = `${Math.round(pR)}|${Math.round(sR)}`;
    if (key === this._waveKey) return;
    this._waveKey = key;
    const feats = [];
    if (q && pR > 0) feats.push({ type: 'Feature', properties: { kind: 'P' }, geometry: { type: 'LineString', coordinates: circleRing(q.lat, q.lon, pR, 72) } });
    if (q && sR > 0) feats.push({ type: 'Feature', properties: { kind: 'S' }, geometry: { type: 'Polygon', coordinates: [circleRing(q.lat, q.lon, sR, 72)] } });
    this.map.getSource('waves')?.setData({ type: 'FeatureCollection', features: feats });
  }

  setAreas(observed, forecast, alertSet) {
    const m = this.map;
    if (!m.getSource('dep')) return;
    for (const f of this.data.departements.features) {
      const code = f.properties.code;
      // engine values are EMS classes; feature-state holds ranks in the display scale
      const k = scale.rank(scale.fromEmsClass(observed.get(code) || 0));
      const fk = scale.rank(scale.fromEmsClass(forecast.get(code) || 0));
      const w = alertSet.has(code);
      const key = `${k}|${fk}|${w}`;
      if (this.depState.get(code) === key) continue;
      this.depState.set(code, key);
      m.setFeatureState({ source: 'dep', id: code }, { k, f: fk, w });
    }
  }

  setBlink(on) {
    if (on === !!this.blinkTimer) return;
    const m = this.map;
    if (!on) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
      m.setPaintProperty('tsu-line', 'line-opacity', 1);
      return;
    }
    let lit = true;
    this.blinkTimer = setInterval(() => {
      if (document.hidden) return;
      lit = !lit;
      m.setPaintProperty('tsu-line', 'line-opacity', lit ? 1 : ['match', ['coalesce', ['feature-state', 'lvl'], ''], 'alerte', 0.12, 1]);
    }, 550);
  }

  setTsunami(areas) {
    const m = this.map;
    if (!m.getSource('tsu')) return;
    for (const f of this.data.tsunami.features) {
      const code = f.properties.code;
      const lvl = areas.get(code)?.level || '';
      if (this.tsuState.get(code) === lvl) continue;
      this.tsuState.set(code, lvl);
      m.setFeatureState({ source: 'tsu', id: code }, { lvl });
    }
  }

  setEpicenter(q, { pending = false } = {}) {
    if (!q) { this.epi?.remove(); this.epi = null; return; }
    if (!this.epi) {
      const el = document.createElement('div');
      el.className = 'epi-marker';
      el.innerHTML = '<svg viewBox="0 0 30 30"><path d="M6 6L24 24M24 6L6 24" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M6 6L24 24M24 6L6 24" stroke="#e8262b" stroke-width="5" stroke-linecap="round"/></svg>';
      this.epi = new maplibregl.Marker({ element: el }).setLngLat([q.lon, q.lat]).addTo(this.map);
    }
    this.epi.setLngLat([q.lon, q.lat]);
    this.epi.getElement().classList.toggle('pending', pending);
  }

  flyTo(lat, lon, mag) {
    const zoom = mag >= 6.5 ? 6.0 : mag >= 5.5 ? 6.8 : mag >= 4.5 ? 7.6 : 8.4;
    this.map.flyTo({ center: [lon, lat], zoom, speed: 1.4 });
  }

  fitFrance() {
    this.map.fitBounds([[-5.2, 41.3], [9.6, 51.2]], { padding: 30 });
  }
}

// Badge for a class key of the current display scale.
export function badgeHtml(cls, extra = '') {
  if (!cls) return `<span class="badge ${extra}" style="background:#3a4552;color:#cfd8e3">–</span>`;
  return `<span class="badge ${scale.fontClass()} ${extra}" style="background:${scale.color(cls)};color:${scale.text(cls)}">${scale.valueHtml(cls)}</span>`;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function empty() { return { type: 'FeatureCollection', features: [] }; }
