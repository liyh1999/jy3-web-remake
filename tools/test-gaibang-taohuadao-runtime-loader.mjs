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
const result = await U.prepareGaibangTaohuadaoRuntime();

if (!result) throw new Error('prepareGaibangTaohuadaoRuntime returned no result');
if (result.sectPrograms.join('\n') !== U.GAIBANG_TAOHUADAO_PROGRAMS.join('\n')) {
  throw new Error('Gaibang/Taohuadao sect family mismatch');
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
]) {
  if (!paths.includes(required)) throw new Error('Gaibang/Taohuadao runtime missing dependency: ' + required);
}

for (const forbidden of [
  '04_program/p_battle.lua',
  '04_program/p_school_xingxiu.lua',
  '04_program/p_school_xuedaomen.lua',
]) {
  if (paths.includes(forbidden)) {
    throw new Error('Gaibang/Taohuadao runtime leaked unrelated dependency: ' + forbidden);
  }
}

const appSource = fs.readFileSync('src/app.js', 'utf8');
if (!appSource.includes('window.JYUpstream.prepareGaibangTaohuadaoRuntime')) {
  throw new Error('normal app boot does not preload Gaibang/Taohuadao');
}

console.log('independent Gaibang/Taohuadao runtime loader PASS');
console.log('  extends connected sect runtime with p_school_gaibang + p_school_taohuadao only');
console.log('  normal app boot preloads all eight currently connected sect programs');
