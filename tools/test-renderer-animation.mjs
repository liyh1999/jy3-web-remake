import fs from 'node:fs';
import vm from 'node:vm';

let lastPlay = null;
const stopped = [];
globalThis.window = {
  JYResources: {
    url(id) {
      if (id === 0x52040009) return './fonts/role/1/2/0009.png';
      return null;
    },
    imageWidth() { return 0; },
    imageHeight() { return 0; },
    resolve(id) {
      if ((id >>> 0) === 0x33069998) return { kind:'framelist', relativePath:'framelist/enemy/9998.swf' };
      return null;
    },
  },
  JYFramePlayer: {
    play(key, request) {
      lastPlay = { key, request };
      return { key, ready:Promise.resolve(), stop(){} };
    },
    stop(key, reason) { stopped.push([key, reason]); return true; },
    state() { return null; },
    stopAll(reason) { stopped.push(['*', reason]); return true; },
  }
};

vm.runInThisContext(fs.readFileSync('src/renderer.js', 'utf8'), { filename:'src/renderer.js' });
const R = window.JYRenderer;

const handle = R.createNodeHandle('quad');
R.setNodeProperty(handle, 'img', 0x33069998);
if (!R.nodeCall(handle, 'frameActionID', 1001)) throw new Error('renderer frameActionID did not start');
if (!lastPlay) throw new Error('renderer did not call shared frame player');
if (lastPlay.key !== `renderer:${handle}`) throw new Error('renderer animation channel key mismatch');
if (lastPlay.request.baseResourceId !== 0x33069998 || lastPlay.request.actionId !== 1001) {
  throw new Error('renderer frameActionID request mismatch');
}
if (lastPlay.request.loop !== false) throw new Error('enemy attack action must be one-shot');

lastPlay.request.onFrame({ id:0x52040009 });
if (R.getNodeProperty(handle, '_animationFrameImg') !== 0x52040009) {
  throw new Error('renderer did not project current animation frame');
}
lastPlay.request.onFrameEnd({ actionId:1001 });
if (R.nodeCall(handle, 'popFrameEnd') !== 1001) throw new Error('renderer frame-end queue mismatch');
if (R.nodeCall(handle, 'popFrameEnd') !== -1) throw new Error('renderer frame-end queue did not drain');

if (!R.nodeCall(handle, 'frameActionID', 1)) throw new Error('renderer idle frameActionID did not start');
if (lastPlay.request.loop !== true) throw new Error('enemy idle action must loop');

R.setNodeProperty(handle, 'img', 0x56050001);
if (!stopped.some(([key,reason]) => key === `renderer:${handle}` && reason === 'image-change')) {
  throw new Error('changing node img did not stop old animation');
}
if (R.getNodeProperty(handle, '_animationFrameImg') !== 0) throw new Error('image change did not clear animation frame');

R.reset();
if (!stopped.some(([key,reason]) => key === '*' && reason === 'renderer-reset')) {
  throw new Error('renderer reset did not stop shared animation channels');
}

console.log('renderer animation PASS: frameActionID + actor loop policy + frame-end queue + cancellation');
