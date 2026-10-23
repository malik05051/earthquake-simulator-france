// Earthquake simulation for metropolitan France: wave arrivals, station shaking (EMS-98),
// automatic location, felt-intensity and revised-magnitude reports, CENALT-style tsunami
// messages and an optional *fictional* early warning (France has no public EEW system).
// Everything is precomputed in start(), so state(t) can be evaluated for any time.
import { distanceKm, insideGeometry, distanceToLineKm } from './geo.js';
import { CLASSES, classIndex, predictIntensity, siteTerm } from './intensity.js';

export const VP = 6.0; // km/s
export const VS = 3.5;
const BACKGROUND = 0;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export function surfaceRadius(t, depthKm, v) {
  const r = v * t;
  return r <= depthKm ? 0 : Math.sqrt(r * r - depthKm * depthKm);
}

export class Simulation {
  /**
   * data.stations: [[lat, lon, dept, amp, network, code, site], ...]
   * data.departements / data.tsunami: GeoJSON; data.namer: PlaceNamer
   */
  constructor(data) {
    this.stations = data.stations;
    this.depts = data.departements.features;
    this.coasts = data.tsunami.features;
    this.namer = data.namer;
    this.quake = null;
  }

  isOffshore(lat, lon) {
    for (const f of this.depts) if (insideGeometry(lon, lat, f.geometry)) return false;
    return true;
  }

  start(q) {
    const quake = {
      lat: q.lat, lon: q.lon, depth: q.depth, mag: q.mag,
      origin: q.origin ?? Date.now(),
      seed: q.seed ?? Math.floor(Math.random() * 2 ** 31),
    };
    const rand = mulberry32(quake.seed);
    quake.offshore = this.isOffshore(quake.lat, quake.lon);
    this.quake = quake;

    const dur = Math.min(120, Math.max(3, 10 ** (0.5 * quake.mag - 2.0)));
    const n = this.stations.length;
    const st = { tP: new Float64Array(n), tS: new Float64Array(n), peak: new Float32Array(n), dur: new Float32Array(n), flicker: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const [lat, lon, , amp] = this.stations[i];
      const epi = distanceKm(quake.lat, quake.lon, lat, lon);
      const hyp = Math.hypot(epi, quake.depth);
      st.tP[i] = hyp / VP;
      st.tS[i] = hyp / VS;
      st.peak[i] = Math.max(0, predictIntensity(quake.mag, quake.depth, epi, amp) + 0.3 * gauss(rand));
      st.dur[i] = dur + 0.04 * hyp;
      st.flicker[i] = rand() * 6.283;
    }
    this.st = st;

    // Felt intensity per département. Stations are sparse in France, so each département
    // also gets a value predicted at its centre (as macroseismic surveys report by commune).
    const deptFinal = new Map();
    const bump = (code, k, t) => {
      if (k < 2) return;
      const prev = deptFinal.get(code);
      if (!prev || k > prev.k) deptFinal.set(code, { k, t });
    };
    for (let i = 0; i < n; i++) {
      const k = classIndex(st.peak[i]);
      bump(this.stations[i][2], k, st.tS[i]);
    }
    for (const f of this.depts) {
      const [clon, clat] = f.properties.c;
      const epi = distanceKm(quake.lat, quake.lon, clat, clon);
      const k = classIndex(predictIntensity(quake.mag, quake.depth, epi, 1.1) + 0.25 * gauss(rand));
      bump(f.properties.code, k, Math.hypot(epi, quake.depth) / VS);
    }
    // the epicentral area itself (surveys always report it, even far from any station)
    const epiDept = this.depts.find((f) => insideGeometry(quake.lon, quake.lat, f.geometry));
    if (epiDept) {
      bump(epiDept.properties.code, classIndex(predictIntensity(quake.mag, quake.depth, 0, 1.1)), quake.depth / VS);
    }
    quake.dept = epiDept ? epiDept.properties : null;
    this.deptFinal = deptFinal;
    let maxK = 0;
    for (const v of deptFinal.values()) maxK = Math.max(maxK, v.k);
    quake.maxClass = maxK > 0 ? CLASSES[maxK] : null;
    quake.epiIntensity = CLASSES[classIndex(predictIntensity(quake.mag, quake.depth, 0, 1.1))] || null;

    this.tsunami = this.computeTsunami(quake, rand);
    this.eewReports = this.scheduleEew(quake, rand, dur);
    this.reports = this.scheduleReports(quake, rand);
    this.events = [
      ...this.eewReports.map((r) => ({ kind: 'eew', at: r.at, report: r })),
      ...this.reports.map((r) => ({ kind: r.type, at: r.at, report: r })),
    ].sort((a, b) => a.at - b.at);
    return quake;
  }

