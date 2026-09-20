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
const notifyPaths = [
  '06_notify/n_common.lua',
  '06_notify/n_citymap_system.lua',
  '06_notify/n_dialogue_system.lua',
  '06_notify/n_cheat_system.lua',
];

function stripLuaComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < source.length) {
        const c = source[i];
        out += c;
        i += 1;
        if (c === '\\' && i < source.length) {
          out += source[i];
          i += 1;
          continue;
        }
        if (c === quote) break;
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      const rest = source.slice(i + 2);
      const long = rest.match(/^\[(=*)\[/);
      if (long) {
        const close = ']' + long[1] + ']';
        const bodyStart = i + 2 + long[0].length;
        const end = source.indexOf(close, bodyStart);
        const stop = end < 0 ? source.length : end + close.length;
        const removed = source.slice(i, stop);
        out += removed.replace(/[^\n]/g, ' ');
        i = stop;
        continue;
      }
      const end = source.indexOf('\n', i + 2);
      if (end < 0) {
        out += ' '.repeat(source.length - i);
        break;
      }
      out += ' '.repeat(end - i) + '\n';
      i = end + 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

function defs(source) {
  const clean = stripLuaComments(source);
  return [...clean.matchAll(/t\[['"]([^'"]+)['"]\]\s*=\s*function/g)].map(m => m[1]);
}
function notifyDefs(source) {
  const clean = stripLuaComments(source);
  return [...clean.matchAll(/function\s+noti\.([^\s(]+)\s*\(/gu)].map(m => m[1]);
}
function callRefs(source) {
  const clean = stripLuaComments(source);
  const refs = [];
  for (const match of clean.matchAll(/G\.call\(\s*'([^'\r\n]*)'\s*(\.\.)?/g)) {
    refs.push({ name: match[1], dynamic: Boolean(match[2]) });
  }
  for (const match of clean.matchAll(/G\.call\(\s*"([^"\r\n]*)"\s*(\.\.)?/g)) {
    refs.push({ name: match[1], dynamic: Boolean(match[2]) });
  }
  return refs;
}
function directCalls(source) {
  const clean = stripLuaComments(source);
  return [...clean.matchAll(/\bG\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]).filter(x => x !== 'call');
}
function count(items) {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return map;
}
function sortedMap(map) {
  return [...map.entries()].sort((a,b) => a[0].localeCompare(b[0], 'zh-CN'));
}

const sources = {};
for (const program of expected) {
  const file = path.join(sourceRoot, ...program.split('/'));
  if (!fs.existsSync(file)) throw new Error('cached program missing: ' + program);
  sources[program] = fs.readFileSync(file, 'utf8');
}

const externalOriginalDefs = new Set();
for (const notifyPath of notifyPaths) {
  const file = path.join(sourceRoot, ...notifyPath.split('/'));
  if (!fs.existsSync(file)) throw new Error('cached notify companion missing: ' + notifyPath);
  for (const name of notifyDefs(fs.readFileSync(file, 'utf8'))) externalOriginalDefs.add(name);
}

const originalDefs = new Set();
for (const source of Object.values(sources)) for (const name of defs(source)) originalDefs.add(name);

const runtimeFiles = [
  'lua/gf_web.lua',
  'lua/runtime_shims.lua',
  'lua/gcore_web.lua',
  'lua/minigame_web.lua',
  'lua/battle_web.lua',
];
const runtimeSource = runtimeFiles.filter(fs.existsSync).map(p => fs.readFileSync(p,'utf8')).join('\n');
const runtimeHandled = new Set([...runtimeSource.matchAll(/\bname\s*==\s*["']([^"']+)["']/g)].map(m => m[1]));
const compatAliases = new Map([
  ['get_ponit','get_point'],
  ['ser_point','set_point'],
  ['ser_role','set_role'],
  ['add_itme','add_item'],
  ['schoollove','add_schoollove'],
  ['set,note','set_note'],
]);
for (const name of compatAliases.keys()) runtimeHandled.add(name);

const runtimeMethods = new Set();
for (const m of runtimeSource.matchAll(/function\s+G\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) runtimeMethods.add(m[1]);
for (const m of runtimeSource.matchAll(/G\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function\s*\(/g)) runtimeMethods.add(m[1]);

const allCallCounts = new Map();
const allDynamicCounts = new Map();
const allDirectCounts = new Map();
const perFile = [];

for (const program of expected) {
  const source = sources[program];
  const refs = callRefs(source);
  const staticCalls = count(refs.filter(x => !x.dynamic).map(x => x.name));
  const dynamicCalls = count(refs.filter(x => x.dynamic).map(x => x.name));
  const direct = count(directCalls(source));
  for (const [name,n] of staticCalls) allCallCounts.set(name,(allCallCounts.get(name)||0)+n);
  for (const [name,n] of dynamicCalls) allDynamicCounts.set(name,(allDynamicCounts.get(name)||0)+n);
  for (const [name,n] of direct) allDirectCounts.set(name,(allDirectCounts.get(name)||0)+n);

  const unresolved = [...staticCalls.keys()]
    .filter(name => !originalDefs.has(name) && !externalOriginalDefs.has(name) && !runtimeHandled.has(name))
    .sort();
  const directMissing = [...direct.keys()].filter(name => !runtimeMethods.has(name)).sort();
  perFile.push({
    program,
    bytes: Buffer.byteLength(source),
    definitions: new Set(defs(source)).size,
    uniqueCalls: staticCalls.size,
    dynamicPrefixes: [...dynamicCalls.keys()].sort(),
    unresolved,
    directMethods: direct.size,
    directMissing,
  });
}

const categories = { original: [], externalOriginal: [], runtime: [], alias: [], unresolved: [] };
for (const [name,n] of sortedMap(allCallCounts)) {
  if (originalDefs.has(name)) categories.original.push([name,n]);
  else if (compatAliases.has(name)) categories.alias.push([name,n,compatAliases.get(name)]);
  else if (runtimeHandled.has(name)) categories.runtime.push([name,n]);
  else if (externalOriginalDefs.has(name)) categories.externalOriginal.push([name,n]);
  else categories.unresolved.push([name,n]);
}

const direct = { available: [], missing: [] };
for (const [name,n] of sortedMap(allDirectCounts)) {
  (runtimeMethods.has(name) ? direct.available : direct.missing).push([name,n]);
}

const summary = {
  schemaVersion: 2,
  upstreamRevision: U.UPSTREAM_REV,
  programCount: expected.length,
  programs: expected,
  notifyCompanions: notifyPaths,
  originalDefinitionCount: originalDefs.size,
  externalNotifyDefinitionCount: externalOriginalDefs.size,
  uniqueNamedGCalls: allCallCounts.size,
  dynamicCallPrefixes: sortedMap(allDynamicCounts),
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
md.push('- 原 04_program API 定义：' + originalDefs.size);
md.push('- 原 06_notify API 定义：' + externalOriginalDefs.size);
md.push('- 唯一静态 G.call：' + allCallCounts.size);
md.push('- 原 04_program 可解析：' + categories.original.length);
md.push('- 原 06_notify 外部依赖：' + categories.externalOriginal.length);
md.push('- Web/runtime 已处理：' + categories.runtime.length);
md.push('- 兼容别名：' + categories.alias.length);
md.push('- 尚未解析：' + categories.unresolved.length);
md.push('- 动态 G.call 前缀：' + allDynamicCounts.size);
md.push('- 直接 G.* 已实现：' + direct.available.length);
md.push('- 直接 G.* 缺失：' + direct.missing.length);
md.push('');
md.push('## 分文件');
md.push('');
md.push('| 程序 | bytes | API定义 | 静态G.call | 动态前缀 | 未解析 | 直接G.* | 直接缺失 |');
md.push('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const row of perFile) {
  md.push('| \`'+row.program+'\` | '+row.bytes+' | '+row.definitions+' | '+row.uniqueCalls+' | '+row.dynamicPrefixes.length+' | '+row.unresolved.length+' | '+row.directMethods+' | '+row.directMissing.length+' |');
}
md.push('');
md.push('## 尚未解析的静态 G.call');
md.push('');
if (categories.unresolved.length) {
  for (const [name,n] of categories.unresolved) md.push('- \`'+name+'\` × '+n);
} else md.push('- 无');
md.push('');
md.push('## 原 06_notify 依赖');
md.push('');
if (categories.externalOriginal.length) {
  for (const [name,n] of categories.externalOriginal) md.push('- \`'+name+'\` × '+n);
} else md.push('- 无');
md.push('');
md.push('## Web/runtime 已处理的 G.call');
md.push('');
if (categories.runtime.length) {
  for (const [name,n] of categories.runtime) md.push('- \`'+name+'\` × '+n);
} else md.push('- 无');
md.push('');
md.push('## 动态 G.call 前缀');
md.push('');
if (allDynamicCounts.size) {
  for (const [name,n] of sortedMap(allDynamicCounts)) md.push('- \`'+name+'..\` × '+n);
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
console.log('  programs:', expected.length, '04_program definitions:', originalDefs.size, '06_notify definitions:', externalOriginalDefs.size);
console.log('  static G.call original/external/runtime/alias/unresolved:', categories.original.length, categories.externalOriginal.length, categories.runtime.length, categories.alias.length, categories.unresolved.length);
console.log('  dynamic G.call prefixes:', sortedMap(allDynamicCounts).map(x=>x[0]+'('+x[1]+')').join(', ') || 'none');
console.log('  direct G.* available/missing:', direct.available.length, direct.missing.length);
if (categories.unresolved.length) console.log('  unresolved calls:', categories.unresolved.map(x=>x[0]+'('+x[1]+')').join(', '));
if (direct.missing.length) console.log('  missing direct methods:', direct.missing.map(x=>x[0]+'('+x[1]+')').join(', '));
