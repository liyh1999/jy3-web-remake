import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const U = globalThis.window.JYUpstream;

const expected = [...U.ALL_PROGRAMS].sort();
if (expected.length !== 24) throw new Error('expected 24 original 04_program files, got ' + expected.length);

const index = JSON.parse(fs.readFileSync('vendor/upstream-file-index.json', 'utf8'));
const indexed = (index.files || [])
  .map(row => row.path)
  .filter(p => /^script\/04_program\/[^/]+\.lua$/.test(p))
  .map(p => p.slice('script/'.length))
  .sort();

if (JSON.stringify(indexed) !== JSON.stringify(expected)) {
  const expectedSet = new Set(expected);
  const indexedSet = new Set(indexed);
  const missing = expected.filter(x => !indexedSet.has(x));
  const extra = indexed.filter(x => !expectedSet.has(x));
  throw new Error('04_program inventory differs from pinned upstream tree; missing=' + missing.join(',') + '; extra=' + extra.join(','));
}

const sourceRoot = path.join('vendor', 'upstream', 'JY3', 'script');
const sources = {};
for (const program of expected) {
  const file = path.join(sourceRoot, ...program.split('/'));
  if (!fs.existsSync(file)) throw new Error('cached program missing: ' + program);
  sources[program] = fs.readFileSync(file, 'utf8');
}

function defs(source) {
  return [...source.matchAll(/t\[['"]([^'"]+)['"]\]\s*=\s*function/g)].map(m => m[1]);
}
function namedCalls(source) {
  return [...source.matchAll(/G\.call\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
}
function directCalls(source) {
  return [...source.matchAll(/\bG\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]).filter(x => x !== 'call');
}
function count(items) {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return map;
}
function sortedMap(map) {
  return [...map.entries()].sort((a,b) => a[0].localeCompare(b[0], 'zh-CN'));
}

const originalDefs = new Set();
for (const source of Object.values(sources)) for (const name of defs(source)) originalDefs.add(name);

const gfWeb = fs.readFileSync('lua/gf_web.lua', 'utf8');
const runtimeFiles = [
  'lua/gf_web.lua',
  'lua/runtime_shims.lua',
  'lua/gcore_web.lua',
  'lua/minigame_web.lua',
  'lua/battle_web.lua',
];
const runtimeSource = runtimeFiles.filter(fs.existsSync).map(p => fs.readFileSync(p,'utf8')).join('\n');
const webHandled = new Set([...gfWeb.matchAll(/\bname\s*==\s*["']([^"']+)["']/g)].map(m => m[1]));
const compatAliases = new Map([
  ['get_ponit','get_point'],
  ['ser_point','set_point'],
  ['ser_role','set_role'],
]);
for (const name of compatAliases.keys()) webHandled.add(name);

const runtimeMethods = new Set();
for (const m of runtimeSource.matchAll(/function\s+G\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) runtimeMethods.add(m[1]);
for (const m of runtimeSource.matchAll(/G\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function\s*\(/g)) runtimeMethods.add(m[1]);

const allCallCounts = new Map();
const allDirectCounts = new Map();
const perFile = [];

for (const program of expected) {
  const source = sources[program];
  const calls = count(namedCalls(source));
  const direct = count(directCalls(source));
  for (const [name,n] of calls) allCallCounts.set(name,(allCallCounts.get(name)||0)+n);
  for (const [name,n] of direct) allDirectCounts.set(name,(allDirectCounts.get(name)||0)+n);

  const unresolved = [...calls.keys()].filter(name => !originalDefs.has(name) && !webHandled.has(name)).sort();
  const directMissing = [...direct.keys()].filter(name => !runtimeMethods.has(name)).sort();
  perFile.push({
    program,
    bytes: Buffer.byteLength(source),
    definitions: new Set(defs(source)).size,
    uniqueCalls: calls.size,
    unresolved,
    directMethods: direct.size,
    directMissing,
  });
}

const categories = { original: [], web: [], alias: [], unresolved: [] };
for (const [name,n] of sortedMap(allCallCounts)) {
  if (originalDefs.has(name)) categories.original.push([name,n]);
  else if (compatAliases.has(name)) categories.alias.push([name,n,compatAliases.get(name)]);
  else if (webHandled.has(name)) categories.web.push([name,n]);
  else categories.unresolved.push([name,n]);
}

const direct = { available: [], missing: [] };
for (const [name,n] of sortedMap(allDirectCounts)) {
  (runtimeMethods.has(name) ? direct.available : direct.missing).push([name,n]);
}

const summary = {
  schemaVersion: 1,
  upstreamRevision: U.UPSTREAM_REV,
  programCount: expected.length,
  programs: expected,
  originalDefinitionCount: originalDefs.size,
  uniqueNamedGCalls: allCallCounts.size,
  callCategories: categories,
  directMethods: direct,
  perFile,
};

fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/program-api-coverage.json', JSON.stringify(summary,null,2)+'\n');

const md = [];
md.push('# D4 全 04_program API 覆盖矩阵');
md.push('');
md.push('- 固定上游：\`' + U.UPSTREAM_REV + '\`');
md.push('- 程序文件：' + expected.length);
md.push('- 原 Lua API 定义：' + originalDefs.size);
md.push('- 唯一命名 G.call：' + allCallCounts.size);
md.push('- 原 Lua 可解析：' + categories.original.length);
md.push('- Web/兼容层处理：' + categories.web.length);
md.push('- 兼容别名：' + categories.alias.length);
md.push('- 尚未解析：' + categories.unresolved.length);
md.push('- 直接 G.* 已实现：' + direct.available.length);
md.push('- 直接 G.* 缺失：' + direct.missing.length);
md.push('');
md.push('## 分文件');
md.push('');
md.push('| 程序 | bytes | API定义 | G.call | 未解析 | 直接G.* | 直接缺失 |');
md.push('|---|---:|---:|---:|---:|---:|---:|');
for (const row of perFile) {
  md.push('| \`'+row.program+'\` | '+row.bytes+' | '+row.definitions+' | '+row.uniqueCalls+' | '+row.unresolved.length+' | '+row.directMethods+' | '+row.directMissing.length+' |');
}
md.push('');
md.push('## 尚未解析的 G.call');
md.push('');
if (categories.unresolved.length) {
  for (const [name,n] of categories.unresolved) md.push('- \`'+name+'\` × '+n);
} else md.push('- 无');
md.push('');
md.push('## 缺失的直接 G.*');
md.push('');
if (direct.missing.length) {
  for (const [name,n] of direct.missing) md.push('- \`G.'+name+'\` × '+n);
} else md.push('- 无');
md.push('');
md.push('## 兼容别名');
md.push('');
if (categories.alias.length) {
  for (const [name,n,target] of categories.alias) md.push('- \`'+name+'\` → \`'+target+'\` × '+n);
} else md.push('- 无');
md.push('');
fs.writeFileSync('reports/program-api-coverage.md', md.join('\n')+'\n');

console.log('D4 program API coverage audit PASS');
console.log('  programs:', expected.length, 'original definitions:', originalDefs.size, 'unique G.call:', allCallCounts.size);
console.log('  calls original/web/alias/unresolved:', categories.original.length, categories.web.length, categories.alias.length, categories.unresolved.length);
console.log('  direct G.* available/missing:', direct.available.length, direct.missing.length);
if (categories.unresolved.length) console.log('  unresolved calls:', categories.unresolved.map(x=>x[0]+'('+x[1]+')').join(', '));
if (direct.missing.length) console.log('  missing direct methods:', direct.missing.map(x=>x[0]+'('+x[1]+')').join(', '));
