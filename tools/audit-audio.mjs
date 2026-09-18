import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const pinnedRevision = 'c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8';

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  const file = path.join(root, relativePath);
  must(fs.existsSync(file), `missing audit input: ${relativePath}`);
  return fs.readFileSync(file, 'utf8');
}

function countWhere(files, predicate) {
  return files.reduce((n, file) => n + (predicate(file) ? 1 : 0), 0);
}

const indexPath = path.join(root, 'vendor', 'upstream-file-index.json');
must(
  fs.existsSync(indexPath),
  'missing vendor/upstream-file-index.json; run npm run cache:offline before the audio audit'
);
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
must(index.upstreamRevision === pinnedRevision, 'audio audit must use the pinned upstream revision');

const files = index.files || [];
const audio01 = countWhere(files, file => /^audio\/01\/[0-9a-f]{4}\.mp3$/i.test(file.path));
const audio02 = countWhere(files, file => /^audio\/02\/[0-9a-f]{4}\.mp3$/i.test(file.path));
const rolePng = countWhere(files, file => /^audio\/role\/.+\.png$/i.test(file.path));
const totalMp3 = audio01 + audio02;

must(audio01 === 75, `audio/01 MP3 count changed: ${audio01} != 75`);
must(audio02 === 197, `audio/02 MP3 count changed: ${audio02} != 197`);
must(totalMp3 === 272, `total MP3 count changed: ${totalMp3} != 272`);
must(rolePng === 832, `audio/role PNG count changed: ${rolePng} != 832`);

const representative = [
  'vendor/upstream/JY3/audio/01/0038.mp3',
  'vendor/upstream/JY3/audio/01/1003.mp3',
  'vendor/upstream/JY3/audio/02/000a.mp3',
];
for (const relativePath of representative) {
  const file = path.join(root, relativePath);
  must(fs.existsSync(file), `representative audio not cached: ${relativePath}`);
  must(fs.statSync(file).size > 0, `representative audio is empty: ${relativePath}`);
}

// Validate the Web resolver against the original type-tag + dir.lua scheme.
globalThis.window = {};
vm.runInThisContext(read('src/resource-catalog.js'), { filename: 'src/resource-catalog.js' });
const catalog = globalThis.window.JYResourceCatalog;
must(catalog, 'JYResourceCatalog failed to load');
must(catalog.resolve(0x49011003)?.relativePath === 'audio/01/1003.mp3',
  '0x49011003 must resolve to audio/01/1003.mp3');
must(catalog.resolve(0x49010038)?.relativePath === 'audio/01/0038.mp3',
  '0x49010038 must resolve to audio/01/0038.mp3');
must(catalog.resolve(0x4902000a)?.relativePath === 'audio/02/000a.mp3',
  '0x4902000a must resolve to audio/02/000a.mp3');

// Representative original call sites cover map/BGM, UI and battle SFX.
const city = read('vendor/upstream/JY3/script/04_program/p_citymap_system.lua');
const order = read('vendor/upstream/JY3/script/04_program/p_order.lua');
const button = read('vendor/upstream/JY3/script/03_ui_component/c_button.lua');
const book = read('vendor/upstream/JY3/script/03_ui_component/c_book.lua');
const common = read('vendor/upstream/JY3/script/06_notify/n_common.lua');

must(/G\.Stop\(\s*1\s*\)/.test(city), 'map transition must explicitly stop audio group 1');
must(/G\.Play\(\s*music\s*,\s*1\s*,\s*true\s*,\s*1\s*\)/.test(city),
  'map BGM signature changed');
must(/G\.Play\(\s*0x49010000\s*\+\s*math\.random\(25,30\)\s*,\s*1\s*,\s*true\s*,\s*1\s*\)/.test(order),
  'battle BGM signature changed');
must(/G\.Play\(\s*self\.audio_(?:hover|press)\s*,\s*1\s*,\s*false\s*,\s*100\s*\)/.test(button),
  'UI SFX signature changed');
must(/G\.Play\(\s*0x49020001\s*\+\s*G\.misc\(\)\.book_data\s*,\s*1\s*,\s*true\s*,\s*100\s*\)/.test(book),
  'true/100 counterexample changed');
must(/G\.Play\(\s*0x49020001\s*\+\s*int_序列帧\s*-\s*1\s*,\s*1\s*,\s*false\s*,\s*100\s*\)/.test(common),
  'battle skill SFX signature changed');
must(/G\.Play\(\s*music\s*,\s*1\s*,\s*false\s*,\s*1\s*\)/.test(order),
  'false/1 counterexample changed');

const resources = read('src/resources.js');
const currentSingleSlot = /\bstop\(key\);/.test(resources) && /audioChannels\.set\(key/.test(resources);
const collapsesOneAndHundred =
  /if\s*\(value\s*<=\s*1\)/.test(resources) &&
  /value\s*\/\s*100/.test(resources);

console.log([
  'Original audio protocol audit PASS',
  `upstream=${pinnedRevision}`,
  `mp3=${totalMp3} (audio/01=${audio01}, audio/02=${audio02})`,
  `audio/role png=${rolePng}`,
  'resource ids: 0x49011003 -> audio/01/1003.mp3; 0x49010038 -> audio/01/0038.mp3; 0x4902000a -> audio/02/000a.mp3',
  'observed representative signatures include true/1, false/100, true/100 and false/1; loop and raw gain are independent',
  `current Web single-slot-per-group behavior=${currentSingleSlot ? 'yes (D2-2 gap)' : 'no'}`,
  `current Web collapses raw 1/100 distinction=${collapsesOneAndHundred ? 'yes (D2-2 gap)' : 'no'}`,
].join('\n'));
