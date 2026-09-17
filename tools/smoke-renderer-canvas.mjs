import fs from 'node:fs';
import vm from 'node:vm';

const calls = {
  drawImage: [],
  fillText: [],
  strokeText: [],
  clearRect: 0,
};

const ctx = {
  globalAlpha: 1,
  imageSmoothingEnabled: true,
  font: '',
  textBaseline: 'top',
  textAlign: 'left',
  fillStyle: '#fff',
  strokeStyle: '#000',
  lineWidth: 1,
  lineJoin: 'round',
  shadowColor: 'transparent',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowBlur: 0,
  setTransform() {},
  clearRect() { calls.clearRect += 1; },
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  scale() {},
  beginPath() {},
  rect() {},
  clip() {},
  drawImage(...args) { calls.drawImage.push(args); },
  measureText(text) { return { width: [...String(text)].length * 12 }; },
  fillText(...args) { calls.fillText.push(args); },
  strokeText(...args) { calls.strokeText.push(args); },
};

const host = {
  style: {},
  clientWidth: 853,
  clientHeight: 480,
  getBoundingClientRect() { return { width: 853, height: 480 }; },
  prepend(node) { node.isConnected = true; },
};

const canvas = {
  id: '',
  width: 0,
  height: 0,
  isConnected: false,
  style: {},
  setAttribute() {},
  getContext(kind) {
    if (kind !== '2d') throw new Error(`unexpected context ${kind}`);
    return ctx;
  },
};

class FakeImage {
  constructor() {
    this.complete = true;
    this.naturalWidth = 30;
    this.naturalHeight = 30;
    this.width = 30;
    this.height = 30;
    this.decoding = '';
  }
  set src(value) { this._src = value; }
  get src() { return this._src; }
}

globalThis.window = {
  addEventListener() {},
  JYResources: {
    url(id) { return id ? `./asset/${Number(id).toString(16)}.png` : null; },
    imageWidth() { return 30; },
    imageHeight() { return 30; },
  },
};
globalThis.document = {
  readyState: 'complete',
  querySelector(selector) {
    if (selector === '#gcoreHost') return host;
    if (selector === '#scene') return host;
    return null;
  },
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
    return canvas;
  },
};
globalThis.Image = FakeImage;
globalThis.devicePixelRatio = 1;
globalThis.getComputedStyle = () => ({ position: 'relative' });

vm.runInThisContext(fs.readFileSync('src/renderer.js', 'utf8'), { filename: 'src/renderer.js' });
const R = window.JYRenderer;
if (!R) throw new Error('renderer not initialized');

R.reset();

const image = R.quad();
image.name = 'plain-image';
image.img = 0x56050001;
image.width = 30;
image.height = 30;
R.stage().addChild(image);
R.render();
if (calls.drawImage.length < 1) throw new Error('plain image did not call drawImage');

const beforeGrid = calls.drawImage.length;
const panel = R.quad();
panel.name = 'grid9-panel';
panel.img = 0x56160045;
panel.width = 120;
panel.height = 90;
R.setImageGrid(panel.img, 5, 5, 5, 5);
R.stage().addChild(panel);
R.render();
const gridDraws = calls.drawImage.length - beforeGrid;
if (gridDraws < 9) throw new Error(`grid9 expected at least 9 drawImage calls, got ${gridDraws}`);

const text = R.textQuad();
text.name = 'label';
text.width = 160;
text.height = 80;
text.font = 0x61200000;
text.style = 2;
text.wrap = true;
text.text = '你好[br]江湖';
R.stage().addChild(text);
R.render();
if (calls.fillText.length < 2) throw new Error(`text renderer expected multiple fillText calls, got ${calls.fillText.length}`);
if (!ctx.font.startsWith('32px ')) throw new Error(`encoded font size was not applied: ${ctx.font}`);

R.setBackground(0x56050001);
R.render();
if (R.stage().getChildByName('__background') == null) throw new Error('setBackground did not create background node');
if (calls.drawImage.length < 1) throw new Error('background did not render');

if (calls.clearRect < 1) throw new Error('renderer never cleared canvas');
console.log(`renderer canvas smoke PASS: drawImage=${calls.drawImage.length}, fillText=${calls.fillText.length}, grid9=${gridDraws}`);
