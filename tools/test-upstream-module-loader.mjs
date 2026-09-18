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
if (typeof U.registerModuleSource !== 'function' || typeof U.loadModule !== 'function') throw new Error('module loader API missing');
U.registerModuleSource('c_demo', "local t={}\nt.测试=1\nreturn t", '03_ui_component/c_demo.lua');
if (!captured.includes('package.preload["c_demo"]')) throw new Error('package.preload registration missing');
if (!captured.includes('@upstream-module/03_ui_component/c_demo.lua')) throw new Error('module chunk name missing');
if (!captured.includes('__jy_u_6d4b_8bd5')) throw new Error('non-ASCII module source was not normalized');
console.log('upstream module loader PASS');
