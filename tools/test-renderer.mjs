import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {
  JYResources: {
    url(id) { return id === 0x56050001 ? './image/bjmap/0001.png' : null; },
    imageWidth(id) { return id === 0x56050001 ? 853 : 0; },
    imageHeight(id) { return id === 0x56050001 ? 480 : 0; },
  }
};
vm.runInThisContext(fs.readFileSync('src/renderer.js', 'utf8'), { filename: 'src/renderer.js' });
const R = globalThis.window.JYRenderer;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(R.LOGICAL_WIDTH === 853 && R.LOGICAL_HEIGHT === 480, 'logical resolution mismatch');

// Scene graph ordering/path traversal.
const stage = R.stage();
const root = R.container();
root.name = 'root';
const quad = R.quad();
quad.name = 'hero';
quad.img = 0x56050001;
quad.x = 10;
quad.y = 20;
root.addChild(quad);
stage.addChild(root);
assert(stage.childCount === 1 && root.childCount === 1, 'scene graph childCount mismatch');
assert(stage.getChildByName('root') === root, 'getChildByName failed');
assert(R.findNode('root|hero', '|') === quad, 'FindNode path traversal failed');

const front = R.textQuad();
front.name = 'label';
root.addChildAt(front, 0);
assert(root.getChildAt(0) === front && root.getChildAt(1) === quad, 'addChildAt ordering failed');
quad.removeFromParent();
assert(root.childCount === 1 && quad.parent === null, 'removeFromParent failed');

// Original UI files use centered left/right/top/bottom coordinates.
const layout = R.container();
layout.left = -320;
layout.right = 320;
layout.bottom = -240;
layout.top = 240;
assert(layout.x === 0 && layout.y === 0, 'centered bounds did not derive origin');
assert(layout.width === 640 && layout.height === 480, 'bounds did not derive size');
layout.x = 50;
assert(layout.left === -270 && layout.right === 370, 'moving x did not keep horizontal bounds coherent');

const point = R.container();
point.left = 112;
point.right = 112;
point.bottom = 140;
point.top = 140;
assert(point.x === 112 && point.y === 140 && point.width === 0 && point.height === 0, 'point-layout bounds mismatch');

// Font encoding in original views: 0x61SS0000 => font slot 1, size SS.
const f1 = R.decodeFont(0x61180000);
assert(f1.slot === 1 && f1.size === 0x18, 'encoded font 0x61180000 mismatch');
const f2 = R.decodeFont(0x60320000);
assert(f2.slot === 0 && f2.size === 0x32, 'encoded font 0x60320000 mismatch');
assert(R.styleFor(2).color === '#000000', 'original fontstyle #2 should be black');

// Adaptive viewport preserves 853:480 without stretching.
const fit2x = R.computeViewportFit(1706, 960);
assert(fit2x.scale === 2 && fit2x.width === 1706 && fit2x.height === 960, '2x viewport fit mismatch');
const squareFit = R.computeViewportFit(1000, 1000);
assert(Math.abs(squareFit.width / squareFit.height - 853 / 480) < 1e-9, 'viewport fit distorted logical aspect ratio');
assert(squareFit.top > 0 && squareFit.left === 0, 'square viewport letterbox mismatch');

// Grid9 keeps four borders fixed and stretches only the middle bands.
const slices = R.gridSlices(100, 100, 200, 160, { left: 10, top: 20, right: 30, bottom: 40 });
assert(slices.length === 9, 'Grid9 should produce 9 drawable slices');
assert(slices[0].sw === 10 && slices[0].sh === 20 && slices[0].dw === 10 && slices[0].dh === 20, 'Grid9 top-left corner mismatch');
assert(slices[8].sw === 30 && slices[8].sh === 40 && slices[8].dw === 30 && slices[8].dh === 40, 'Grid9 bottom-right corner mismatch');
assert(slices[4].dw === 160 && slices[4].dh === 100, 'Grid9 center stretch mismatch');

// Numeric handles are the stable Lua<->JS boundary used by runtime_shims.lua.
const handleRoot = R.createNodeHandle('container');
const handleChild = R.createNodeHandle('quad');
R.setNodeProperty(handleRoot, 'name', 'handle-root');
R.setNodeProperty(handleChild, 'name', 'handle-child');
R.setNodeProperty(handleChild, 'left', -25);
R.setNodeProperty(handleChild, 'right', 25);
R.nodeCall(handleRoot, 'addChild', handleChild);
R.nodeCall(R.stageHandle(), 'addChild', handleRoot);
assert(R.getNodeProperty(handleChild, 'width') === 50, 'handle property bridge did not apply bounds');
assert(R.nodeCall(handleRoot, 'getChildByName', 'handle-child') === handleChild, 'handle getChildByName failed');
assert(R.findNodeHandle('handle-root|handle-child', '|') === handleChild, 'handle FindNode failed');
assert(R.nodeCall(handleChild, 'real_width') === 50, 'handle real_width failed');

const cloneRootHandle = R.cloneNodeHandle(handleRoot);
const cloneChildHandle = R.nodeCall(cloneRootHandle, 'getChildByName', 'handle-child');
assert(cloneRootHandle && cloneRootHandle !== handleRoot, 'cloneNodeHandle did not create a new root');
assert(cloneChildHandle && cloneChildHandle !== handleChild, 'cloneNodeHandle did not deep-clone children');
assert(R.getNodeProperty(cloneChildHandle, 'width') === 50, 'deep clone lost original node layout');
R.setNodeProperty(cloneChildHandle, 'name', 'clone-child');
assert(R.getNodeProperty(handleChild, 'name') === 'handle-child', 'clone mutation leaked into template');

const snap = R.snapshot();
assert(snap.type === 'stage' && Array.isArray(snap.children), 'renderer snapshot malformed');

R.reset();
assert(stage.childCount === 0, 'renderer reset failed');

console.log('renderer PASS: centered layout + hierarchy + font + Grid9 + adaptive viewport + Lua handle bridge');
