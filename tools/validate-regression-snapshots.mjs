import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const snapshots = JSON.parse(fs.readFileSync('tools/regression-snapshots.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const upstream = globalThis.window.JYUpstream;

assert.equal(snapshots.schemaVersion, 1, 'unsupported regression snapshot schema');
assert.equal(snapshots.upstreamRevision, upstream.UPSTREAM_REV, 'snapshot upstream revision drifted');
assert.equal(snapshots.packageVersion, pkg.version, 'snapshot package/runtime version drifted');
assert.match(String(snapshots.datasetVersion || ''), /^e5-v\d+$/, 'snapshot datasetVersion is invalid');

for (const section of ['opening','map','shop','battle','person','save','minigames']) {
  assert.ok(snapshots[section] && typeof snapshots[section] === 'object', 'missing snapshot section: ' + section);
}

assert.equal(snapshots.opening.answers.length, 15, 'opening answer fixture length changed');
assert.ok(snapshots.opening.answers.every(Number.isInteger), 'opening answers must be integers');
assert.ok(Number.isInteger(snapshots.opening.expected.mapId), 'opening mapId must be numeric');

assert.ok(snapshots.map.niujiaVisibleHotspots > snapshots.map.niujiaHiddenHotspots, 'Niujia map snapshot counts are inconsistent');
assert.ok(snapshots.map.worldUnlockedVisibleCities >= snapshots.map.worldInitialVisibleCities, 'world-map snapshot counts are inconsistent');

assert.equal(snapshots.shop.sample.prices.length, snapshots.shop.sample.quantities.length, 'shop snapshot price/quantity shape mismatch');
assert.ok(Number.isInteger(snapshots.battle.seed), 'battle snapshot seed missing');
assert.ok(snapshots.battle.expected.attacks > 0 && snapshots.battle.expected.damage > 0, 'battle snapshot result is not meaningful');

assert.equal(new Set(snapshots.save.slots).size, snapshots.save.slots.length, 'save snapshot contains duplicate slots');
assert.ok(snapshots.save.slots.includes('autosave'), 'save snapshot lost autosave');
assert.ok(snapshots.save.schemaVersion > snapshots.save.legacySchemaVersion, 'save schema snapshot ordering is invalid');

for (const name of ['logging','mining','fishing','hunting','gambling']) {
  assert.ok(snapshots.minigames[name], 'missing mini-game snapshot: ' + name);
}

const requiredConsumers = [
  'tools/smoke-original-opening-flow.mjs',
  'tools/e2e-core-flow.mjs',
  'tools/smoke-d4-long-flow.mjs',
  'tools/smoke-map-runtime.mjs',
  'tools/test-shop-model.mjs',
  'tools/smoke-battle-1v1.mjs',
  'tools/smoke-person-profile.mjs',
  'tools/test-save-store.mjs',
  'tools/smoke-logging-ui.mjs',
];
for (const file of requiredConsumers) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(source.includes('regression-snapshots.json'), file + ' is not wired to the shared regression dataset');
}

console.log('E5 regression snapshot dataset PASS');
console.log('  dataset:', snapshots.datasetVersion);
console.log('  upstream:', snapshots.upstreamRevision);
console.log('  package/runtime:', snapshots.packageVersion);
console.log('  consumers:', requiredConsumers.length);
