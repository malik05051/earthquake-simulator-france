// EMS-98 macroseismic intensity helpers for France.
//
// Intensity prediction equation of the form used for metropolitan France by Bakun & Scotti
// (2006) and Baumont et al. (2018):
//   I = c1 + c2·Mw − 3.5·log10(R) − γ·R
// with the geometric spreading β = −3.5 adopted for mainland France. R is the distance to the
// finite rupture (ground.js) with a near-source term that grows with magnitude, so large
// quakes saturate near the fault instead of reaching impossible values. c1 and c2 are fitted
// to the epicentral intensities of Le Teil 2019, La Laigne 2023, Arette 1967, Lambesc 1909
// and Basel 1356. It is an illustration, not a hazard model.

export const CLASSES = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const CLASS_COLOR = {
  I: '#d9d9d9', II: '#bfccff', III: '#9fd8ff', IV: '#6fe6e6', V: '#76e88c', VI: '#f2e43a',
  VII: '#ffb21f', VIII: '#ff7a14', IX: '#ef2a1f', X: '#b5121b', XI: '#7d0b2e', XII: '#4a0631',
};
export const CLASS_TEXT = {
  I: '#1b1b1b', II: '#1b1b1b', III: '#1b1b1b', IV: '#1b1b1b', V: '#1b1b1b', VI: '#1b1b1b',
  VII: '#1b1b1b', VIII: '#fff', IX: '#fff', X: '#fff', XI: '#fff', XII: '#fff',
};

// Short EMS-98 descriptions (paraphrased).
export const CLASS_DESC = {
  fr: {
    I: 'Imperceptible', II: 'À peine ressenti', III: 'Faible', IV: 'Largement observé', V: 'Fort',
    VI: 'Légers dommages', VII: 'Dommages', VIII: 'Dommages importants', IX: 'Destructeur',
    X: 'Très destructeur', XI: 'Dévastateur', XII: 'Complètement dévastateur',
  },
  en: {
    I: 'Not felt', II: 'Scarcely felt', III: 'Weak', IV: 'Largely observed', V: 'Strong',
    VI: 'Slightly damaging', VII: 'Damaging', VIII: 'Heavily damaging', IX: 'Destructive',
    X: 'Very destructive', XI: 'Devastating', XII: 'Completely devastating',
  },
};

// Class index 1..12 for a continuous intensity, or 0 below I (no felt shaking).
export function classIndex(i) {
  if (!(i >= 1)) return 0;
  return Math.min(12, Math.round(i));
}

export function classOf(i) {
  const k = classIndex(i);
  return k > 0 ? CLASSES[k] : null;
}

const C1 = 1.9, C2 = 1.6, BETA = -3.5, GAMMA = 0.0015;

// Intensity at distance rrup (km) from the rupture; amp is the station's site factor.
export function intensityAt(mw, rrupKm, amp = 1.0) {
  const m = Math.min(mw, 8.3);
  const h0 = 2 + 0.003 * 10 ** (0.5 * m);
  const r = Math.hypot(rrupKm, h0);
  // beyond Mw 9.6 (larger than any recorded quake) shaking keeps growing, for fictional magnitudes
  const i = C1 + C2 * m + BETA * Math.log10(r) - GAMMA * r + siteTerm(amp) + 1.2 * Math.max(0, mw - 9.6);
  return Math.max(0, Math.min(12, i));
}

// Point-source version (felt reports by area, fictional EEW forecasts): distance to the
// rupture approximated by the hypocentral distance minus half the rupture length.
export function predictIntensity(m, depthKm, epiKm, amp = 1.0) {
  const half = 0.5 * Math.min(20000, 10 ** (-2.37 + 0.57 * m));
  const r = Math.max(Math.min(depthKm, 300) * 0.5, Math.hypot(epiKm, depthKm) - half);
  return intensityAt(m, r, amp);
}

export function siteTerm(amp) {
  return (amp - 1.1) * 0.8;
}

// Colour for real-time shaking (instrumental intensity, 0 .. 10).
const RT_STOPS = [
  [0, [40, 60, 200]], [1, [0, 140, 255]], [2, [0, 210, 200]], [3, [60, 220, 90]], [4, [200, 235, 0]],
  [5, [255, 220, 0]], [6, [255, 150, 0]], [7, [255, 80, 0]], [8, [230, 20, 20]], [9, [170, 0, 60]], [10, [110, 0, 90]],
];

export function realtimeColor(i) {
  if (i <= RT_STOPS[0][0]) return rgb(RT_STOPS[0][1]);
  for (let k = 1; k < RT_STOPS.length; k++) {
    const [v1, c1] = RT_STOPS[k];
    if (i <= v1) {
      const [v0, c0] = RT_STOPS[k - 1];
      const f = (i - v0) / (v1 - v0);
      return rgb(c0.map((c, j) => c + (c1[j] - c) * f));
    }
  }
  return rgb(RT_STOPS[RT_STOPS.length - 1][1]);
}

export const RT_RAMP = ['interpolate', ['linear'], ['get', 'i'], ...RT_STOPS.flatMap(([v, c]) => [v, rgb(c)])];

function rgb(c) {
  return `rgb(${c.map((v) => Math.round(v)).join(',')})`;
}
