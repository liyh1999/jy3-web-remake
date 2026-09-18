import fs from 'node:fs';
import vm from 'node:vm';

const instances = [];
class FakeAudio {
  constructor(url) {
    this.url = url;
    this.src = url;
    this.loop = false;
    this.volume = 1;
    this.preload = '';
    this.currentTime = 0;
    this.paused = false;
    this.playCount = 0;
    this.listeners = new Map();
    instances.push(this);
  }
  play() {
    this.playCount += 1;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(name, fn) {
    this.listeners.set(name, fn);
  }
  end() {
    this.listeners.get('ended')?.();
  }
}

globalThis.Audio = FakeAudio;
globalThis.window = {
  Audio: FakeAudio,
  JY_CONFIG: { assetBase: './vendor/upstream/JY3', imageSizes: {} },
};

for (const file of ['src/resource-catalog.js', 'src/resources.js', 'src/audio.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

const R = window.JYResources;
const A = window.JYAudio;

if (!R.play(0x49010038, 1, true, 1)) throw new Error('failed to start representative BGM');
let snap = A.snapshot(1);
if (!snap.longLived || snap.longLived.resourceId !== 0x49010038 || snap.longLived.rawVolume !== 1) {
  throw new Error('long-lived voice/raw volume was not preserved');
}
const firstBgm = instances[0];

if (!R.play(0x49011003, 1, false, 100)) throw new Error('failed to start UI SFX');
if (firstBgm.paused) throw new Error('UI SFX incorrectly stopped long-lived audio in the same group');
snap = A.snapshot(1);
if (snap.oneShots.length !== 1 || snap.oneShots[0].rawVolume !== 100) {
  throw new Error('one-shot voice/raw volume was not preserved');
}

if (!R.play(0x4902000a, 1, false, 100)) throw new Error('failed to start battle SFX');
snap = A.snapshot(1);
if (snap.oneShots.length !== 2) throw new Error('same-group one-shots must overlap');

const firstUi = instances[1];
const firstBattleSfx = instances[2];
if (!R.play(0x49010021, 1, true, 1)) throw new Error('failed to replace long-lived audio');
if (!firstBgm.paused) throw new Error('new long-lived voice did not replace the previous long-lived voice');
if (firstUi.paused || firstBattleSfx.paused) {
  throw new Error('long-lived replacement incorrectly stopped transient SFX');
}

snap = A.snapshot(1);
if (!snap.longLived || snap.longLived.resourceId !== 0x49010021 || snap.oneShots.length !== 2) {
  throw new Error('group state after long-lived replacement is incorrect');
}

firstUi.end();
snap = A.snapshot(1);
if (snap.oneShots.length !== 1) throw new Error('ended one-shot was not released');

if (!R.stop(1)) throw new Error('Stop(1) did not stop active group');
snap = A.snapshot(1);
if (snap.longLived || snap.oneShots.length) throw new Error('Stop(1) did not clear all group voices');
if (!instances[2].paused || !instances[3].paused) throw new Error('Stop(1) did not pause remaining media');

if (A.browserGain(1) !== 1 || A.browserGain(100) !== 1) {
  throw new Error('initial D2-2 gain policy unexpectedly changed legacy browser loudness');
}

console.log('JYAudio lifecycle PASS: long-lived replacement + overlapping SFX + group Stop + raw volume preservation');
