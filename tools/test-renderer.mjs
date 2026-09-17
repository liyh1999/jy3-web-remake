import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {
  JYResources: {
    url(id) { return id === 0x56050001 ? './image/bjmap/0001.png' : null; }
  }
};
vm.runInThisContext(fs.readFileSync('src/renderer.js', 'utf8'), { filename: 'src/renderer.js' });
const R = globalThis.window.JYRenderer;

if (R.LOGICAL_WIDTH !== 853 || R.LOGICAL_HEIGHT !== 480) throw new Error('logical resolution mismatch');
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

if (stage.childCount !== 1 || root.childCount !== 1) throw new Error('scene graph childCount mismatch');
if (stage.getChildByName('root') !== root) throw new Error('getChildByName failed');
if (R.findNode('root|hero', '|') !== quad) throw new Error('FindNode path traversal failed');

const front = R.textQuad();
front.name = 'label';
root.addChildAt(front, 0);
if (root.getChildAt(0) !== front || root.getChildAt(1) !== quad) throw new Error('addChildAt ordering failed');
quad.removeFromParent();
if (root.childCount !== 1 || quad.parent !== null) throw new Error('removeFromParent failed');
R.reset();
if (stage.childCount !== 0) throw new Error('renderer reset failed');

console.log('renderer scene graph PASS');
