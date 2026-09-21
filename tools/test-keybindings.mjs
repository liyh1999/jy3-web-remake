import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/keybindings.js', 'utf8');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
}

function load(storage) {
  const events = [];
  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  const context = {
    console,
    localStorage: storage,
    CustomEvent,
    dispatchEvent(event) { events.push(event); },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'src/keybindings.js' });
  return { api: context.JYKeybindings, events };
}

const storage = new MemoryStorage();
let loaded = load(storage);
let API = loaded.api;
if (!API) throw new Error('JYKeybindings missing');
if (API.binding('skill1') !== '1' || API.binding('item1') !== 'q' || API.binding('auto') !== 'a' || API.binding('escape') !== 'Escape') {
  throw new Error('default keybindings changed');
}

const changed = API.setBinding('skill1', 'z');
if (!changed.ok || API.binding('skill1') !== 'z' || API.actionForKey('Z') !== 'skill1') {
  throw new Error('skill1 remap failed');
}
if (!loaded.events.some(event => event.type === 'jy3:keybindings-changed')) {
  throw new Error('keybinding change event missing');
}

const conflict = API.setBinding('item1', 'z');
if (conflict.ok || conflict.conflict !== 'skill1' || API.binding('item1') !== 'q') {
  throw new Error('duplicate binding was not rejected');
}
if (API.setBinding('auto', 'F1').ok) throw new Error('unsupported key was accepted');

loaded = load(storage);
API = loaded.api;
if (API.binding('skill1') !== 'z') throw new Error('keybinding did not persist across reload');

API.reset();
if (API.binding('skill1') !== '1' || API.binding('item4') !== 'r' || API.binding('escape') !== 'Escape') {
  throw new Error('keybinding reset failed');
}

console.log('keybindings PASS: defaults, remap, conflict rejection, persistence and reset');
