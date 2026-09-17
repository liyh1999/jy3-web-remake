const UPSTREAM_REV = 'c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8';
const RAW_BASE = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3/script`;

const PLATFORM_CALLS = new Set([
  'story', 'talk', 'talk0', 'menu',
  'call_battle', 'get_battle',
  'goto_map', 'photo0', 'photo0_off', 'mapon',
  'all_over', 'dark', 'turn_map', 'notice1', 'list',
  '地图系统_防修改监控', '通用_存档', '指令_存储属性'
]);

async function fetchText(path) {
  const response = await fetch(`${RAW_BASE}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}

function apiDefinitions(source) {
  return new Set([...source.matchAll(/t\[['"]([^'"]+)['"]\]\s*=\s*function/g)].map(m => m[1]));
}

function callNames(source) {
  return new Set([...source.matchAll(/G\.call\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
}

function verticalSlice(source) {
  const start = source.indexOf("t['回答问题']=function()");
  const end = source.indexOf("t['途径牛家村-书生']=function()");
  if (start < 0 || end < 0 || end <= start) throw new Error('无法定位 p_newgame 开局纵向切片');
  return source.slice(start, end);
}

const [newgame, order] = await Promise.all([
  fetchText('04_program/p_newgame.lua'),
  fetchText('04_program/p_order.lua')
]);

const slice = verticalSlice(newgame);
const calls = callNames(slice);
const definitions = new Set([...apiDefinitions(newgame), ...apiDefinitions(order)]);
const unresolved = [...calls].filter(name => !PLATFORM_CALLS.has(name) && !definitions.has(name)).sort();

console.log(`upstream: ${UPSTREAM_REV}`);
console.log(`vertical-slice G.call count: ${calls.size}`);
console.log(`original Lua API definitions: ${definitions.size}`);
console.log(`platform-owned calls: ${[...calls].filter(name => PLATFORM_CALLS.has(name)).length}`);

if (unresolved.length) {
  console.error('Unresolved opening calls:');
  for (const name of unresolved) console.error(`  - ${name}`);
  process.exitCode = 1;
} else {
  console.log('Opening call audit: PASS (all calls are original-Lua or Web-platform owned)');
}
