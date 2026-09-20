import fs from 'node:fs';
import vm from 'node:vm';

const fetched = [];
globalThis.window = {};
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  return { ok: true, status: 200, async text() { return 'return true'; } };
};
globalThis.fengari = { load() { return () => true; } };

vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const U = window.JYUpstream;
const result = await U.prepareXingxiuXuedaomenRuntime();

if (!result) throw new Error('prepareXingxiuXuedaomenRuntime returned no result');
if (result.sectPrograms.join('\n') !== U.XINGXIU_XUEDAOMEN_PROGRAMS.join('\n')) {
  throw new Error('Xingxiu/Xuedaomen sect family mismatch');
}

const paths = fetched.map(url => url.replace(/^.*\/vendor\/upstream\/JY3\/script\//, ''));
for (const required of [
  '04_program/p_school_quanzhen.lua',
  '04_program/p_school_gumu.lua',
  '04_program/p_school_wudang.lua',
  '04_program/p_school_huashan.lua',
  '04_program/p_school_shaolin.lua',
  '04_program/p_emei.lua',
  '04_program/p_school_gaibang.lua',
  '04_program/p_school_taohuadao.lua',
  '04_program/p_school_xingxiu.lua',
  '04_program/p_school_xuedaomen.lua',
]) {
  if (!paths.includes(required)) throw new Error('Xingxiu/Xuedaomen runtime missing dependency: ' + required);
}

if (paths.includes('04_program/p_battle.lua')) {
  throw new Error('Xingxiu/Xuedaomen runtime leaked battle dependency');
}

const appSource = fs.readFileSync('src/app.js', 'utf8');
if (!appSource.includes('window.JYUpstream.prepareXingxiuXuedaomenRuntime')) {
  throw new Error('normal app boot does not preload Xingxiu/Xuedaomen');
}

console.log('independent Xingxiu/Xuedaomen runtime loader PASS');
console.log('  extends connected sect runtime with the final two major sect programs only');
console.log('  normal app boot preloads all ten connected sect programs');
