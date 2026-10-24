import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/sim/engine.js';
import { PlaceNamer } from '../src/sim/epicenter.js';
import { CLASSES, classOf, predictIntensity } from '../src/sim/intensity.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url)));
const stations = load('stations.json').stations;
const data = {
  stations,
  departements: load('departements.json'),
  tsunami: load('tsunami.json'),
  namer: new PlaceNamer(load('towns.json').towns, stations),
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
  assert.equal(classOf(predictIntensity(4.9, 1, 0)), 'VII'); // Le Teil 2019: VII-VIII near the epicenter
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
