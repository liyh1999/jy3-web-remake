import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const upstream = globalThis.window.JYUpstream;
const battlePath = upstream.ON_DEMAND_PROGRAMS.find((p) => p.endsWith('/p_battle.lua'));
if (!battlePath) throw new Error('p_battle.lua missing from ON_DEMAND_PROGRAMS');

async function fetchSource(path) {
  const response = await fetch(`${upstream.RAW_BASE}/${path}`, { headers: { 'User-Agent': 'jy3-web-remake-battle-audit' } });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}
function count(source, regex, key = (m) => m[1]) {
  const out = {};
  for (const match of source.matchAll(regex)) {
    const name = key(match);
    out[name] = (out[name] || 0) + 1;
  }
  return out;
}
function sortedEntries(object) {
  return Object.entries(object).sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));
}
function apiDefinitions(source) {
  return new Set([...source.matchAll(/t\[['"]([^'"]+)['"]\]\s*=\s*function/g)].map((m) => m[1]));
}

const paths = [...upstream.CORE_PROGRAMS, battlePath];
const sources = {};
for (const path of paths) sources[path] = await fetchSource(path);
const battle = sources[battlePath];

const preBattleDefs = new Set();
for (const path of upstream.CORE_PROGRAMS) for (const name of apiDefinitions(sources[path])) preBattleDefs.add(name);
const battleDefs = apiDefinitions(battle);
const callCounts = count(battle, /G\.call\(\s*['"]([^'"]+)['"]/g);
const aliases = { get_ponit: 'get_point', ser_point: 'set_point', ser_role: 'set_role' };
const categories = { original: [], battleLocal: [], compatAlias: [], unresolved: [] };
for (const [name, calls] of sortedEntries(callCounts)) {
  if (battleDefs.has(name)) categories.battleLocal.push([name, calls]);
  else if (preBattleDefs.has(name)) categories.original.push([name, calls]);
  else if (aliases[name]) categories.compatAlias.push([name, calls, aliases[name]]);
  else categories.unresolved.push([name, calls]);
}

const runtimeSources = ['lua/gf_web.lua', 'lua/runtime_shims.lua', 'lua/gcore_web.lua']
  .map((path) => fs.readFileSync(path, 'utf8')).join('\n');
const runtimeMethods = new Set([...runtimeSources.matchAll(/function\s+G\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
const directCounts = count(battle, /\bG\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
delete directCounts.call;
const direct = { available: [], missing: [] };
for (const [name, calls] of sortedEntries(directCounts)) {
  (runtimeMethods.has(name) ? direct.available : direct.missing).push([name, calls]);
}

const summary = {
  schemaVersion: 1,
  upstreamRevision: upstream.UPSTREAM_REV,
  target: battlePath,
  sourceBytes: battle.length,
  uniqueGCalls: Object.keys(callCounts).length,
  callCategories: categories,
  directMethods: direct,
  queryNameBases: sortedEntries(count(battle, /G\.QueryName\(\s*(0x[0-9a-fA-F]+)/g, (m) => m[1].toLowerCase())),
  miscFields: sortedEntries(count(battle, /G\.misc\(\)\.([A-Za-z0-9_\u0080-\uFFFF]+)/gu)),
  uiRefs: sortedEntries(count(battle, /G\.getUI\(\s*['"]([^'"]+)['"]/g)),
  startProgramRefs: sortedEntries(count(battle, /G\.start_program\(\s*['"]([^'"]+)['"]/g)),
  removeProgramRefs: sortedEntries(count(battle, /G\.remove_program\(\s*['"]([^'"]+)['"]/g)),
  onDemandData: [...upstream.ON_DEMAND_DATA].sort(),
};

const baselinePath = 'tools/battle-api-baseline.json';
if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(baselinePath, JSON.stringify(summary, null, 2) + '\n');
} else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  try {
    assert.deepStrictEqual(summary, baseline);
  } catch (error) {
    console.error('battle API baseline changed; run: node tools/audit-battle.mjs --write-baseline');
    console.error(JSON.stringify(summary, null, 2));
    throw error;
  }
}

console.log(`battle audit PASS: ${summary.sourceBytes} bytes, ${summary.uniqueGCalls} G.call names`);
console.log(`  original APIs: ${categories.original.length}; battle-local: ${categories.battleLocal.length}; aliases required: ${categories.compatAlias.length}; unresolved: ${categories.unresolved.length}`);
console.log(`  direct G methods available: ${direct.available.length}; missing: ${direct.missing.length}`);
console.log(`  on-demand data: ${summary.onDemandData.join(', ')}`);
if (categories.compatAlias.length) console.log('  compatibility aliases:', categories.compatAlias.map((x) => `${x[0]}->${x[2]}(${x[1]})`).join(', '));
if (direct.missing.length) console.log('  missing direct methods:', direct.missing.map((x) => `${x[0]}(${x[1]})`).join(', '));
