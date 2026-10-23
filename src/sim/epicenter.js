// Epicenter naming the way French agencies do it: distance and direction from a nearby place
// ("12 km NE de Grenoble"). Candidates are towns (Natural Earth) and station site communes (RESIF).
import { distanceKm } from './geo.js';

const DIRS = {
  fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
};

export class PlaceNamer {
  constructor(towns, stations) {
    this.places = towns.map((t) => ({ name: t[0], lat: t[1], lon: t[2], pop: t[3] }));
    for (const s of stations) {
      if (s[6]) this.places.push({ name: cleanSite(s[6]), lat: s[0], lon: s[1], pop: 0 });
    }
    this.byName = new Map();
  }

  // Returns {place, dist, bearing} for the most useful reference place.
  find(lat, lon) {
    let best = null;
    let bestScore = Infinity;
    for (const p of this.places) {
      const d = distanceKm(lat, lon, p.lat, p.lon);
      // prefer well-known towns unless a local commune is much closer
      const score = d - Math.min(25, Math.log10(1 + p.pop) * 3.5);
      if (score < bestScore) { bestScore = score; best = { p, d }; }
    }
    const b = bearing(best.p.lat, best.p.lon, lat, lon);
    return { place: best.p.name, dist: best.d, bearing: b };
  }

  label(lat, lon, lang = 'fr') {
    const { place, dist, bearing: b } = this.find(lat, lon);
    if (dist < 3) return lang === 'fr' ? `${place}` : place;
    const dir = DIRS[lang][Math.round(b / 45) % 8];
    const d = Math.round(dist);
    return lang === 'fr' ? `${d} km ${dir} de ${place}` : `${d} km ${dir} of ${place}`;
  }
}

function bearing(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

function cleanSite(s) {
  // RESIF site names are communes, sometimes with a place detail after " - " or in brackets.
  return s.split(/ - |\(|,/)[0].trim();
}
