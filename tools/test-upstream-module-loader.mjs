import fs from 'node:fs';
import vm from 'node:vm';

let captured = '';
globalThis.window = {};
globalThis.fengari = {
  load(source) {
    captured = source;
    return () => true;
  }
};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const U = window.JYUpstream;
if (U.ALL_PROGRAMS.length !== 24) throw new Error('04_program inventory mismatch: ' + U.ALL_PROGRAMS.length);
if (new Set(U.ALL_PROGRAMS).size !== 24) throw new Error('04_program inventory contains duplicates');
if (U.CACHED_PROGRAMS.join('\n') !== U.ALL_PROGRAMS.join('\n')) throw new Error('all programs must be cached/compile-gated');
if (U.CORE_PROGRAMS.length !== 5 || U.ON_DEMAND_PROGRAMS.length !== 19) throw new Error('core/on-demand program split mismatch');
if (U.CORE_NOTIFY.join(',') !== '06_notify/n_common.lua,06_notify/n_citymap_system.lua,06_notify/n_dialogue_system.lua,06_notify/n_cheat_system.lua') throw new Error('original notify inventory mismatch');
for (const required of ['04_program/p_task.lua','04_program/p_school_shaolin.lua','04_program/p_story-town or city.lua']) {
  if (!U.ALL_PROGRAMS.includes(required)) throw new Error('missing original program: ' + required);
}
if (U.LOGGING_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_logging,c_movie') throw new Error('logging component module list mismatch');
if (U.LOGGING_UI_VIEWS.join(',') !== '02_ui_view/v_button.lua,02_ui_view/v_logging.lua,02_ui_view/v_movie.lua') throw new Error('logging view load order mismatch');
if (typeof U.prepareLoggingUI !== 'function') throw new Error('prepareLoggingUI API missing');
if (U.DIG_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_dig') throw new Error('dig component module list mismatch');
if (U.DIG_UI_VIEWS.join(',') !== '02_ui_view/v_empty.lua,02_ui_view/v_button.lua,02_ui_view/v_dig.lua') throw new Error('dig view load order mismatch');
if (typeof U.prepareDigUI !== 'function') throw new Error('prepareDigUI API missing');
if (U.FISHING_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_fishing') throw new Error('fishing component module list mismatch');
if (U.FISHING_UI_VIEWS.join(',') !== '02_ui_view/v_empty.lua,02_ui_view/v_button.lua,02_ui_view/v_fishing.lua') throw new Error('fishing view load order mismatch');
if (typeof U.prepareFishingUI !== 'function') throw new Error('prepareFishingUI API missing');
if (U.HUNTING_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_hunting') throw new Error('hunting component module list mismatch');
if (U.HUNTING_UI_VIEWS.join(',') !== '02_ui_view/v_empty.lua,02_ui_view/v_button.lua,02_ui_view/v_hunting.lua') throw new Error('hunting view load order mismatch');
if (typeof U.prepareHuntingUI !== 'function') throw new Error('prepareHuntingUI API missing');
if (U.GAMBLING_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_gambling,c_movie') throw new Error('gambling component module list mismatch');
if (U.GAMBLING_UI_VIEWS.join(',') !== '02_ui_view/v_empty.lua,02_ui_view/v_button.lua,02_ui_view/v_gambling.lua,02_ui_view/v_movie.lua') throw new Error('gambling view load order mismatch');
if (typeof U.prepareGamblingUI !== 'function') throw new Error('prepareGamblingUI API missing');
if (U.DIALOGUE_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_layout_v,c_scrollview,c_dialogue_system_story,c_dialogue_system_story1,c_dialogue_system_story3,c_dialogue_system_select,c_dialogue_system_select1') throw new Error('dialogue component module list mismatch');
if (U.DIALOGUE_UI_VIEWS.join(',') !== '02_ui_view/v_empty.lua,02_ui_view/v_button.lua,02_ui_view/v_scrollview.lua,02_ui_view/v_dialogue_system_story.lua,02_ui_view/v_dialogue_system_story1.lua,02_ui_view/v_dialogue_system_story3.lua,02_ui_view/v_dialogue_system_select.lua,02_ui_view/v_dialogue_system_select1.lua') throw new Error('dialogue view load order mismatch');
if (typeof U.prepareDialogueRuntime !== 'function') throw new Error('prepareDialogueRuntime API missing');
if (typeof U.registerModuleSource !== 'function' || typeof U.loadModule !== 'function') throw new Error('module loader API missing');
U.registerModuleSource('c_demo', "local t={}\nt.测试=1\nreturn t", '03_ui_component/c_demo.lua');
if (!captured.includes('package.preload["c_demo"]')) throw new Error('package.preload registration missing');
if (!captured.includes('@upstream-module/03_ui_component/c_demo.lua')) throw new Error('module chunk name missing');
if (!captured.includes('t["测试"]=1')) throw new Error('non-ASCII module source was not normalized');
console.log('upstream module loader PASS');
