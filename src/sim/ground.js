// Finite-fault geometry for the ground-motion models.
//
// The rupture is a rectangle centred under the epicentre, at the hypocentre depth (shallower
// for crustal quakes, which break upward; pushed down if it would break through the surface).
// Its size follows Blaser et al. (2010):
//   L = 10^(-2.37 + 0.57 Mw),  W = 10^(-1.86 + 0.46 Mw)
// with W limited by the thickness of the layer that can break (crust, plate interface or
// slab). Shaking is driven by the shortest distance from a site to that rectangle, so a
// great quake shakes a long strip of coast strongly instead of a single circle.
import { distanceKm } from './geo.js';

const RAD = Math.PI / 180;

// Default dip (degrees) and the largest down-dip width (km) for each source type.
const DIP = { crustal: 60, interplate: 15, intraslab: 45 };
const MAX_W = { interplate: 220, intraslab: 70 };
const CRUST = 20; // thickness (km) of the crust that breaks in a shallow quake
const MAX_L = 20000; // half the Earth's circumference: the limit for fictional magnitudes

/**
 * @param {object} q  lat, lon, depth (km), mag (Mw), optional strike/dip (degrees) and length (km)
 * @param {string} type  crustal | interplate | intraslab
 * @param {number} strikeDeg  fault azimuth when q.strike is missing
 */
export function faultModel(q, type, strikeDeg = 30) {
  const m = q.mag;
  const dip = (q.dip ?? DIP[type]) * RAD;
  const strike = (q.strike ?? strikeDeg) * RAD;
  const L = q.length ?? Math.min(MAX_L, 10 ** (-2.37 + 0.57 * m));
  const W = Math.min(10 ** (-1.86 + 0.46 * m), type === 'crustal' ? CRUST / Math.sin(dip) : MAX_W[type]);
  const halfZ = 0.5 * W * Math.sin(dip);
  // Crustal quakes usually start near the base of the brittle crust and break upward, so the
  // rupture centre sits above the hypocentre; the top stays at least 0.5 km deep.
  const zc = Math.max(type === 'crustal' ? q.depth - 0.6 * halfZ : q.depth, halfZ + 0.5);
  return {
    lat: q.lat, lon: q.lon, L, W, zc, top: zc - halfZ,
    // unit vectors in (east, north, down)
    s: [Math.sin(strike), Math.cos(strike), 0],
    d: [Math.cos(strike) * Math.cos(dip), -Math.sin(strike) * Math.cos(dip), Math.sin(dip)],
  };
}

// Shortest distance (km) from a point on the surface to the rupture rectangle, and the
// epicentral distance, computed in an azimuthal-equidistant frame around the epicentre.
export function faultDistance(f, lat, lon) {
  const epi = distanceKm(f.lat, f.lon, lat, lon);
  if (epi < 1e-6) return { rrup: rectDist(f, 0, 0), epi: 0 };
  const p1 = f.lat * RAD, p2 = lat * RAD, dl = (lon - f.lon) * RAD;
  const az = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  return { rrup: rectDist(f, epi * Math.sin(az), epi * Math.cos(az)), epi };
}

function rectDist(f, e, n) {
  // site relative to the rupture centre (e, n, -zc)
  const px = e, py = n, pz = -f.zc;
  const u = clamp(px * f.s[0] + py * f.s[1] + pz * f.s[2], f.L / 2);
  const v = clamp(px * f.d[0] + py * f.d[1] + pz * f.d[2], f.W / 2);
  const qx = u * f.s[0] + v * f.d[0], qy = u * f.s[1] + v * f.d[1], qz = u * f.s[2] + v * f.d[2];
  return Math.hypot(px - qx, py - qy, pz - qz);
}

function clamp(x, h) {
  return x < -h ? -h : x > h ? h : x;
}
