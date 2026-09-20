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
const result = await U.prepareShaolinEmeiRuntime();

if (!result) throw new Error('prepareShaolinEmeiRuntime returned no result');
if (result.sectPrograms.join('\n') !== U.SHAOLIN_EMEI_PROGRAMS.join('\n')) {
  throw new Error('Shaolin/Emei sect family mismatch');
}

const paths = fetched.map(url => url.replace(/^.*\/vendor\/upstream\/JY3\/script\//, ''));
for (const required of [
  '04_program/p_school_quanzhen.lua',
  '04_program/p_school_gumu.lua',
  '04_program/p_school_wudang.lua',
  '04_program/p_school_huashan.lua',
  '04_program/p_school_shaolin.lua',
  '04_program/p_emei.lua',
]) {
  if (!paths.includes(required)) throw new Error('Shaolin/Emei runtime missing dependency: ' + required);
}

const allowedSect = new Set([
  '04_program/p_school_quanzhen.lua',
  '04_program/p_school_gumu.lua',
  '04_program/p_school_wudang.lua',
  '04_program/p_school_huashan.lua',
  '04_program/p_school_shaolin.lua',
]);
for (const forbidden of paths.filter(p =>
  p === '04_program/p_battle.lua' ||
  (/04_program\/p_school_/.test(p) && !allowedSect.has(p))
)) {
  throw new Error('Shaolin/Emei runtime leaked unrelated program dependency: ' + forbidden);
}

const appSource = fs.readFileSync('src/app.js', 'utf8');
if (!appSource.includes('window.JYUpstream.prepareShaolinEmeiRuntime')) {
  throw new Error('normal app boot does not preload Shaolin/Emei');
}

console.log('independent Shaolin/Emei runtime loader PASS');
console.log('  extends connected sect runtime with p_school_shaolin + p_emei only');
console.log('  normal app boot preloads all six currently connected sect programs');
