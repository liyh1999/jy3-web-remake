import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const vendor = path.join(root, 'vendor', 'upstream', 'JY3');
const index = JSON.parse(fs.readFileSync(path.join(root, 'vendor', 'upstream-file-index.json'), 'utf8'));
const upstream = new Set((index.files || []).map(row => row.path));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function read(relative) {
  const file = path.join(vendor, ...relative.split('/'));
  if (!fs.existsSync(file)) throw new Error('cached audit source missing: ' + relative);
  return fs.readFileSync(file, 'utf8');
}
function countPrefix(prefix) {
  return [...upstream].filter(file => file.startsWith(prefix)).length;
}

const counts = {
  head: countPrefix('image/head/'),
  body: countPrefix('image/body/'),
  bodyframe: countPrefix('image/bodyframe/'),
  standmap: countPrefix('image/standmap/'),
};
assert(counts.head === 333, 'pinned head resource count changed: ' + counts.head);
assert(counts.body === 611, 'pinned body resource count changed: ' + counts.body);
assert(counts.bodyframe === 0, 'pinned bodyframe tree unexpectedly has files: ' + counts.bodyframe);
assert(counts.standmap === 81, 'pinned standmap resource count changed: ' + counts.standmap);

globalThis.window = { JY_CONFIG: { assetBase:'./vendor/upstream/JY3', imageSizes:{} } };
for (const file of ['src/resource-catalog.js','src/resources.js','src/animation-resources.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename:file });
}
const A = window.JYAnimationResources;
const dirs = A.parseDirectoryMap(read('script/dir.lua'));
assert(dirs.get(0x06080000) === 'image/head', 'head dir mapping changed');
assert(dirs.get(0x06090000) === 'image/standmap', 'standmap dir mapping changed');
assert(dirs.get(0x06130000) === 'image/body', 'body dir mapping changed');

const bodyData = read('script/01_data/o_body.lua');
const roleData = read('script/01_data/o_role.lua');
const initProgram = read('script/04_program/p_init.lua');
const battleView = read('script/02_ui_view/v_battle.lua');
const battleComponent = read('script/03_ui_component/c_battle.lua');
const cityComponent = read('script/03_ui_component/c_citymap_system_map.lua');

assert(/\['119'\]\s*=\s*0x56080001/.test(bodyData), 'default player portrait is no longer 0x56080001');
assert(/\['站立图像'\]\s*=\s*0x56090001/.test(roleData), 'role standmap field fixture changed');
assert(initProgram.includes('G.QueryName(0x10040000 + i).头像 = 0x56080000 + i'), 'role portrait initialization changed');
assert(battleView.includes("tc.name = 'team1'") && battleView.includes('tc.img = 0x33039998'), 'default player battle master changed');
assert(battleComponent.includes("self.obj.getChildByName('tab').getChildByName(位置[1]).img = 0x33039997"), 'female player battle master switch changed');
assert(battleComponent.includes("G.QueryName(0x10030001)[tostring(119)]"), 'battle player portrait no longer reads o_body[119]');
assert(battleComponent.includes('p >= 253 and p < 385'), 'special cloned-role range changed');
assert(battleComponent.includes('frameActionID(int_编号)'), 'special cloned-role action selector changed');
assert(!cityComponent.includes('站立图像'), 'citymap unexpectedly started consuming standmap; audit assumptions need review');
assert(!cityComponent.includes('frameActionID'), 'citymap unexpectedly gained a moving framelist actor; audit assumptions need review');

for (const required of [
  'image/head/0001.png',
  'image/standmap/0001.png',
  'framelist/body/9997.swf',
  'framelist/body/9998.swf',
]) {
  assert(upstream.has(required), 'pinned appearance resource missing: ' + required);
  assert(fs.existsSync(path.join(vendor, ...required.split('/'))), 'offline appearance resource not cached: ' + required);
}

const male = await A.loadFrameAction(0x33039998, 0);
const female = await A.loadFrameAction(0x33039997, 0);
assert(male.format === 'action' && male.frameCount === 16, 'male body master idle changed');
assert(female.format === 'action' && female.frameCount === 8, 'female body master idle changed');
assert(male.frames[0]?.relativePath === 'image/body/0001.png', 'male body master no longer uses complete body PNG');
assert(female.frames[0]?.relativePath === 'image/primadonna/0001.png', 'female body master no longer uses primadonna PNG');

const report = {
  schemaVersion:1,
  upstreamRevision:index.upstreamRevision,
  counts,
  player:{
    portraitField:'o_body[119]',
    defaultPortrait:'0x56080001',
    maleBattleMaster:'0x33039998',
    femaleBattleMaster:'0x33039997',
    femaleSexRule:'o_body.性别 == 0',
  },
  npc:{
    portraitInit:'0x56080000 + DB index',
    standField:'o_role.站立图像',
    sampleStand:'0x56090001',
    friendlyMaster:'0x33079999',
    enemyMaster:'0x33069998',
    clonedRoleRule:'253 <= role id < 385 => use o_role.编号 as frameActionID',
  },
  citymap:{
    model:'background + city hotspots + HUD portrait',
    consumesStandmap:false,
    movingPlayerSprite:false,
  },
  battle:{
    maleIdleFrames:male.frameCount,
    femaleIdleFrames:female.frameCount,
    maleFirstFrame:male.frames[0]?.relativePath,
    femaleFirstFrame:female.frames[0]?.relativePath,
    headLayerCompositedOntoBody:false,
  },
};

fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports','character-appearance-audit.json'),JSON.stringify(report,null,2)+'\n');
const md = [
  '# 角色外观资源审计',
  '',
  '上游 revision: ' + report.upstreamRevision,
  '',
  '## 资源树',
  '',
  '| 资源 | 文件数 | 原用途 |',
  '|---|---:|---|',
  '| image/head | '+counts.head+' | HUD / 对话 / 战斗头像 |',
  '| image/body | '+counts.body+' | 男主战斗整帧 |',
  '| image/standmap | '+counts.standmap+' | o_role.站立图像静态资源 |',
  '| image/bodyframe | '+counts.bodyframe+' | 固定上游无文件，仅残留 family |',
  '',
  '## 主角',
  '',
  '- 头像权威字段：o_body[119]，默认 0x56080001。',
  '- 默认战斗 master：0x33039998 / body/9998.swf。',
  '- o_body.性别 == 0 时原 c_battle 切换为 0x33039997 / body/9997.swf。',
  '- body master 的帧已经是完整 PNG；原脚本没有把 image/head 再叠到战斗 body 上。',
  '',
  '## NPC',
  '',
  '- p_init 将角色头像初始化为 0x56080000 + DB index。',
  '- o_role.站立图像保存 0x560900xx 静态图。',
  '- 战斗我方 master 0x33079999，敌方 master 0x33069998。',
  '- role id 253..384 是克隆角色，原 c_battle 用 o_role.编号 选择 master DA。',
  '',
  '## City map',
  '',
  '- 固定上游 c_citymap_system_map 不读取 站立图像，也不调用 frameActionID。',
  '- 因此 citymap 是背景 + 城市热点 + HUD 模型，不新增非原版地图行走主角。',
  '- Web 地图只把 o_body[119] 投影到 HUD 头像。',
  '',
].join('\n');
fs.writeFileSync(path.join(root,'reports','character-appearance-audit.md'),md);

console.log('character appearance audit PASS: head='+counts.head+', body='+counts.body+', standmap='+counts.standmap+', bodyframe='+counts.bodyframe);
