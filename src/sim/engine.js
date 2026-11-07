// Earthquake simulation for metropolitan France: wave arrivals, station shaking (EMS-98),
// automatic location, felt-intensity and revised-magnitude reports, CENALT-style tsunami
// messages and an optional *fictional* early warning (France has no public EEW system).
// Everything is precomputed in start(), so state(t) can be evaluated for any time.
import { distanceKm, insideGeometry } from './geo.js';
import { propagate, coastalForecast, estimateStrike } from './tsunami.js';
import { CLASSES, classIndex, predictIntensity, intensityAt, siteTerm } from './intensity.js';
import { faultModel, faultDistance } from './ground.js';

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

// Rupture style: deep quakes are in a slab, great offshore ones are treated as a
// subduction-type rupture (e.g. the Gorringe bank / Lisbon 1755 source), the rest are crustal.
function sourceType(q) {
  return q.depth >= 60 ? 'intraslab' : q.offshore && q.mag >= 7.8 ? 'interplate' : 'crustal';
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
    this.grid = data.depth ?? null; // DepthGrid for the tsunami model
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
      strike: q.strike, dip: q.dip, length: q.length,
      origin: q.origin ?? Date.now(),
      seed: q.seed ?? Math.floor(Math.random() * 2 ** 31),
    };
    const rand = mulberry32(quake.seed);
    quake.offshore = this.isOffshore(quake.lat, quake.lon);
    quake.type = sourceType(quake);
    this.quake = quake;

    // Finite rupture, oriented along the coast / depth contours unless the preset says otherwise.
    const strike = quake.strike ?? (this.grid ? estimateStrike(this.grid, quake.lat, quake.lon, 80) / (Math.PI / 180) : 45);
    const fault = faultModel(quake, quake.type, strike);
    quake.fault = { L: fault.L, W: fault.W, strike: ((strike % 360) + 360) % 360, top: fault.top };

    const dur = Math.min(120, Math.max(3, 10 ** (0.5 * Math.min(quake.mag, 9.6) - 2.0)));
    const n = this.stations.length;
    const st = { tP: new Float64Array(n), tS: new Float64Array(n), peak: new Float32Array(n), dur: new Float32Array(n), flicker: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const [lat, lon, , amp] = this.stations[i];
      const { rrup, epi } = faultDistance(fault, lat, lon);
      const hyp = Math.hypot(epi, quake.depth);
      st.tP[i] = hyp / VP;
      st.tS[i] = hyp / VS;
      st.peak[i] = Math.max(0, intensityAt(quake.mag, rrup, amp) + 0.3 * gauss(rand));
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
      const { rrup, epi } = faultDistance(fault, clat, clon);
      const k = classIndex(intensityAt(quake.mag, rrup, 1.1) + 0.25 * gauss(rand));
      bump(f.properties.code, k, Math.hypot(epi, quake.depth) / VS);
    }
    // the epicentral area itself (surveys always report it, even far from any station)
    const epiDept = this.depts.find((f) => insideGeometry(quake.lon, quake.lat, f.geometry));
    if (epiDept) {
      bump(epiDept.properties.code, classIndex(intensityAt(quake.mag, faultDistance(fault, quake.lat, quake.lon).rrup, 1.1)), quake.depth / VS);
    }
    quake.dept = epiDept ? epiDept.properties : null;
    this.deptFinal = deptFinal;
    let maxK = 0;
    for (const v of deptFinal.values()) maxK = Math.max(maxK, v.k);
    quake.maxClass = maxK > 0 ? CLASSES[maxK] : null;
    quake.epiIntensity = CLASSES[classIndex(intensityAt(quake.mag, faultDistance(fault, quake.lat, quake.lon).rrup, 1.1))] || null;

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
  // Heights (m) and arrivals come from the tsunami model (src/sim/tsunami.js). Message levels
  // by expected height at the coast: alerte > 1 m, vigilance > 0.2 m, information > 0.05 m.
  computeTsunami(q, rand) {
    const res = { level: 'none', areas: new Map(), at: 0, maxHeight: 0, field: null, obs: [] };
    // French and Mediterranean faults are mostly crustal; only a great offshore event is treated
    // as a subduction-type rupture (e.g. the Gorringe bank / Lisbon 1755 source)
    const type = q.type;
    const model = this.grid ? propagate(this.grid, { lat: q.lat, lon: q.lon, depth: q.depth, mag: q.mag, type }) : null;
    if (!model) return res;
    res.field = model;
    const rank = { information: 1, vigilance: 2, alerte: 3 };
    let top = 0;
    for (const [code, v] of coastalForecast(this.grid, model, this.coasts)) {
      const h = v.height;
      let lvl = null;
      if (h > 1) lvl = 'alerte';
      else if (h > 0.2) lvl = 'vigilance';
      else if (h > 0.05) lvl = 'information';
      if (!lvl) continue;
      res.areas.set(code, { level: lvl, height: h, arrivalS: v.arrivalS, arrivalMin: Math.round(v.arrivalS / 60) });
      res.maxHeight = Math.max(res.maxHeight, h);
      top = Math.max(top, rank[lvl]);
      // simulated tide-gauge record: first wave at the arrival time, highest wave 10-25 min
      // later, measured within about ±25 % of the estimate
      if (h >= 0.1) {
        res.obs.push({ code, firstAt: v.arrivalS, peakAt: v.arrivalS + 600 + 900 * rand(), height: h * (0.75 + 0.5 * rand()) });
      }
    }
    res.level = top ? ['none', 'information', 'vigilance', 'alerte'][top] : 'none';
    return res;
  }

  // Observed values known at time t for a département: { first (s), peak (m) | null }.
  tsunamiObservedAt(code, t) {
    const o = this.tsunami.obs.find((x) => x.code === code);
    if (!o || t < o.firstAt) return null;
    return { first: o.firstAt, peak: t >= o.peakAt ? o.height : null, peakAt: o.peakAt };
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
    // tide-gauge observation messages: every 5 minutes while new maxima are measured, for up to
    // 3 hours after the earthquake
    if (this.tsunami.level !== 'none') {
      const peaks = this.tsunami.obs.filter((o) => o.peakAt <= 3 * 3600).sort((a, b) => a.peakAt - b.peakAt);
      let batch = [];
      let until = -1;
      for (const o of peaks) {
        if (o.peakAt > until && batch.length) { out.push({ type: 'tsunamiObs', at: Math.max(until, this.tsunami.at + 30), codes: batch }); batch = []; }
        if (!batch.length) until = Math.ceil(o.peakAt / 300) * 300;
        batch.push(o.code);
      }
      if (batch.length) out.push({ type: 'tsunamiObs', at: Math.max(until, this.tsunami.at + 30), codes: batch });
    }
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
