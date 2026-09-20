import fs from 'node:fs';
import vm from 'node:vm';

const frames = [];
globalThis.window = {};
globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
vm.runInThisContext(fs.readFileSync('src/renderer.js', 'utf8'), { filename: 'src/renderer.js' });

const R = window.JYRenderer;
if (typeof R.tweenNodeProperty !== 'function') throw new Error('renderer tweenNodeProperty missing');

const node = R.createNodeHandle('quad');
R.setNodeProperty(node, 'x', 0);
if (!R.tweenNodeProperty(node, 'x', 100, 10)) throw new Error('numeric tween did not start');

let cb = frames.shift();
cb(1000);
cb = frames.shift();
cb(1050);
const midX = R.getNodeProperty(node, 'x');
if (Math.abs(midX - 5) > 0.001) throw new Error('numeric tween midpoint mismatch: ' + midX);
cb = frames.shift();
cb(1100);
if (R.getNodeProperty(node, 'x') !== 10) throw new Error('numeric tween final value mismatch');

R.setNodeProperty(node, 'color', 0x000000);
R.tweenNodeProperty(node, 'color', 100, 0xffffff);
cb = frames.shift();
cb(2000);
cb = frames.shift();
cb(2050);
const midColor = R.getNodeProperty(node, 'color') >>> 0;
if (midColor !== 0x808080) throw new Error('packed color tween midpoint mismatch: 0x' + midColor.toString(16));
cb = frames.shift();
cb(2100);
if ((R.getNodeProperty(node, 'color') >>> 0) !== 0xffffff) throw new Error('packed color tween final mismatch');

R.setNodeProperty(node, 'y', 2);
R.tweenNodeProperty(node, 'y', 100, 9);
R.tweenNodeProperty(node, 'y', 0, 4);
cb = frames.shift();
cb(3000);
if (R.getNodeProperty(node, 'y') !== 4) throw new Error('new tween did not cancel stale property tween');

console.log('renderer tween semantics PASS');
console.log('  x/y/rotation/scale-style numeric properties interpolate by duration');
console.log('  packed RGB color interpolates per channel and stale tweens are cancelled');
