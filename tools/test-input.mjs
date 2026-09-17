import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = { JYResources: { imageWidth: () => 0, imageHeight: () => 0 } };
vm.runInThisContext(fs.readFileSync('src/renderer.js', 'utf8'), { filename: 'src/renderer.js' });
vm.runInThisContext(fs.readFileSync('src/input.js', 'utf8'), { filename: 'src/input.js' });

const R = window.JYRenderer;
const I = window.JYInput;

const center = I.screenToLogical(426.5, 240, { left: 0, top: 0, width: 853, height: 480 });
if (Math.abs(center.x) > 1e-9 || Math.abs(center.y) > 1e-9 || !center.inside) throw new Error('screen center mapping failed');
const topLeft = I.screenToLogical(0, 0, { left: 0, top: 0, width: 853, height: 480 });
if (topLeft.x !== -426.5 || topLeft.y !== 240) throw new Error('screen top-left mapping failed');

R.reset();
const root = R.container();
root.name = 'root';
const low = R.quad();
low.name = 'low';
low.width = 100;
low.height = 60;
low.mouseEnabled = true;
root.addChild(low);
const high = R.quad();
high.name = 'high';
high.width = 60;
high.height = 40;
high.mouseEnabled = true;
root.addChild(high);
R.stage().addChild(root);
if (I.hitTest({ x: 0, y: 0, inside: true }) !== high) throw new Error('top-most hit ordering failed');
high.visible = false;
if (I.hitTest({ x: 0, y: 0, inside: true }) !== low) throw new Error('visibility hit filtering failed');

const transformed = R.quad();
transformed.name = 'transformed';
transformed.x = 120;
transformed.y = -40;
transformed.width = 40;
transformed.height = 20;
transformed.scaleX = 2;
transformed.scaleY = 2;
transformed.mouseEnabled = true;
root.addChild(transformed);
if (I.hitTest({ x: 150, y: -40, inside: true }) !== transformed) throw new Error('scaled/translated hit failed');
if (I.hitTest({ x: 170, y: -40, inside: true }) === transformed) throw new Error('out-of-bounds transform hit failed');

const q = I.normalizeKey('q');
if (q.info !== 'Q' || q.code !== 81 || I.hotkeySlot('q') !== 1) throw new Error('Q hotkey mapping failed');
if (I.hotkeySlot('r') !== 4 || I.hotkeySlot('a') !== 0) throw new Error('hotkey slot mapping failed');
const esc = I.normalizeKey('Escape');
if (esc.code !== 27 || esc.info.charCodeAt(0) !== 27) throw new Error('Escape mapping failed');
const enter = I.normalizeKey('Enter');
if (enter.code !== 13 || enter.info.charCodeAt(0) !== 13) throw new Error('Enter mapping failed');
const left = I.normalizeKey('ArrowLeft');
if (left.code !== 37 || left.info.charCodeAt(0) !== 37) throw new Error('arrow mapping failed');

let priorityOrder = [];
I.subscribe('probe', () => { priorityOrder.push('low'); }, 1);
I.subscribe('probe', () => { priorityOrder.push('high'); }, 10);
I.dispatch('probe', null, { x: 0, y: 0 });
if (priorityOrder.join(',') !== 'high,low') throw new Error('subscriber priority failed');

console.log('gcore input mapping/hit-test PASS');
