// Tsunami model: source uplift from earthquake scaling laws, travel times over a real ocean-depth
// grid (shallow-water wave speed, waves go around land), and coastal heights in metres from
// geometric spreading and Green's-law shoaling. Shared by the Japan and France simulators.
//
// It is a fast estimate meant to behave like real tsunamis (Tohoku 2011, Noto 2024, Ligurian
// 1887, ...), not a replacement for a shallow-water solver with detailed bathymetry.

const G = 9.81;
const KM_PER_DEG = 111.195;
const COAST_DEPTH = 5; // m: Green's law target depth, roughly where tide gauges sit
const SHEAR = { interplate: 4.0e10, crustal: 3.0e10, intraslab: 5.0e10 }; // Pa
// Fraction of uplift turned into a tsunami, by faulting style (thrust > crustal > intraslab).
const STYLE = { interplate: 1.0, crustal: 0.85, intraslab: 0.45 };
const SOURCE_GAIN = 0.85; // wave leaving the uplifted area, relative to the mean uplift
// Slip (and uplift) tapers toward the ends of a rupture but not across it: 30 % at the ends,
// normalised so the mean over the fault length stays 1.
const endTaper = (u) => (0.3 + 0.7 * Math.cos((Math.PI / 2) * Math.min(1, Math.abs(u))) ** 2) / 0.65;

// ---------------------------------------------------------------- source
export function seismicMoment(mw) {
  return 10 ** (1.5 * mw + 9.1); // N·m
}

// Rupture size (km) and average slip (m). Blaser et al. (2010) scaling for reverse faults,
// with the width capped as the seismogenic zone saturates for very large events.
export function rupture(mw, type) {
  const m = Math.min(mw, 9.6);
  const L = 10 ** (-2.37 + 0.57 * m);
  const W = Math.min(10 ** (-1.86 + 0.46 * m), type === 'crustal' ? 45 : 220);
  const slip = seismicMoment(mw) / (SHEAR[type] * L * 1e3 * W * 1e3);
  return { L, W, slip: Math.min(slip, 80) };
}

// Average seafloor uplift (m): about 45 % of the slip for a shallow thrust, fading with depth
// (Okada-type deformation reaches the seafloor less from deep faults).
export function uplift(mw, depthKm, type) {
  const { slip } = rupture(mw, type);
  const depthEff = Math.exp(-Math.max(0, depthKm - 10) / 45);
  return 0.45 * slip * depthEff * STYLE[type];
}

