import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lua/gf_web.lua', 'utf8');
const policy = JSON.parse(fs.readFileSync('tools/runtime-compat-policy.json', 'utf8'));
const apiBaseline = JSON.parse(fs.readFileSync('tools/program-api-baseline.json', 'utf8'));

const platformStart = source.indexOf('-- Platform/UI side effects');
const platformEnd = source.indexOf('    local found, result = call_lua_api', platformStart);
assert(platformStart >= 0 && platformEnd > platformStart, 'platform compatibility block not found');

const platformSource = source.slice(platformStart, platformEnd);
const actualPlatform = [...new Set(
  [...platformSource.matchAll(/name\s*==\s*["']([^"']+)["']/g)].map(match => match[1])
)].sort();
const expectedPlatform = policy.platformCalls.map(row => row.name).sort();
assert.deepStrictEqual(
  actualPlatform,
  expectedPlatform,
  'gf_web platform call fallbacks changed without updating tools/runtime-compat-policy.json'
);

const directFiles = ['lua/gf_web.lua', 'lua/runtime_shims.lua', 'lua/gcore_web.lua'];
const trivialDirect = [];
for (const file of directFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/function\s+((?:G|c)\.[A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*return\s+(true|nil|\{\}|\"\"|0)\s+end/g)) {
    trivialDirect.push({ name: match[1], file });
  }
}
const classifiedDirect = [
  ...policy.bootstrapFallbacks.map(row => ({ name: row.name, file: 'lua/gf_web.lua' })),
  ...(policy.directHostSurfaces || []).map(row => ({ name: row.name, file: row.file })),
].sort((a,b) => (a.file + ':' + a.name).localeCompare(b.file + ':' + b.name));
trivialDirect.sort((a,b) => (a.file + ':' + a.name).localeCompare(b.file + ':' + b.name));
assert.deepStrictEqual(
  trivialDirect,
  classifiedDirect,
  'one-line direct host stubs changed without updating tools/runtime-compat-policy.json'
);

const bootstrapNames = policy.bootstrapFallbacks.map(row => row.name.replace(/^G\./, ''));
for (const name of bootstrapNames) {
  const re = new RegExp('function\\s+G\\.' + name.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&') + '\\s*\\(');
  assert(re.test(source), `classified bootstrap fallback G.${name} no longer exists`);
}

for (const row of policy.platformCalls) {
  assert(
    ['visual-noop', 'web-side-effect', 'intentional-web-replacement'].includes(row.category),
    `unsupported compatibility category for ${row.name}: ${row.category}`
  );
  if (row.category === 'visual-noop') {
    assert(Number(row.issue) === 18, `${row.name} visual debt must remain linked to #18`);
  }
}

assert.equal(apiBaseline.categoryCounts.unresolved, 0, 'static original G.call baseline has unresolved calls');
assert.deepStrictEqual(apiBaseline.directMissing, [], 'static original direct G.* baseline has missing methods');

const rows = [
  ['bootstrap fallback', policy.bootstrapFallbacks.length],
  ['platform visual no-op', policy.platformCalls.filter(row => row.category === 'visual-noop').length],
  ['Web side-effect', policy.platformCalls.filter(row => row.category === 'web-side-effect').length],
  ['intentional Web replacement', policy.platformCalls.filter(row => row.category === 'intentional-web-replacement').length],
  ['direct host surfaces', (policy.directHostSurfaces || []).length],
  ['stateful host surfaces', (policy.hostStateSurfaces || []).length],
];

for (const row of policy.hostStateSurfaces || []) {
  const sourceText = fs.readFileSync(row.file, 'utf8');
  for (const name of row.name.split('/').map(value => value.trim())) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(' / ', '');
    assert(new RegExp(`function\\s+${escaped}\\s*\\(`).test(sourceText), `stateful host surface missing: ${name}`);
  }
}

fs.mkdirSync('reports', { recursive: true });
const report = [
  '# Runtime compatibility debt baseline',
  '',
  ...rows.map(([name, count]) => `- ${name}: ${count}`),
  `- static unresolved G.call: ${apiBaseline.categoryCounts.unresolved}`,
  `- direct missing G.*: ${apiBaseline.directMissing.length}`,
  `- unsafe unknown fallback: ${policy.unsafeUnknownCallFallback.currentBehavior}`,
  '',
  '## Platform calls',
  '',
  '| call | category | owner / issue |',
  '|---|---|---|',
  ...policy.platformCalls.map(row => `| \`${row.name}\` | ${row.category} | ${row.owner || (row.issue ? '#' + row.issue : '')} |`),
  '',
].join('\n');

fs.writeFileSync('reports/runtime-compat-policy.md', report + '\n');
console.log('runtime compatibility policy audit PASS');
for (const [name, count] of rows) console.log(' ', name + ':', count);
console.log('  static unresolved G.call:', apiBaseline.categoryCounts.unresolved);
console.log('  direct missing G.*:', apiBaseline.directMissing.length);
