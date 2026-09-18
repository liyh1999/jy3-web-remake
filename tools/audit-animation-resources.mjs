import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const vendor = path.join(root, 'vendor', 'upstream', 'JY3');
const index = JSON.parse(fs.readFileSync(path.join(root, 'vendor', 'upstream-file-index.json'), 'utf8'));
const upstream = new Set((index.files || []).map(x => x.path));

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

const dirPath = path.join(vendor, 'script', 'dir.lua');
if (!fs.existsSync(dirPath)) throw new Error('cached script/dir.lua missing');
const dirs = A.parseDirectoryMap(fs.readFileSync(dirPath, 'utf8'));

const requiredDirs = new Map([
  [0x03010000,'framelist/effect'],
  [0x03020000,'framelist/hunting'],
  [0x03030000,'framelist/body'],
  [0x03040000,'framelist/skill'],
  [0x03060000,'framelist/enemy'],
  [0x03070000,'framelist/friendly'],
  [0x02030000,'fonts/role/1/1'],
  [0x02040000,'fonts/role/1/2'],
  [0x05860000,'spine/skill/97'],
  [0x060d0000,'image/frame'],
  [0x06110000,'image/frameshunting'],
  [0x06130000,'image/body'],
]);
for (const [base, expected] of requiredDirs) {
  if (dirs.get(base) !== expected) {
    throw new Error('dir.lua mapping mismatch 0x' + base.toString(16) + ': ' + dirs.get(base) + ' != ' + expected);
  }
}

const framelistFiles = [...upstream].filter(p => /^framelist\/.+\.swf$/i.test(p));
const byGroup = {};
for (const file of framelistFiles) {
  const group = file.split('/')[1] || '(root)';
  byGroup[group] = (byGroup[group] || 0) + 1;
}
const expectedGroups = {body:25,effect:75,enemy:431,friendly:96,hunting:16,skill:190};
for (const [group, expected] of Object.entries(expectedGroups)) {
  if (byGroup[group] !== expected) {
    throw new Error('pinned framelist count changed for ' + group + ': ' + byGroup[group] + ' != ' + expected);
  }
}
if (framelistFiles.length !== 833) throw new Error('pinned framelist total changed: ' + framelistFiles.length + ' != 833');

const spineFiles = [...upstream].filter(p => p.startsWith('spine/'));
const spineRuntime = spineFiles.filter(p => /\.(json|atlas|skel)$/i.test(p));
const spinePng = spineFiles.filter(p => /\.png$/i.test(p));
const spinePsd = spineFiles.filter(p => /\.psd$/i.test(p));
const spineOther = spineFiles.filter(p => !/\.(png|psd|json|atlas|skel)$/i.test(p));
if (spineRuntime.length !== 0) throw new Error('pinned spine tree unexpectedly contains json/atlas/skel runtime data');
if (spinePng.length !== 2075) throw new Error('pinned spine PNG count changed: ' + spinePng.length + ' != 2075');
if (spinePsd.length !== 1 || spinePsd[0] !== 'spine/skill/97/未标题-1.psd') {
  throw new Error('pinned spine PSD source-artifact set changed: ' + spinePsd.join(', '));
}
if (spineOther.length) throw new Error('pinned spine tree has unexpected files: ' + spineOther.slice(0,10).join(', '));

const samples = [
  { id:0x33030001, file:'framelist/body/0001.swf', rate:15, frames:34, first:'image/body/0499.png' },
  { id:0x33010001, file:'framelist/effect/0001.swf', rate:20, frames:4, first:'image/frame/a001.png' },
  { id:0x33060001, file:'framelist/enemy/0001.swf', rate:4, frames:8, first:'fonts/role/1/2/0001.png' },
  { id:0x33070001, file:'framelist/friendly/0001.swf', rate:4, frames:8, first:'fonts/role/1/1/0001.png' },
  { id:0x33020001, file:'framelist/hunting/0001.swf', rate:46, frames:23, first:'image/frameshunting/1001.png' },
  { id:0x33040061, file:'framelist/skill/0061.swf', rate:6, frames:12, first:'spine/skill/97/0001.png' },
];

