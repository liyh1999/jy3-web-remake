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
if (U.LOGGING_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_logging,c_movie') throw new Error('logging component module list mismatch');
if (U.LOGGING_UI_VIEWS.join(',') !== '02_ui_view/v_button.lua,02_ui_view/v_logging.lua,02_ui_view/v_movie.lua') throw new Error('logging view load order mismatch');
if (typeof U.prepareLoggingUI !== 'function') throw new Error('prepareLoggingUI API missing');
if (U.DIG_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_dig') throw new Error('dig component module list mismatch');
if (U.DIG_UI_VIEWS.join(',') !== '02_ui_view/v_empty.lua,02_ui_view/v_button.lua,02_ui_view/v_dig.lua') throw new Error('dig view load order mismatch');
if (typeof U.prepareDigUI !== 'function') throw new Error('prepareDigUI API missing');
if (U.FISHING_UI_MODULES.map(x => x.module).join(',') !== 'c_button,c_fishing') throw new Error('fishing component module list mismatch');
if (U.FISHING_UI_VIEWS.join(',') !== '02_ui_view/v_empty.lua,02_ui_view/v_button.lua,02_ui_view/v_fishing.lua') throw new Error('fishing view load order mismatch');
if (typeof U.prepareFishingUI !== 'function') throw new Error('prepareFishingUI API missing');
if (typeof U.registerModuleSource !== 'function' || typeof U.loadModule !== 'function') throw new Error('module loader API missing');
U.registerModuleSource('c_demo', "local t={}\nt.测试=1\nreturn t", '03_ui_component/c_demo.lua');
if (!captured.includes('package.preload["c_demo"]')) throw new Error('package.preload registration missing');
if (!captured.includes('@upstream-module/03_ui_component/c_demo.lua')) throw new Error('module chunk name missing');
if (!captured.includes('t["测试"]=1')) throw new Error('non-ASCII module source was not normalized');
console.log('upstream module loader PASS');