  label(lat, lon, lang) { return this.namer.label(lat, lon, lang); }

  realtime(i, t) {
    const { tP, tS, peak, dur, flicker } = this.st;
    const bg = BACKGROUND + 0.25 * Math.sin(t * 1.3 + flicker[i]);
    if (t < tP[i]) return bg;
    const ip = peak[i] - 1.5;
    if (t < tS[i]) return Math.max(bg, bg + (ip - bg) * Math.min(1, (t - tP[i]) / 1.5));
    const rise = Math.min(4, dur[i] * 0.2);
    const end = tS[i] + dur[i];
    if (t < end) return Math.max(bg, ip + (peak[i] - ip) * Math.min(1, (t - tS[i]) / rise));
    return Math.max(bg, peak[i] - 1.6 * Math.log2(1 + (t - end) / 4));
  }

  observed(i, t) {
    const { tP, tS, peak, dur } = this.st;
    if (t < tP[i]) return -Infinity;
    if (t >= tS[i] + Math.min(4, dur[i] * 0.2)) return peak[i];
    return this.realtime(i, t);
  }

  // Strongest live shaking per département: [{code, i}] strongest first.
  realtimeDepts(t) {
    const m = new Map();
    for (let i = 0; i < this.stations.length; i++) {
      const v = this.realtime(i, t);
      if (v < 1.5) continue;
      const code = this.stations[i][2];
      if (!(m.get(code) >= v)) m.set(code, v);
    }
    return [...m].map(([code, i]) => ({ code, i })).sort((a, b) => b.i - a.i);
  }

  // Felt intensities known by time t (from stations and département estimates).
  deptsAt(t) {
    const m = new Map();
    for (const [code, v] of this.deptFinal) if (v.t <= t) m.set(code, v.k);
    return m;
  }

  // ---------------------------------------------------------------- fictional early warning
  scheduleEew(q, rand, dur) {
    const order = [...Array(this.stations.length).keys()].sort((a, b) => this.st.tP[a] - this.st.tP[b]);
    const detectors = order.filter((i) => this.st.peak[i] - 1.5 > 1.5);
    if (detectors.length < 3 || q.mag < 4.0) return [];
    const t1 = this.st.tP[detectors[2]] + 2.0; // sparse network: wait for 3 stations
    const offsets = [0, 2, 4, 6, 9, 13, 18, 25, 35].filter((o) => o <= Math.min(35, 10 + dur));
    const mStart = Math.min(q.mag, 4.0 + rand() * 0.5);
    const tau = 2 + 0.3 * Math.sqrt(dur);
    const err = { d: 10 + rand() * 20, b: rand() * 360 };
    const reports = [];
    let alert = false;
    offsets.forEach((o, idx) => {
      const f = Math.exp(-idx / 1.5);
      const est = shift(q.lat, q.lon, err.d * f, err.b);
      const mag = Math.round((q.mag - (q.mag - mStart) * Math.exp(-o / tau)) * 10) / 10;
      const depth = Math.max(5, Math.round(q.depth / 5) * 5);
      const forecast = new Map();
      let maxK = 0;
      for (const fr of this.depts) {
        const [clon, clat] = fr.properties.c;
        const k = classIndex(predictIntensity(mag, depth, distanceKm(est.lat, est.lon, clat, clon), 1.1));
        if (k >= 3) { forecast.set(fr.properties.code, k); maxK = Math.max(maxK, k); }
      }
      // the epicentral area is usually the strongest, even if no département centre is near it
      maxK = Math.max(maxK, classIndex(predictIntensity(mag, depth, 0, 1.1)));
      if (maxK >= 6) alert = true; // VI: first light damage
      reports.push({
        serial: idx + 1, at: t1 + o, isAlert: alert, isFinal: idx === offsets.length - 1,
        lat: est.lat, lon: est.lon, depth, mag, maxClass: maxK ? CLASSES[maxK] : null, forecast,
        alertAreas: new Set([...forecast].filter(([, k]) => k >= 5).map(([c]) => c)),
      });
    });
    return reports;
  }