// ---------------------------------------------------------------- grid
export class DepthGrid {
  constructor(g) {
    this.w = g.w; this.h = g.h;
    this.west = g.west; this.east = g.east;
    this.mn = merc(g.north); this.ms = merc(g.south);
    const bands = Uint8Array.from(atobCompat(g.data), (c) => c.charCodeAt(0));
    this.band = bands;
    this.depth = new Float32Array(bands.length);
    for (let i = 0; i < bands.length; i++) this.depth[i] = g.depths[bands[i]];
    // cell size per row (km): x shrinks with latitude, y follows Mercator scale
    this.lat = new Float32Array(this.h);
    this.dx = new Float32Array(this.h);
    this.dy = new Float32Array(this.h);
    const dlon = (this.east - this.west) / this.w;
    for (let y = 0; y < this.h; y++) {
      const top = unmerc(this.mn - ((this.mn - this.ms) * y) / this.h);
      const bot = unmerc(this.mn - ((this.mn - this.ms) * (y + 1)) / this.h);
      this.lat[y] = (top + bot) / 2;
      this.dx[y] = dlon * KM_PER_DEG * Math.cos((this.lat[y] * Math.PI) / 180);
      this.dy[y] = (top - bot) * KM_PER_DEG;
    }
    // Channel width (km) at each sea cell: where land lies on both opposite sides within a few
    // cells (east-west, north-south or diagonally), the distance between those shores.
    // Infinity in open water and along ordinary coasts.
    const K = 8;
    this.channel = new Float32Array(bands.length).fill(Infinity);
    const AX = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (!bands[i]) continue;
        let best = Infinity;
        for (const [ax, ay] of AX) {
          const step = Math.hypot(ax * this.dx[y], ay * this.dy[y]);
          let a = 0, b = 0;
          for (let k = 1; k <= K && !a; k++) a = landAt(this, bands, x + ax * k, y + ay * k) ? k : 0;
          for (let k = 1; k <= K && !b; k++) b = landAt(this, bands, x - ax * k, y - ay * k) ? k : 0;
          if (a && b) best = Math.min(best, (a + b - 1) * step);
        }
        this.channel[i] = best;
      }
    }
  }

  cell(lat, lon) {
    const x = Math.floor(((lon - this.west) / (this.east - this.west)) * this.w);
    const y = Math.floor(((this.mn - merc(lat)) / (this.mn - this.ms)) * this.h);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }

  lonOf(i) { return this.west + (((i % this.w) + 0.5) / this.w) * (this.east - this.west); }
  latOf(i) { return this.lat[Math.floor(i / this.w)]; }

  // Nearest sea cell within r cells (coast points often fall on a land cell). With `ok`, only
  // cells it accepts count (e.g. cells the tsunami reached).
  nearestSea(lat, lon, r = 3, ok = null) {
    const c = this.cell(lat, lon);
    if (c < 0) return -1;
    if (this.band[c] && (!ok || ok(c))) return c;
    const cx = c % this.w;
    const cy = Math.floor(c / this.w);
    let best = -1;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const i = y * this.w + x;
        if (!this.band[i] || (ok && !ok(i))) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------- simulation
/**
 * Run the tsunami model for one earthquake.
 * @param grid DepthGrid
 * @param q {lat, lon, depth, mag, type}
 * @returns null when no tsunami can form, else {
 *   arrival: Float32Array seconds after origin per cell (Infinity = not reached),
 *   amp: Float32Array open-sea amplitude (m) per cell, U0, L, W, seaFraction, srcDepth }
 */
export function propagate(grid, q) {
  if (q.depth > 100 || q.mag < 5.5) return null;
  const { L, W } = rupture(q.mag, q.type);
  const n = grid.w * grid.h;
  const c0 = grid.cell(q.lat, q.lon);
  if (c0 < 0) return null;
  const strike = q.strike ?? estimateStrike(grid, q.lat, q.lon, Math.max(60, W));
  const sx = Math.sin(strike);
  const sy = Math.cos(strike); // unit vector along strike (east, north)

  // Source: an ellipse L long (along strike) and W wide over which the seafloor is uplifted.
  // Only cells deeper than the shelf start the wave (shelf cells around it are reached by it).
  const arrival = new Float32Array(n).fill(Infinity);
  const path = new Float32Array(n).fill(Infinity);
  const org = new Int32Array(n).fill(-1); // source cell each wave started from
  const gate = new Float32Array(n); // width (km) of the narrowest channel passed so far
  const after = new Float32Array(n); // distance travelled since that channel
  const kept = new Float32Array(n); // share of amplitude left after earlier, wider channels
  const heap = new MinHeap(n);
  const cy = Math.floor(c0 / grid.w);
  const reach = L / 2 + grid.dx[cy];
  const ry = Math.ceil(reach / grid.dy[cy]) + 1;
  const rx = Math.ceil(reach / Math.max(1, grid.dx[cy])) + 1;
  const U0 = uplift(q.mag, q.depth, q.type);
  let inside = 0;
  let sea = 0;
  let depthSum = 0;
  const seeds = [];
  for (let y = cy - ry; y <= cy + ry; y++) {
    if (y < 0 || y >= grid.h) continue;
    for (let x = (c0 % grid.w) - rx; x <= (c0 % grid.w) + rx; x++) {
      if (x < 0 || x >= grid.w) continue;
      const i = y * grid.w + x;
      const [ex, ny] = offsetKm(q.lat, q.lon, grid.latOf(i), grid.lonOf(i));
      const u = (ex * sx + ny * sy) / (L / 2);
      const v = (ex * sy - ny * sx) / (W / 2);
      const rho = Math.hypot(u, v);
      if (rho > 1 && !(i === c0)) continue;
      inside++;
      if (!grid.band[i]) continue;
      sea++;
      depthSum += grid.depth[i];
      seeds.push([i, SOURCE_GAIN * U0 * endTaper(u)]);
    }
  }
  if (!sea) return null;
  const deep = seeds.filter(([i]) => grid.band[i] >= 2);
  for (const [i, amp] of deep.length ? deep : seeds) {
    if (amp <= 0) continue;
    arrival[i] = 0;
    path[i] = 0;
    org[i] = i;
    gate[i] = Infinity;
    after[i] = 0;
    kept[i] = 1;
    heap.push(i, 0);
  }
  const seaFraction = sea / Math.max(1, inside);
  const srcDepth = Math.max(50, depthSum / sea);
  if (U0 * seaFraction < 0.005) return null;

  // Dijkstra on the 8-connected grid: travel time = distance / sqrt(g·depth)
  const w = grid.w;
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) speed[i] = grid.band[i] ? Math.sqrt(G * grid.depth[i]) / 1000 : 0; // km/s
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.size) {
    const [i, t] = heap.pop();
    // arrival[] is Float32: compare with a little slack so float rounding never makes a cell
    // look superseded (it would then never be expanded)
    if (t > arrival[i] + 1e-3) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (const [ox, oy] of NB) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= grid.h) continue;
      const j = ny * w + nx;
      if (!speed[j]) continue;
      const dist = Math.hypot(ox * grid.dx[ny], (oy * (grid.dy[ny] + grid.dy[y])) / 2);
      const nt = t + dist / ((speed[i] + speed[j]) / 2);
      if (nt < arrival[j]) {
        arrival[j] = nt;
        path[j] = path[i] + dist;
        org[j] = org[i];
        if (grid.channel[j] < gate[i]) {
          // a new, narrower channel: bank the loss from the previous one, start over from here
          kept[j] = kept[i] * squeezeOf(gate[i], after[i]);
          gate[j] = grid.channel[j];
          after[j] = 0;
        } else {
          kept[j] = kept[i];
          gate[j] = gate[i];
          after[j] = after[i] + dist;
        }
        heap.push(j, nt);
      }
    }
  }

  // Open-sea amplitude per cell. Everything here varies smoothly across the sea (no seams
  // between areas reached from different parts of the source):
  // - starting height from where the cell lies along the fault (slip tapers toward its ends),
  // - a long rupture radiates mostly broadside, so the spreading length depends on direction,
  // - waves that had to bend around land (path much longer than the straight line from where
  //   they started) lose energy; that distance changes little between neighbouring cells.
  const amp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!(arrival[i] < Infinity)) continue;
    const s = path[i];
    const [ex, ny] = offsetKm(q.lat, q.lon, grid.latOf(i), grid.lonOf(i));
    const r = Math.hypot(ex, ny);
    const uAlong = (ex * sx + ny * sy) / (L / 2); // position along the fault, -1 .. 1 at its ends
    const along = r > 0 ? Math.abs((ex * sx + ny * sy) / r) : 0; // 1 = off the rupture's end
    const start = SOURCE_GAIN * U0 * endTaper(uAlong);
    const Ls = W / 2 + (L / 2) * (1 - along * along);
    const o = org[i];
    const straight = haversine(grid.latOf(o), grid.lonOf(o), grid.latOf(i), grid.lonOf(i));
    const shield = s > 0 ? Math.min(1, Math.max(0.03, ((straight + 20) / (s + 20)) ** 2)) : 1;
    // A wave squeezed through a narrow strait spreads out again from it, like a new small
    // source: little gets far into a big basin (Gibraltar), more into a small bay (Tokyo Bay).
    const squeeze = kept[i] * squeezeOf(gate[i], after[i]);
    // over thousands of km, dispersion and bottom friction take extra energy away
    amp[i] = start * Math.sqrt(Ls / (Ls + s)) * shield * squeeze * Math.exp(-s / 2500);
  }
  return { arrival, amp, U0, L, W, strike, seaFraction, srcDepth };
}

