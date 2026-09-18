import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/battle-effects.js','utf8'), { filename:'src/battle-effects.js' });
const B = window.JYBattleEffects;

function assert(v,m){ if(!v) throw new Error(m); }

assert(B.LOGICAL_WIDTH===640 && B.LOGICAL_HEIGHT===480,'battle logical size changed');
assert(B.node('team1').x===173 && B.node('team1').y===-13,'team1 flash node mismatch');
assert(B.node('enemy4').x===-206 && B.node('enemy4').y===78,'enemy4 flash node mismatch');
assert(B.node('all1').blend===1 && B.node('all2').blend===1 && B.node('all3').blend===1,'multi-target blend flags missing');

const skill=B.framePlacement('enemy1',{x:-98,y:-174},{master:true});
assert(skill.left===111 && skill.bottom===194,'master skill frame offset placement mismatch');
assert(skill.width===null && skill.height===null,'master skill frame must preserve natural image size');

const simple=B.framePlacement('enemy1',{},{master:false});
assert(simple.left===159 && simple.bottom===318,'simple effect should center in original 100x100 flash node');
assert(simple.width===100 && simple.height===100,'simple effect node size mismatch');

const all=B.framePlacement('all3',{x:-80,y:-48},{master:true});
assert(all.left===106 && all.bottom===354 && all.blend===1,'all3 additive placement mismatch');

assert(Math.abs(B.sceneScale(640,480)-1)<1e-9,'native scale mismatch');
assert(Math.abs(B.sceneScale(320,240)-0.5)<1e-9,'half scale mismatch');
assert(Math.abs(B.sceneScale(800,240)-0.5)<1e-9,'scene scale must preserve aspect ratio');

console.log('battle effect layout PASS: original flash anchors + master offsets + multi-target blend');