  // ---------------------------------------------------------------- tsunami (CENALT-style)
  computeTsunami(q, rand) {
    const res = { level: 'none', areas: new Map(), at: 0 };
    if (q.depth > 60 || q.mag < 6.0) return res;
    let factor = 1;
    if (!q.offshore) {
      const coast = Math.min(...this.coasts.map((f) => distanceToLineKm(q.lat, q.lon, f.geometry)));
      if (q.depth > 20 || coast > 10) return res;
      factor = Math.exp(-coast / 6);
    }
    const rank = { information: 1, vigilance: 2, alerte: 3 };
    let top = 0;
    for (const f of this.coasts) {
      const d = Math.max(20, distanceToLineKm(q.lat, q.lon, f.geometry));
      const h = 10 ** (q.mag - 5.55 - Math.log10(d) - 0.003 * d) * factor * (0.8 + 0.4 * rand());
      let lvl = null;
      if (h > 1) lvl = 'alerte';
      else if (h > 0.2) lvl = 'vigilance';
      else if (h > 0.05) lvl = 'information';
      if (!lvl) continue;
      // tsunami speed ~ sqrt(g·h) on the shelf: about 150 km/h on average here
      res.areas.set(f.properties.code, { level: lvl, height: h, arrivalMin: Math.round((d / 150) * 60) });
      top = Math.max(top, rank[lvl]);
    }
    res.level = top ? ['none', 'information', 'vigilance', 'alerte'][top] : 'none';
    return res;
  }

  // ---------------------------------------------------------------- reports
  scheduleReports(q, rand) {
    const out = [];
    const order = [...this.st.tP].sort((a, b) => a - b);
    // automatic location once ~6 stations have the P wave, plus processing
    const tAuto = Math.max(45, (order[5] ?? 30) + 40);
    const magErr = Math.round((rand() - 0.5) * 4) / 10;
    out.push({ type: 'auto', at: tAuto, mag: Math.round((q.mag + magErr) * 10) / 10, magType: 'ML' });
    if (this.tsunami.level !== 'none') {
      this.tsunami.at = tAuto + 120;
      out.push({ type: 'tsunami', at: this.tsunami.at });
    }
    if (this.deptFinal.size) out.push({ type: 'felt', at: tAuto + 240 });
    out.push({ type: 'final', at: tAuto + 420, mag: q.mag, magType: 'Mw' });
    return out.sort((a, b) => a.at - b.at);
  }

  eewAt(t) {
    let cur = null;
    for (const r of this.eewReports) if (r.at <= t) cur = r;
    return cur;
  }

  eventsBetween(t0, t1) {
    return this.events.filter((e) => e.at > t0 && e.at <= t1);
  }

  duration() {
    const last = this.events.length ? this.events[this.events.length - 1].at : 60;
    return Math.max(last + 20, 120);
  }
}

function shift(lat, lon, distKm, bearingDeg) {
  const b = (bearingDeg * Math.PI) / 180;
  return {
    lat: lat + (distKm * Math.cos(b)) / 111,
    lon: lon + (distKm * Math.sin(b)) / (111 * Math.cos((lat * Math.PI) / 180)),
  };
}

export { siteTerm };