// Strike (radians clockwise from north) from the local seafloor slope: subduction faults run
// along the trench, i.e. along the depth contours. Fits a plane to the depths around the point.
export function estimateStrike(grid, lat, lon, radiusKm) {
  const c = grid.cell(lat, lon);
  if (c < 0) return Math.PI / 6;
  const cy = Math.floor(c / grid.w);
  const ry = Math.ceil(radiusKm / grid.dy[cy]);
  const rx = Math.ceil(radiusKm / Math.max(1, grid.dx[cy]));
  let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0, sx = 0, sy = 0, k = 0;
  for (let y = cy - ry; y <= cy + ry; y++) {
    if (y < 0 || y >= grid.h) continue;
    for (let x = (c % grid.w) - rx; x <= (c % grid.w) + rx; x++) {
      if (x < 0 || x >= grid.w) continue;
      const i = y * grid.w + x;
      const [ex, ny] = offsetKm(lat, lon, grid.latOf(i), grid.lonOf(i));
      if (Math.hypot(ex, ny) > radiusKm) continue;
      const z = grid.depth[i]; // land counts as 0 m, which also orients coastal faults
      sxx += ex * ex; syy += ny * ny; sxy += ex * ny; sxz += ex * z; syz += ny * z;
      sx += ex; sy += ny; sz += z; k++;
    }
  }
  if (k < 6) return Math.PI / 6;
  // least squares for z = a·x + b·y + c (centred)
  const mx = sx / k, my = sy / k, mz = sz / k;
  const cxx = sxx / k - mx * mx, cyy = syy / k - my * my, cxy = sxy / k - mx * my;
  const cxz = sxz / k - mx * mz, cyz = syz / k - my * mz;
  const det = cxx * cyy - cxy * cxy;
  if (Math.abs(det) < 1e-9) return Math.PI / 6;
  const ga = (cxz * cyy - cyz * cxy) / det;
  const gb = (cyz * cxx - cxz * cxy) / det;
  if (Math.hypot(ga, gb) < 1e-3) return Math.PI / 6; // flat basin: no preferred direction
  // (ga, gb) is the down-slope direction (east, north); the strike runs perpendicular to it,
  // along (gb, -ga), and is returned as an azimuth (clockwise from north)
  return Math.atan2(gb, -ga);
}

