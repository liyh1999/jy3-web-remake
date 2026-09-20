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
const result = await U.prepareBookLakesRuntime();

if (!result) throw new Error('prepareBookLakesRuntime returned no result');
if (result.bookLakesPrograms.join('\n') !== U.BOOK_LAKES_PROGRAMS.join('\n')) {
  throw new Error('book/lakes program family mismatch');
}
if (result.allSectPrograms.length !== 10) {
  throw new Error('book/lakes runtime did not preserve all ten connected sect programs');
}

const paths = fetched.map(url => url.replace(/^.*\/vendor\/upstream\/JY3\/script\//, ''));
for (const required of [
  '04_program/p_book_story.lua',
  '04_program/p_lakes_notice.lua',
]) {
  if (!paths.includes(required)) throw new Error('book/lakes runtime missing dependency: ' + required);
}

for (const forbidden of [
  '04_program/p_battle.lua',
  '04_program/p_cheat_system.lua',
]) {
  if (paths.includes(forbidden)) {
    throw new Error('book/lakes runtime leaked unrelated program dependency: ' + forbidden);
  }
}

const appSource = fs.readFileSync('src/app.js', 'utf8');
if (!appSource.includes('window.JYUpstream.prepareBookLakesRuntime')) {
  throw new Error('normal app boot does not preload book/lakes runtime');
}

console.log('independent book/lakes runtime loader PASS');
console.log('  adds p_book_story + p_lakes_notice after all ten sect programs');
console.log('  does not pull battle or cheat program into normal story boot');
