#!/usr/bin/env python3
"""Build the France app's data files.

Inputs (folder given on the command line):
  departements.json, land.json, coast.json, borders.json  - Natural Earth layers simplified with mapshaper
  ne_10m_populated_places_simple.geojson                  - Natural Earth towns
  stations.txt                                            - RESIF FDSN station list (networks FR, RA), text format

Usage: python3 tools/prepare_data.py <folder>
"""
import json, os, sys, math, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'src', 'data')
SRC = sys.argv[1]
BBOX = (-6.0, 41.0, 10.0, 51.5)
os.makedirs(OUT, exist_ok=True)


def load(name):
    return json.load(open(os.path.join(SRC, name), encoding='utf-8'))


def dump(name, obj):
    json.dump(obj, open(os.path.join(OUT, name), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(a)))


def polys(geom):
    return geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]


def centroid(geom):
    best, best_a = None, -1
    for poly in polys(geom):
        ring = poly[0]
        a = cx = cy = 0.0
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            f = x1 * y2 - x2 * y1
            a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
        if a and abs(a) > best_a:
            best_a, best = abs(a), (cx / (3 * a), cy / (3 * a))
    return [round(best[0], 4), round(best[1], 4)]


def inside(x, y, ring):
    res = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            res = not res
        j = i
    return res


# ---------------------------------------------------------------- départements
dep = load('departements.json')
DEPTS = []
for f in dep['features']:
    p = f['properties']
    code = p['iso_3166_2'].replace('FR-', '')
    f['properties'] = {'code': code, 'name': p['name'], 'region': p['region'], 'c': centroid(f['geometry'])}
    ps = polys(f['geometry'])
    xs = [x for q in ps for x, _ in q[0]]
    ys = [y for q in ps for _, y in q[0]]
    DEPTS.append((code, (min(xs), min(ys), max(xs), max(ys)), ps, f['properties']['c']))
dump('departements.json', dep)
print('départements', len(DEPTS))


def dept_of(lat, lon, max_km=None):
    for code, (x1, y1, x2, y2), ps, _ in DEPTS:
        if x1 <= lon <= x2 and y1 <= lat <= y2:
            for q in ps:
                if inside(lon, lat, q[0]):
                    return code
    best, bd = None, 1e9
    for code, _, ps, _ in DEPTS:
        for q in ps:
            for x, y in q[0][::3]:
                d = km(lat, lon, y, x)
                if d < bd:
                    bd, best = d, code
    if max_km is not None and bd > max_km:
        return None
    return best


# ---------------------------------------------------------------- coast by département
coast = load('coast.json')
pieces = {}
for f in coast['features']:
    g = f['geometry']
    lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
    for line in lines:
        cur_code, cur = None, []
        for i in range(0, len(line) - 1):
            a, b = line[i], line[i + 1]
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            code = dept_of(mid[1], mid[0], max_km=12)
            if code != cur_code:
                if cur_code and len(cur) > 1:
                    pieces.setdefault(cur_code, []).append(cur)
                cur_code, cur = code, [a]
            cur.append(b)
        if cur_code and len(cur) > 1:
            pieces.setdefault(cur_code, []).append(cur)
name = {d[0]: f['properties']['name'] for d, f in zip(DEPTS, dep['features'])}
SEA = {}
for code, (x1, y1, x2, y2), ps, c in DEPTS:
    pass
tsu = {'type': 'FeatureCollection', 'features': []}
for code, lines in sorted(pieces.items()):
    pts = [p for l in lines for p in l]
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    # Mediterranean coast (incl. Corsica) vs Atlantic / Channel / North Sea
    sea = 'med' if (my < 43.9 and mx > 2.9) else 'atl'
    tsu['features'].append({'type': 'Feature', 'geometry': {'type': 'MultiLineString', 'coordinates': lines},
                            'properties': {'code': code, 'name': name.get(code, code), 'sea': sea}})
dump('tsunami.json', tsu)
print('coastal départements', len(tsu['features']))

# ---------------------------------------------------------------- land, borders
dump('land.json', load('land.json'))
dump('borders.json', load('borders.json'))

# ---------------------------------------------------------------- towns
pp = load('ne_10m_populated_places_simple.geojson')
towns = []
for f in pp['features']:
    p = f['properties']
    lon, lat = f['geometry']['coordinates']
    if not (BBOX[0] - 1 <= lon <= BBOX[2] + 1 and BBOX[1] - 1 <= lat <= BBOX[3] + 1):
        continue
    fr = p.get('adm0_a3') == 'FRA' or p.get('sov0name') == 'France'
    if not fr and (p.get('pop_max') or 0) < 100000:
        continue
    towns.append([p['name'], round(lat, 4), round(lon, 4), int(p.get('pop_max') or 0), 1 if fr else 0])
towns.sort(key=lambda t: -t[3])
dump('towns.json', {'fields': ['name', 'lat', 'lon', 'pop', 'france'], 'towns': towns})
print('towns', len(towns))

# ---------------------------------------------------------------- stations
st, seen = [], set()
for line in open(os.path.join(SRC, 'stations.txt'), encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    net, code, lat, lon, _elev, site, _start, end = line.rstrip('\n').split('|')[:8]
    lat, lon = float(lat), float(lon)
    if end[:4] < '2026' or not (BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]):
        continue
    if code in seen:
        continue
    seen.add(code)
    d = dept_of(lat, lon, max_km=25)
    if d is None:
        continue
    # No public site-amplification data is used: a stable pseudo-random factor per station.
    amp = 0.8 + (zlib.crc32(code.encode()) % 600) / 1000
    st.append([round(lat, 4), round(lon, 4), d, round(amp, 3), net, code, site])
dump('stations.json', {'fields': ['lat', 'lon', 'dept', 'amp', 'network', 'code', 'site'], 'stations': st})
print('stations', len(st))
