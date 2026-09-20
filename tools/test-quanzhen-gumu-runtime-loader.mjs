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
const result = await U.prepareQuanzhenGumuRuntime();

if (!result) throw new Error('prepareQuanzhenGumuRuntime returned no result');
if (result.sectPrograms.join('\n') !== U.QUANZHEN_GUMU_PROGRAMS.join('\n')) {
  throw new Error('Quanzhen/Gumu sect family mismatch');
}

const paths = fetched.map(url => url.replace(/^.*\/vendor\/upstream\/JY3\/script\//, ''));
for (const required of [
  '04_program/p_event.lua',
  '04_program/p_dialogue_system.lua',
  '04_program/p_task.lua',
  '04_program/p_story-town or city.lua',
  '04_program/p_school_quanzhen.lua',
  '04_program/p_school_gumu.lua',
  '06_notify/n_dialogue_system.lua',
]) {
  if (!paths.includes(required)) throw new Error('Quanzhen/Gumu runtime missing dependency: ' + required);
}

for (const forbidden of paths.filter(p =>
  p === '04_program/p_battle.lua' ||
  (/04_program\/p_school_/.test(p) &&
   p !== '04_program/p_school_quanzhen.lua' &&
   p !== '04_program/p_school_gumu.lua')
)) {
  throw new Error('Quanzhen/Gumu runtime leaked unrelated program dependency: ' + forbidden);
}

console.log('independent Quanzhen/Gumu runtime loader PASS');
console.log('  reuses base story runtime and loads only p_school_quanzhen + p_school_gumu');
console.log('  does not depend on p_battle or unrelated sect programs');
