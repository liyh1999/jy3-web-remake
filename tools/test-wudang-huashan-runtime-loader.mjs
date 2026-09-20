import fs from 'node:fs';
import vm from 'node:vm';

const fetched = [];
globalThis.window = {};
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  return {
    ok: true,
    status: 200,
    async text() { return 'return true'; },
  };
};
globalThis.fengari = {
  load() { return () => true; },
};

vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const U = window.JYUpstream;
const result = await U.prepareWudangHuashanRuntime();

if (!result) throw new Error('prepareWudangHuashanRuntime returned no result');
if (result.sectPrograms.join('\n') !== U.WUDANG_HUASHAN_PROGRAMS.join('\n')) {
  throw new Error('Wudang/Huashan sect family mismatch');
}
if (!result.allSectPrograms.includes('04_program/p_school_quanzhen.lua') ||
    !result.allSectPrograms.includes('04_program/p_school_gumu.lua')) {
  throw new Error('Wudang/Huashan runtime did not preserve previously connected sect family');
}

const paths = fetched.map(url => url.replace(/^.*\/vendor\/upstream\/JY3\/script\//, ''));
for (const required of [
  '04_program/p_event.lua',
  '04_program/p_dialogue_system.lua',
  '04_program/p_task.lua',
  '04_program/p_story-town or city.lua',
  '04_program/p_school_quanzhen.lua',
  '04_program/p_school_gumu.lua',
  '04_program/p_school_wudang.lua',
  '04_program/p_school_huashan.lua',
  '06_notify/n_dialogue_system.lua',
]) {
  if (!paths.includes(required)) throw new Error('Wudang/Huashan runtime missing dependency: ' + required);
}

const allowedSect = new Set([
  '04_program/p_school_quanzhen.lua',
  '04_program/p_school_gumu.lua',
  '04_program/p_school_wudang.lua',
  '04_program/p_school_huashan.lua',
]);
for (const forbidden of paths.filter(p =>
  p === '04_program/p_battle.lua' ||
  (/04_program\/p_school_/.test(p) && !allowedSect.has(p))
)) {
  throw new Error('Wudang/Huashan runtime leaked unrelated program dependency: ' + forbidden);
}

const appSource = fs.readFileSync('src/app.js', 'utf8');
if (!appSource.includes('window.JYUpstream.prepareWudangHuashanRuntime')) {
  throw new Error('normal app boot does not preload the Wudang/Huashan sect family');
}

console.log('independent Wudang/Huashan runtime loader PASS');
console.log('  extends prior sect runtime with only p_school_wudang + p_school_huashan');
console.log('  normal app boot preloads all currently connected sect families');
