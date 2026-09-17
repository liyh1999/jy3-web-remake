import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {
  JY_CONFIG: {
    assetBase: './vendor/upstream/JY3',
    imageSizes: {
      'image/bjmap/0001.png': { width: 853, height: 480 },
    },
  },
};
vm.runInThisContext(fs.readFileSync('src/resources.js', 'utf8'), { filename: 'src/resources.js' });
const R = globalThis.window.JYResources;

const cases = [
  [0x56050001, 'image/bjmap/0001.png'],
  [0x56080001, 'image/head/0001.png'],
  [0x560e0001, 'image/item/0001.png'],
  [0x56160001, 'image/UI/0001.png'],
  [0x59010001, 'audio/01/0001.mp3'],
  [0x59020001, 'audio/02/0001.mp3'],
];

for (const [id, expected] of cases) {
  const hit = R.resolve(id);
  if (!hit) throw new Error(`resource 0x${id.toString(16)} did not resolve`);
  if (hit.relativePath !== expected) {
    throw new Error(`0x${id.toString(16)}: expected ${expected}, got ${hit.relativePath}`);
  }
}

if (R.canonicalPathId(0x56050001) !== 0x06050001) {
  throw new Error('resource type nibble was not stripped correctly');
}

if (R.resolve(0x56050001).url !== './vendor/upstream/JY3/image/bjmap/0001.png') {
  throw new Error('offline asset base override was not applied');
}

if (R.imageWidth(0x56050001) !== 853 || R.imageHeight(0x56050001) !== 480) {
  throw new Error('synchronous image-size metadata lookup failed');
}

console.log(`resource resolver PASS: ${cases.length} ids + synchronous image metadata`);
