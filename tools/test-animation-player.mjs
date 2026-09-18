import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {
  JY_CONFIG: { assetBase: './vendor/upstream/JY3' },
};
vm.runInThisContext(fs.readFileSync('src/resource-catalog.js', 'utf8'), { filename:'src/resource-catalog.js' });
vm.runInThisContext(fs.readFileSync('src/animation-resources.js', 'utf8'), { filename:'src/animation-resources.js' });
vm.runInThisContext(fs.readFileSync('src/animation-player.js', 'utf8'), { filename:'src/animation-player.js' });

const A = window.JYAnimationResources;
const { FramePlayer } = window.JYFramePlayer;

if (A.actionResourceId(0x33069998, 0x1001) !== 0x33061001) {
  throw new Error('enemy frameActionID mapping mismatch');
}
if (A.actionResourceId(0x33079999, 1) !== 0x33070001) {
  throw new Error('friendly idle frameActionID mapping mismatch');
}
if (A.actionResourceId(0x33039998, 0) !== 0x33039998) {
  throw new Error('action 0 must preserve node default framelist');
}
if (A.actionResourceId(0x33049999, 0x61) !== 0x33040061) {
  throw new Error('skill frameActionID mapping mismatch');
}

function schedulerHarness() {
  let nextId = 1;
  const queue = [];
  const cancelled = new Set();
  return {
    schedule(fn) {
      const id = nextId++;
      queue.push({ id, fn });
      return id;
    },
    cancel(id) { cancelled.add(id); },
    step(timestamp) {
      while (queue.length) {
        const item = queue.shift();
        if (cancelled.has(item.id)) continue;
        item.fn(timestamp);
        return true;
      }
      return false;
    },
    pending() { return queue.filter(item => !cancelled.has(item.id)).length; }
  };
}

let now = 0;
const scheduler = schedulerHarness();
const frames = [0x56130001,0x56130002,0x56130003].map(id => ({ id, url:`frame-${id}.png` }));
const events = [];
let preloadCalls = 0;
const player = new FramePlayer({
  loader: async resourceId => ({ resourceId, rate:10, loop:false, frames }),
  schedule: fn => scheduler.schedule(fn),
  cancelSchedule: id => scheduler.cancel(id),
  now: () => now,
  isHidden: () => false,
  preload: async input => { preloadCalls += 1; return input; },
});

const oneShot = player.play('hero', {
  resourceId:0x33030001,
  loop:false,
  onFrame(frame, meta) { events.push(['frame', frame.id, meta.index, meta.cycle]); },
  onFrameEnd(meta) { events.push(['end', meta.cycle]); },
  onComplete(meta) { events.push(['complete', meta.cycle]); },
});
await oneShot.ready;
if (preloadCalls !== 1) throw new Error('player did not preload frames once');
if (events.length !== 1 || events[0][2] !== 0) throw new Error('player did not emit first frame immediately');

now = 100; scheduler.step(now);
now = 200; scheduler.step(now);
now = 300; scheduler.step(now);
if (player.state('hero') !== null) throw new Error('one-shot player did not stop after first cycle');
if (!events.some(x => x[0] === 'end' && x[1] === 1)) throw new Error('one-shot frame-end missing');
if (!events.some(x => x[0] === 'complete' && x[1] === 1)) throw new Error('one-shot complete missing');
if (events.filter(x => x[0] === 'frame').map(x => x[2]).join(',') !== '0,1,2') {
  throw new Error('one-shot frame order mismatch');
}

const loopScheduler = schedulerHarness();
let loopNow = 0;
const loopEvents = [];
const loopPlayer = new FramePlayer({
  loader: async resourceId => ({ resourceId, rate:5, loop:true, frames:frames.slice(0,2) }),
  schedule: fn => loopScheduler.schedule(fn),
  cancelSchedule: id => loopScheduler.cancel(id),
  now: () => loopNow,
  isHidden: () => false,
  preload: async input => input,
});
const looping = loopPlayer.play('idle', {
  resourceId:0x33070001,
  onFrame(_frame, meta) { loopEvents.push(['frame', meta.index, meta.cycle]); },
  onFrameEnd(meta) { loopEvents.push(['end', meta.cycle]); },
});
await looping.ready;
loopNow = 200; loopScheduler.step(loopNow);
loopNow = 400; loopScheduler.step(loopNow);
if (!loopEvents.some(x => x[0] === 'end' && x[1] === 1)) throw new Error('loop cycle end missing');
if (!loopEvents.some(x => x[0] === 'frame' && x[1] === 0 && x[2] === 1)) throw new Error('loop did not restart at frame 0');
if (loopPlayer.state('idle')?.active !== true) throw new Error('loop player stopped unexpectedly');
loopPlayer.stop('idle');
if (loopPlayer.state('idle') !== null) throw new Error('manual stop did not clear channel');

const hiddenScheduler = schedulerHarness();
let hiddenNow = 0;
let hidden = false;
const hiddenFrames = [];
const hiddenPlayer = new FramePlayer({
  loader: async resourceId => ({ resourceId, rate:10, loop:true, frames }),
  schedule: fn => hiddenScheduler.schedule(fn),
  cancelSchedule: id => hiddenScheduler.cancel(id),
  now: () => hiddenNow,
  isHidden: () => hidden,
  preload: async input => input,
});
await hiddenPlayer.play('hidden', {
  resourceId:0x33030001,
  onFrame(_frame, meta) { hiddenFrames.push(meta.index); }
}).ready;
hidden = true;
hiddenNow = 5000;
hiddenScheduler.step(hiddenNow);
hidden = false;
hiddenNow = 5100;
hiddenScheduler.step(hiddenNow);
if (hiddenFrames.join(',') !== '0,1') {
  throw new Error(`hidden-tab catch-up advanced frames unexpectedly: ${hiddenFrames.join(',')}`);
}
hiddenPlayer.stopAll();

let resolveOld;
const replaceScheduler = schedulerHarness();
const replaceFrames = [];
const replacePlayer = new FramePlayer({
  loader(resourceId) {
    if (resourceId === 0x33030001) return new Promise(resolve => { resolveOld = resolve; });
    return Promise.resolve({ resourceId, rate:10, loop:false, frames });
  },
  schedule: fn => replaceScheduler.schedule(fn),
  cancelSchedule: id => replaceScheduler.cancel(id),
  now: () => 0,
  isHidden: () => false,
  preload: async input => input,
});
const old = replacePlayer.play('same', {
  resourceId:0x33030001,
  onFrame() { replaceFrames.push('old'); }
});
const current = replacePlayer.play('same', {
  resourceId:0x33030002,
  onFrame() { replaceFrames.push('new'); }
});
await current.ready;
resolveOld({ resourceId:0x33030001, rate:10, loop:false, frames });
await old.ready;
if (replaceFrames.join(',') !== 'new') throw new Error('stale async animation replaced current channel');

console.log('animation player PASS: action mapping + preload + one-shot + loop + hidden-tab + replacement');
