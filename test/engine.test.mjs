import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/sim/engine.js';
import { PlaceNamer } from '../src/sim/epicenter.js';
import { CLASSES, classOf, predictIntensity } from '../src/sim/intensity.js';
import { DepthGrid } from '../src/sim/tsunami.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url)));
const stations = load('stations.json').stations;
const data = {
  stations,
  departements: load('departements.json'),
  tsunami: load('tsunami.json'),
  namer: new PlaceNamer(load('towns.json').towns, stations),
  depth: new DepthGrid(load('depth.json')),
};
const sim = new Simulation(data);
const run = (q) => sim.start({ ...q, seed: 7 });
const rank = (c) => CLASSES.indexOf(c ?? '');

test('place names read like French agency labels', () => {
  const fr = data.namer.label(45.25, 5.80, 'fr');
  const en = data.namer.label(45.25, 5.80, 'en');
  assert.match(fr, /km (N|NE|E|SE|S|SO|O|NO) de /);
  assert.match(en, /km (N|NE|E|SE|S|SW|W|NW) of /);
});

test('intensity prediction is plausible', () => {
  assert.ok(['VII', 'VIII'].includes(classOf(predictIntensity(4.9, 1, 0)))); // Le Teil 2019: VIII at the epicenter
  assert.ok(predictIntensity(4.9, 1, 60) < 4.5);
  assert.ok(predictIntensity(3.0, 10, 0) < 4);
});

test('Le Teil 2019: strong local shaking, no tsunami', () => {
  const q = run({ lat: 44.518, lon: 4.671, depth: 1, mag: 4.9 });
  assert.ok(rank(q.maxClass) >= rank('VI') && rank(q.maxClass) <= rank('VIII'), q.maxClass);
  assert.equal(sim.tsunami.level, 'none');
  assert.equal(sim.reports[0].type, 'auto');
  assert.ok(sim.reports.some((r) => r.type === 'felt'));
});

test('Ligurian Sea M6.8: tsunami messages on the Riviera', () => {
  run({ lat: 43.70, lon: 8.05, depth: 10, mag: 6.8 });
  assert.notEqual(sim.tsunami.level, 'none');
  assert.ok(sim.tsunami.areas.has('06'), 'Alpes-Maritimes');
  assert.ok(!sim.tsunami.areas.has('29'), 'no message for Brittany');
  assert.ok(sim.reports.some((r) => r.type === 'tsunami'));
});

test('small quake: no fictional early warning, weak shaking', () => {
  const q = run({ lat: 46.5, lon: 2.5, depth: 10, mag: 3.0 });
  assert.equal(sim.eewReports.length, 0);
  assert.ok(rank(q.maxClass) <= rank('IV'), q.maxClass);
});

test('fictional early warning escalates for a damaging quake', () => {
  run({ lat: 43.65, lon: 5.40, depth: 10, mag: 6.0 }); // Lambesc 1909-like
  assert.ok(sim.eewReports.length > 3);
  assert.ok(sim.eewReports.at(-1).isAlert);
});

test('tsunami heights in metres (rough calibration)', () => {
  run({ lat: 43.45, lon: 7.40, depth: 12, mag: 7.0 }); // off Nice scenario
  const am = sim.tsunami.areas.get('06');
  assert.ok(am.height > 0.8 && am.height < 5, `Alpes-Maritimes ${am.height}`);
  assert.ok(am.arrivalMin <= 15, `arrival ${am.arrivalMin} min`);
  run({ lat: 36.83, lon: 3.65, depth: 10, mag: 6.9 }); // Boumerdes 2003, Algeria
  // at most a small, late tsunami on the French coast (2003: about 0.1 m, mostly harbour resonance)
  for (const a of sim.tsunami.areas.values()) assert.ok(a.height < 0.4 && a.arrivalMin > 45, 'small and late');
  assert.notEqual(sim.tsunami.level, 'alerte');
});

test('an Atlantic tsunami barely enters the Mediterranean (Gibraltar)', () => {
  run({ lat: 36.9, lon: -10.5, depth: 20, mag: 8.5 });
  const finistere = sim.tsunami.areas.get('29');
  const var83 = sim.tsunami.areas.get('83');
  assert.ok(finistere && finistere.height > 0.2, 'Atlantic coast gets a real tsunami');
  assert.ok(!var83 || var83.height < finistere.height / 3, 'Mediterranean much less');
});

test('tsunami observations follow the arrivals', () => {
  run({ lat: 43.45, lon: 7.40, depth: 12, mag: 7.0 });
  assert.ok(sim.reports.some((r) => r.type === 'tsunamiObs'));
  for (const o of sim.tsunami.obs) assert.ok(o.peakAt > o.firstAt && o.height > 0);
});

test('finite fault: historical epicentral intensities within one degree', () => {
  // [quake, observed epicentral EMS-98 / MSK intensity]
  const cases = [
    [{ lat: 44.518, lon: 4.671, depth: 1, mag: 4.9, strike: 45, dip: 45 }, 8], // Le Teil 2019
    [{ lat: 43.65, lon: 5.40, depth: 10, mag: 6.0, strike: 270, dip: 50 }, 8.5], // Lambesc 1909
    [{ lat: 43.08, lon: -0.70, depth: 10, mag: 5.3, strike: 280 }, 8], // Arette 1967
    [{ lat: 47.47, lon: 7.60, depth: 12, mag: 6.6, strike: 30 }, 9.5], // Basel 1356
  ];
  for (const [q, obs] of cases) {
    const k = rank(run(q).epiIntensity);
    assert.ok(Math.abs(k - obs) <= 1.01, `${JSON.stringify(q)}: ${k} vs ${obs}`);
  }
});

test('limits: M50 and 1000 km depth run without errors', () => {
  const huge = run({ lat: 45.0, lon: 3.0, depth: 10, mag: 50 });
  assert.equal(huge.maxClass, 'XII');
  assert.ok(sim.duration() < 4 * 3600);
  const deep = run({ lat: 45.0, lon: 3.0, depth: 1000, mag: 7 });
  assert.ok(rank(deep.maxClass) <= rank('IV'), deep.maxClass);
  assert.equal(sim.tsunami.level, 'none');
});