const sampleReport=[];
for (const sample of samples) {
  const local = path.join(vendor, ...sample.file.split('/'));
  if (!fs.existsSync(local)) throw new Error('cached sample missing: ' + sample.file);
  const parsed = A.parseFrameList(fs.readFileSync(local, 'utf8'), sample.id);
  if (parsed.rate !== sample.rate || parsed.frameCount !== sample.frames || parsed.loop !== true) {
    throw new Error(sample.file + ': header/frame count mismatch');
  }
  const described = A.describeFrameList(parsed, dirs, './vendor/upstream/JY3');
  if (described.frames[0]?.relativePath !== sample.first) {
    throw new Error(sample.file + ': expected first frame ' + sample.first + ', got ' + described.frames[0]?.relativePath);
  }
  for (const frame of described.frames) {
    if (frame.kind !== 'image' || !frame.relativePath) {
      throw new Error(sample.file + ': frame ' + frame.index + ' did not resolve to an image');
    }
    if (!upstream.has(frame.relativePath)) {
      throw new Error(sample.file + ': upstream frame missing ' + frame.relativePath);
    }
  }
  if (!fs.existsSync(path.join(vendor, ...sample.first.split('/')))) {
    throw new Error('representative first frame not cached: ' + sample.first);
  }
  sampleReport.push({
    id:'0x' + sample.id.toString(16).padStart(8,'0'),
    file:sample.file,
    rate:parsed.rate,
    loop:parsed.loop,
    frameCount:parsed.frameCount,
    durationMs:parsed.durationMs,
    firstFrame:sample.first,
  });
}

const report = {
  schemaVersion:1,
  upstreamRevision:index.upstreamRevision,
  directoryEntryCount:dirs.size,
  framelist:{total:framelistFiles.length,byGroup},
  spine:{fileCount:spineFiles.length,pngCount:spinePng.length,psdCount:spinePsd.length,jsonAtlasSkelCount:spineRuntime.length},
  samples:sampleReport,
  findings:{
    framelistEncoding:'plain-text marker + rate,loop + hexadecimal resource ids',
    marker:A.FRAME_LIST_MARKER,
    typeTagRule:'high nibble chooses extension; low 28 bits choose dir.lua directory/index',
    spineLayout:'2075 PNG sequence frames + one PSD source artifact; no .json/.atlas/.skel in pinned tree',
  },
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports','animation-resource-audit.json'),JSON.stringify(report,null,2)+'\n');
const md = [
  '# 动画资源格式审计',
  '',
  '上游 revision: ' + report.upstreamRevision,
  '',
  '- framelist 文本文件：' + report.framelist.total,
  '- body/effect/enemy/friendly/hunting/skill：' + Object.entries(byGroup).map(([k,v])=>k+'='+v).join(', '),
  '- spine/ 文件：' + report.spine.fileCount + '，PNG：' + report.spine.pngCount + '，PSD 源素材：' + report.spine.psdCount,
  '- 标准 Spine json/atlas/skel：' + report.spine.jsonAtlasSkelCount,
  '- framelist marker：' + A.FRAME_LIST_MARKER,
  '',
  '## 代表样本',
  '',
  '| framelist | FPS | 循环 | 帧数 | 第一帧 |',
  '|---|---:|---|---:|---|',
  ...sampleReport.map(x=>'| '+x.file+' | '+x.rate+' | '+(x.loop ? '是':'否')+' | '+x.frameCount+' | '+x.firstFrame+' |'),
  '',
  '## 关键结论',
  '',
  '- .swf 是纯文本资源清单，不是 Adobe SWF 二进制。',
  '- 第 1 行是固定 marker；第 2 行是 rate,loop；后续行是无 0x 前缀的十六进制资源 ID。',
  '- 原资源 ID 的高 4 位决定扩展名，低 28 位由 dir.lua 决定目录和文件序号。',
  '- spine/skill/* 的运行时素材是 PNG 序列帧；另有 1 个 PSD 源素材残留，不存在标准 Spine json/atlas/skel runtime 数据。',
  '',
].join('\n');
fs.writeFileSync(path.join(root,'reports','animation-resource-audit.md'),md);

console.log('animation audit PASS: framelist=' + framelistFiles.length + ', spine PNG=' + spinePng.length + ', dirs=' + dirs.size + ', samples=' + samples.length);
