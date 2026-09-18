import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {
  JY_CONFIG: {
    assetBase: './vendor/upstream/JY3',
    imageSizes: {},
  },
};

for (const file of ['src/resource-catalog.js','src/resources.js','src/animation-resources.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

const A = globalThis.window.JYAnimationResources;

const dirSource = `
local _dir={}
_dir[0x2000000]="fonts"
_dir[0x2030000]="fonts/role/1/1"
_dir[0x2040000]="fonts/role/1/2"
_dir[0x3010000]="framelist/effect"
_dir[0x3020000]="framelist/hunting"
_dir[0x3030000]="framelist/body"
_dir[0x3040000]="framelist/skill"
_dir[0x3060000]="framelist/enemy"
_dir[0x3070000]="framelist/friendly"
_dir[0x5860000]="spine/skill/97"
_dir[0x60d0000]="image/frame"
_dir[0x6110000]="image/frameshunting"
_dir[0x6130000]="image/body"
return _dir
`;
const dirs = A.parseDirectoryMap(dirSource);
if (dirs.size !== 12) throw new Error(`directory parser expected 12 entries, got ${dirs.size}`);

const bodySource = `520683530
15,1
56130499
56130500
56130501
56130502
`;
const body = A.parseFrameList(bodySource, 0x33030001);
if (body.marker !== 520683530 || body.rate !== 15 || body.loop !== true || body.frameCount !== 4) {
  throw new Error('body framelist header parse mismatch');
}
if (body.frames[0] !== 0x56130499 || body.frames[3] !== 0x56130502) {
  throw new Error('body framelist frame ids must parse as hexadecimal');
}
if (Math.abs(body.frameDurationMs - (1000 / 15)) > 1e-9) {
  throw new Error('body framelist frame duration mismatch');
}

const bodyResolved = A.describeFrameList(body, dirs, './vendor/upstream/JY3');
if (bodyResolved.frames[0].relativePath !== 'image/body/0499.png') {
  throw new Error(`body frame path mismatch: ${bodyResolved.frames[0].relativePath}`);
}

const friendly = A.resolveWithDirectoryMap(0x52030001, dirs, './vendor/upstream/JY3');
if (!friendly || friendly.kind !== 'image' || friendly.relativePath !== 'fonts/role/1/1/0001.png') {
  throw new Error('friendly role PNG must use type tag 0x5 with fonts/role directory id');
}

const enemy = A.resolveWithDirectoryMap(0x52040001, dirs, './vendor/upstream/JY3');
if (!enemy || enemy.kind !== 'image' || enemy.relativePath !== 'fonts/role/1/2/0001.png') {
  throw new Error('enemy role PNG directory resolution mismatch');
}

const skillSource = `520683530
6,1
55860001
55860002
55860003
`;
const skill = A.describeFrameList(A.parseFrameList(skillSource, 0x33040061), dirs, './vendor/upstream/JY3');
if (skill.frames[0].relativePath !== 'spine/skill/97/0001.png') {
  throw new Error(`skill sequence frame path mismatch: ${skill.frames[0].relativePath}`);
}
if (skill.frames[1].url !== './vendor/upstream/JY3/spine/skill/97/0002.png') {
  throw new Error('skill sequence frame URL mismatch');
}

const huntingId = A.parseFrameResourceId('5611100a');
if (huntingId !== 0x5611100a) throw new Error('hex frame token containing a-f was not preserved');

for (const bad of ['', 'xyz', '0x56130499', '123456789']) {
  let failed = false;
  try { A.parseFrameResourceId(bad); } catch { failed = true; }
  if (!failed) throw new Error(`invalid frame token was accepted: ${bad}`);
}

let badMarker = false;
try { A.parseFrameList('123\n15,1\n56130499'); } catch { badMarker = true; }
if (!badMarker) throw new Error('invalid framelist marker was accepted');

console.log('animation resource parser PASS: dir.lua map + tagged PNG ids + framelist marker/rate/loop/hex frames');
