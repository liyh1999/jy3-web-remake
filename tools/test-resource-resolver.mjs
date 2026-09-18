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
vm.runInThisContext(fs.readFileSync('src/resource-catalog.js', 'utf8'), { filename: 'src/resource-catalog.js' });
vm.runInThisContext(fs.readFileSync('src/resources.js', 'utf8'), { filename: 'src/resources.js' });
const R = globalThis.window.JYResources;

const cases = [
  [0x72000001, 'fonts/0001.ttf', 'font'],
  [0x52000001, 'fonts/0001.png', 'image'],
  [0x33030001, 'framelist/body/0001.swf', 'framelist'],
  [0x33040061, 'framelist/skill/0061.swf', 'framelist'],
  [0x56050001, 'image/bjmap/0001.png', 'image'],
  [0x56080001, 'image/head/0001.png', 'image'],
  [0x560e0001, 'image/item/0001.png', 'image'],
  [0x56160001, 'image/UI/0001.png', 'image'],
  [0x49010001, 'audio/01/0001.mp3', 'audio'],
  [0x49020001, 'audio/02/0001.mp3', 'audio'],
  [0x49011003, 'audio/01/1003.mp3', 'audio'],
];

for (const [id, expected, kind] of cases) {
  const hit = R.resolve(id);
  if (!hit) throw new Error(`resource 0x${id.toString(16)} did not resolve`);
  if (hit.relativePath !== expected) {
    throw new Error(`0x${id.toString(16)}: expected ${expected}, got ${hit.relativePath}`);
  }
  if (hit.kind !== kind || !hit.resolvableFile) {
    throw new Error(`0x${id.toString(16)}: expected resolvable ${kind}, got ${hit.kind}`);
  }
}

const imageRoot = R.resolve(0x06000000);
if (!imageRoot?.isDirectory || imageRoot.relativePath !== 'image' || imageRoot.resolvableFile) {
  throw new Error('directory resource id was incorrectly treated as image/0000.png');
}

const spine = R.resolve(0x05000001);
if (!spine || spine.kind !== 'spine' || !spine.structured || spine.resolvableFile || spine.relativePath !== null) {
  throw new Error('untagged structured Spine resource must not invent a fixed filename');
}
const taggedSpineFrame = R.resolve(0x55000001);
if (!taggedSpineFrame || taggedSpineFrame.kind !== 'image' || taggedSpineFrame.relativePath !== 'spine/0001.png') {
  throw new Error('tagged 0x5 Spine-path resource must resolve as PNG');
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
const imageSize = R.imageSize(0x56050001);
if (!imageSize || imageSize.width !== 853 || imageSize.height !== 480) {
  throw new Error('imageSize Web equivalent failed');
}

if (!R.play(0x49011003, 1, false, 100)) {
  throw new Error('original G.Play resource id did not route to audio');
}
const active = R.activeAudio(1);
if (!active || active.url !== './vendor/upstream/JY3/audio/01/1003.mp3' || active.volume !== 1) {
  throw new Error('audio channel state/path/volume mismatch');
}
if (!R.stop(1) || R.activeAudio(1) !== null) {
  throw new Error('audio channel stop failed');
}

console.log(`resource resolver PASS: ${cases.length} tagged files + directory ids + structured families + image/audio APIs`);
