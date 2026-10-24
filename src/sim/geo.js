// Small geodesy helpers. Coordinates are [lon, lat] in degrees, distances in km.

const R_EARTH = 6371;
const RAD = Math.PI / 180;

export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Point at a given distance and bearing from a start point.
export function destination(lat, lon, distKm, bearingDeg) {
  const d = distKm / R_EARTH;
  const b = bearingDeg * RAD;
  const p1 = lat * RAD;
  const l1 = lon * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1),
    Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [l2 / RAD, p2 / RAD];
}

// Closed ring approximating a circle on the sphere, as GeoJSON coordinates.
export function circleRing(lat, lon, radiusKm, steps = 96) {
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    ring.push(destination(lat, lon, radiusKm, (360 * i) / steps));
  }
  return ring;
}

// Ray-casting test against a list of polylines given as flat [x0, y0, x1, y1, ...] arrays.
// The segments do not need to form ordered rings: only the crossing count matters.
export function insideLines(x, y, lines) {
  let crossings = 0;
  for (const pts of lines) {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x1 = pts[i], y1 = pts[i + 1], x2 = pts[i + 2], y2 = pts[i + 3];
      if ((y1 > y) !== (y2 > y)) {
        const xi = x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);
        if (xi > x) crossings++;
      }
    }
  }
  return crossings % 2 === 1;
}

// Ray-casting test against GeoJSON Polygon / MultiPolygon geometry.
export function insideGeometry(lon, lat, geom) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  for (const poly of polys) {
    let inside = false;
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
    }
    if (inside) return true;
  }
  return false;
}

// Smallest distance from a point to the vertices of a (Multi)LineString.
export function distanceToLineKm(lat, lon, geom) {
  const lines = geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates];
  let best = Infinity;
  for (const line of lines) {
    for (const [x, y] of line) {
      const d = distanceKm(lat, lon, y, x);
      if (d < best) best = d;
    }
  }
  return best;
}
