import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const runtime = fs.readFileSync('lua/gf_web.lua', 'utf8');

const saveStorePos = html.indexOf('./src/save-store.js');
const appPos = html.indexOf('./src/app.js');
if (saveStorePos < 0 || appPos < 0 || saveStorePos > appPos) {
  throw new Error('save-store.js must load before app.js');
}

for (const slot of ['slot1', 'slot2', 'slot3', 'autosave']) {
  if (!html.includes(`value="${slot}"`)) throw new Error(`missing save slot option: ${slot}`);
}

if (app.includes("const SAVE_KEY = 'jy3-web-remake:save:v1'")) {
  throw new Error('app still uses legacy single-slot SAVE_KEY');
}
if (!app.includes('window.JYSaveStore.create')) throw new Error('app does not use save-store adapter');
if (!app.includes('migrateLegacySingleSlot')) throw new Error('legacy save migration is not wired');
if (!app.includes("saveGame('autosave', { auto: true, silent: true })")) {
  throw new Error('autosave slot is not wired');
}
if (!app.includes("selected === 'autosave'") || !app.includes('自动存档槽不能手动覆盖')) {
  throw new Error('manual autosave overwrite guard missing');
}
if (!app.includes('characterName') || !app.includes('gameDay') || !app.includes('mapId') || !app.includes('level')) {
  throw new Error('required save metadata is not collected');
}
if (!app.includes('eventFinished() { scheduleAutosave(); }')) {
  throw new Error('Web autosave completion hook missing');
}
if (!runtime.includes('web:eventFinished()')) {
  throw new Error('Lua runtime does not emit story completion signal');
}

console.log('save system integration PASS');
console.log('  3 manual slots + autosave, metadata, v1 migration, completion-triggered autosave are wired');
