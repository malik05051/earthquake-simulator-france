#!/usr/bin/env python3
"""Rasterise Natural Earth bathymetry into a compact ocean-depth grid for the tsunami model.

The grid rows are evenly spaced in Web-Mercator Y, so the same grid can be drawn on the map
as an image overlay without distortion. Each cell holds a depth band index:
0 = land, 1 = 0-200 m, 2 = 200-1000 m, 3 = 1000-2000 m, ... 12 = deeper than 10 000 m.

Usage: python3 tools/build_depth_grid.py <bathymetry-folder> <out.json> <west> <south> <east> <north> <cells-per-degree>
The folder must hold ne_10m_bathymetry_{L_0,K_200,J_1000,...,A_10000}.geojson (Natural Earth, public domain).
"""
import base64, json, math, sys
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
west, south, east, north, per_deg = map(float, sys.argv[3:8])

LAYERS = ['L_0', 'K_200', 'J_1000', 'I_2000', 'H_3000', 'G_4000', 'F_5000', 'E_6000', 'D_7000', 'C_8000', 'B_9000', 'A_10000']
# representative depth (m) for each band index
DEPTHS = [0, 80, 500, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 9500, 10500]


def merc(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


W = int(round((east - west) * per_deg))
H = int(round(W * (merc(north) - merc(south)) / math.radians(east - west)))
mn, ms = merc(north), merc(south)

SS = 3  # supersampling, then a mode filter keeps narrow straits open
img = Image.new('L', (W * SS, H * SS), 0)
draw = ImageDraw.Draw(img)


def px(lon, lat):
    lat = max(min(lat, 85), -85)
    return ((lon - west) / (east - west) * W * SS, (mn - merc(lat)) / (mn - ms) * H * SS)


def polys(geom):
    return geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]


for band, layer in enumerate(LAYERS, start=1):
    data = json.load(open(f'{src}/ne_10m_bathymetry_{layer}.geojson'))
    for f in data['features']:
        for poly in polys(f['geometry']):
            xs = [p[0] for p in poly[0]]
            ys = [p[1] for p in poly[0]]
            if max(xs) < west or min(xs) > east or max(ys) < south or min(ys) > north:
                continue
            draw.polygon([px(*p) for p in poly[0]], fill=band)
            for hole in poly[1:]:  # islands / shallower areas inside this depth band
                draw.polygon([px(*p) for p in hole], fill=band - 1)

# Downsample: a cell is sea if any of its sub-pixels is sea (keeps straits connected), and takes
# the median depth band of its sea sub-pixels.
px_all = img.load()
cells = bytearray(W * H)
for y in range(H):
    for x in range(W):
        vals = [px_all[x * SS + i, y * SS + j] for i in range(SS) for j in range(SS)]
        sea = sorted(v for v in vals if v > 0)
        cells[y * W + x] = sea[len(sea) // 2] if len(sea) * 3 >= len(vals) else 0

json.dump({
    'w': W, 'h': H, 'west': west, 'east': east, 'north': north, 'south': south,
    'depths': DEPTHS, 'data': base64.b64encode(bytes(cells)).decode(),
    'source': 'Natural Earth 10m bathymetry (public domain)',
}, open(out, 'w'), separators=(',', ':'))
sea = sum(1 for c in cells if c)
print(f'{W}x{H} grid, {sea / len(cells):.0%} sea -> {out}')
