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
const result = await U.prepareStoryRuntime();

if (!result || result.programs.join('\n') !== U.BASE_STORY_PROGRAMS.join('\n')) {
  throw new Error('prepareStoryRuntime did not report the base story family');
}

const paths = fetched.map(url => url.replace(/^.*\/vendor\/upstream\/JY3\/script\//, ''));
for (const required of [
  '04_program/p_event.lua',
  '04_program/p_dialogue_system.lua',
  '04_program/p_task.lua',
  '04_program/p_story-town or city.lua',
  '06_notify/n_dialogue_system.lua',
  '02_ui_view/v_dialogue_system_story.lua',
  '02_ui_view/v_dialogue_system_select.lua',
]) {
  if (!paths.includes(required)) throw new Error('story runtime missing dependency: ' + required);
}

for (const forbidden of paths.filter(p => p === '04_program/p_battle.lua' || /04_program\/p_school_/.test(p))) {
  throw new Error('story runtime leaked battle/sect program dependency: ' + forbidden);
}

if (paths.includes('04_program/p_citymap_system.lua')) {
  throw new Error('story runtime should reuse already-bootstrapped core p_citymap_system.lua');
}

console.log('independent base story runtime loader PASS');
console.log('  loads dialogue UI + p_event/p_task/p_story-town-or-city');
console.log('  reuses core p_citymap_system and does not load battle/sect programs');