// Coastal height (m): open-sea amplitude shoaled by Green's law from the source depth.
export function coastalHeight(res, cell) {
  if (!res || cell < 0 || !(res.arrival[cell] < Infinity)) return 0;
  return res.amp[cell] * (res.srcDepth / COAST_DEPTH) ** 0.25;
}

/**
 * Heights and first arrivals for each coastal forecast area.
 * areas: GeoJSON features with (Multi)LineString coasts and properties.code
 * returns Map code -> { height (m), arrivalS (s), lat, lon } for areas the wave reaches
 */
export function coastalForecast(grid, res, areas) {
  const out = new Map();
  if (!res) return out;
  const reached = (i) => res.arrival[i] < Infinity;
  for (const f of areas) {
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    let height = 0;
    let arr = Infinity;
    let at = null;
    for (const line of lines) {
      const step = Math.max(1, Math.floor(line.length / 60));
      for (let k = 0; k < line.length; k += step) {
        const [lon, lat] = line[k];
        const c = grid.nearestSea(lat, lon, 5, reached);
        if (c < 0) continue;
        const h = coastalHeight(res, c);
        if (h > height) { height = h; at = [lon, lat]; }
        if (res.arrival[c] < arr) arr = res.arrival[c];
      }
    }
    if (arr < Infinity) out.set(f.properties.code, { height: Math.min(height, 45), arrivalS: arr, lon: at?.[0], lat: at?.[1] });
  }
  return out;
}

// ---------------------------------------------------------------- helpers
// East / north offset (km) of point 2 from point 1.
function offsetKm(lat1, lon1, lat2, lon2) {
  const ny = (lat2 - lat1) * KM_PER_DEG;
  const ex = (lon2 - lon1) * KM_PER_DEG * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return [ex, ny];
}

function squeezeOf(width, after) {
  return width < Infinity ? Math.sqrt(width / (width + after)) : 1;
}

function landAt(grid, bands, x, y) {
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return false; // grid edge is not a shore
  return !bands[y * grid.w + x];
}

function merc(lat) { return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)); }
function unmerc(y) { return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI; }

function haversine(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function atobCompat(b64) {
  if (typeof atob === 'function') return atob(b64);
  return Buffer.from(b64, 'base64').toString('binary'); // Node (tests)
}

// Binary min-heap of (index, key) pairs.
class MinHeap {
  constructor(cap) {
    this.idx = new Int32Array(cap * 2);
    this.key = new Float64Array(cap * 2);
    this.size = 0;
  }

  push(i, k) {
    if (this.size >= this.idx.length) this.grow();
    let p = this.size++;
    while (p > 0) {
      const q = (p - 1) >> 1;
      if (this.key[q] <= k) break;
      this.idx[p] = this.idx[q]; this.key[p] = this.key[q];
      p = q;
    }
    this.idx[p] = i; this.key[p] = k;
  }

  pop() {
    const i = this.idx[0];
    const k = this.key[0];
    const li = this.idx[--this.size];
    const lk = this.key[this.size];
    let p = 0;
    for (;;) {
      let c = 2 * p + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.key[c + 1] < this.key[c]) c++;
      if (this.key[c] >= lk) break;
      this.idx[p] = this.idx[c]; this.key[p] = this.key[c];
      p = c;
    }
    this.idx[p] = li; this.key[p] = lk;
    return [i, k];
  }

  grow() {
    const ni = new Int32Array(this.idx.length * 2); ni.set(this.idx); this.idx = ni;
    const nk = new Float64Array(this.key.length * 2); nk.set(this.key); this.key = nk;
  }
}
