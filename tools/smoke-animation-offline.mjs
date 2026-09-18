import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const assetBase = './vendor/upstream/JY3';
globalThis.window = {
  JY_CONFIG: { assetBase, imageSizes: {} },
};
globalThis.fetch = async url => {
  const clean = String(url).replace(/^\.\//, '');
  const file = path.join(root, ...clean.split('/'));
  const ok = fs.existsSync(file) && fs.statSync(file).isFile();
  return {
    ok,
    status: ok ? 200 : 404,
    async text() { return ok ? fs.readFileSync(file, 'utf8') : ''; },
  };
};

for (const file of ['src/resource-catalog.js','src/resources.js','src/animation-resources.js','src/battle-effects.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename:file });
}
const A = window.JYAnimationResources;
const B = window.JYBattleEffects;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function localExists(url) {
  if (!url) return false;
  const clean = String(url).replace(/^\.\//, '');
  return fs.existsSync(path.join(root, ...clean.split('/')));
}
async function check(base, action, expectedFormat, expectedCount, firstPath, label) {
  const selected = await A.loadFrameAction(base, action);
  assert(selected.format === expectedFormat, `${label}: expected ${expectedFormat}, got ${selected.format}`);
  assert(selected.frameCount === expectedCount, `${label}: expected ${expectedCount} frames, got ${selected.frameCount}`);
  assert(selected.frames[0]?.relativePath === firstPath, `${label}: first frame mismatch ${selected.frames[0]?.relativePath}`);
  for (const frame of selected.frames) {
    assert(frame.kind === 'image', `${label}: frame 0x${frame.id.toString(16)} is not an image`);
    assert(localExists(frame.url), `${label}: cached frame missing ${frame.relativePath}`);
  }
  return selected;
}

const maleIdle = await check(0x33039998, 0, 'action', 16, 'image/body/0001.png', 'male DA=0000');
assert(maleIdle.rate === 20 && maleIdle.width === 100 && maleIdle.height === 100, 'male master header mismatch');

await check(0x33039998, 0x1001, 'action', 35, 'image/body/0359.png', 'male DA=1001');
await check(0x33039997, 0, 'action', 8, 'image/primadonna/0001.png', 'female DA=0000');
await check(0x33039997, 0x1001, 'action', 16, 'image/primadonna/0041.png', 'female DA=1001');

const enemyIdle = await check(0x33069998, 1, 'action', 8, 'fonts/role/1/2/0001.png', 'enemy role1 idle');
assert(enemyIdle.frames[0].x === -72 && enemyIdle.frames[0].y === -62, 'enemy master frame offsets were lost');
await check(0x33069998, 0x1001, 'action', 25, 'fonts/role/1/2/0009.png', 'enemy role1 attack');

await check(0x33079999, 1, 'action', 8, 'fonts/role/1/1/0001.png', 'friendly role1 idle');
await check(0x33079999, 0x1001, 'action', 25, 'fonts/role/1/1/0009.png', 'friendly role1 attack');

const skill = await check(0x33049999, 0x61, 'action', 27, 'spine/skill/61/0001.png', 'skill DA=061');
assert(skill.frames[0]?.x === -98 && skill.frames[0]?.y === -174, 'skill master frame offsets changed');
assert(skill.frames.at(-1)?.end === true, 'skill action end marker missing');
const enemySkillPlacement = B.framePlacement('enemy1', skill.frames[0], { master:true });
assert(enemySkillPlacement.left === 111 && enemySkillPlacement.bottom === 194, 'enemy1 skill offset placement changed');
const allSkillPlacement = B.framePlacement('all3', skill.frames[0], { master:true });
assert(allSkillPlacement.left === 88 && allSkillPlacement.bottom === 228 && allSkillPlacement.blend === 1, 'all3 skill placement/blend changed');

const simple = await A.loadFrameAction(0x33010001, 0);
assert(simple.format === 'simple' && simple.frameCount === 4, 'simple effect framelist fallback changed');
for (const frame of simple.frames) assert(localExists(frame.url), `simple effect cached frame missing ${frame.relativePath}`);
const simplePlacement = B.framePlacement('all1', simple.frames[0], { master:false });
assert(simplePlacement.width === 100 && simplePlacement.height === 100 && simplePlacement.blend === 1, 'simple effect fallback placement changed');

console.log('offline animation master PASS: body/enemy/friendly/skill DA actions + simple effect, all frames cached');
