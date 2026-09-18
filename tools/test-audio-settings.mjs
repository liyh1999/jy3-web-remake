import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/audio.js', 'utf8');

function makeRuntime(initialStorage = null) {
  const instances = [];
  const stored = new Map();
  if (initialStorage !== null) stored.set('jy3.audio.settings.v1', initialStorage);

  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.loop = false;
      this.volume = 1;
      this.preload = '';
      this.currentTime = 17.5;
      this.paused = false;
      this.playCount = 0;
      this.listeners = new Map();
      instances.push(this);
    }
    play() {
      this.playCount += 1;
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    addEventListener(name, fn) {
      this.listeners.set(name, fn);
    }
  }

  const localStorage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
  };

  const window = {
    Audio: FakeAudio,
    localStorage,
    JY_CONFIG: { audioGain: { raw1: 0.5, raw100: 1 } },
    JYResources: {
      resolve(id) {
        return {
          kind: 'audio',
          resolvableFile: true,
          url: `./audio/${Number(id).toString(16)}.mp3`,
        };
      },
    },
  };

  const sandbox = { window, Audio: FakeAudio, console, JSON, Number, Math, Set, Map };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'src/audio.js' });
  return { A: window.JYAudio, instances, stored };
}

{
  const { A } = makeRuntime('{broken json');
  const s = A.settings();
  if (s.master !== 1 || s.longLived !== 1 || s.oneShot !== 1) {
    throw new Error('invalid persisted audio settings must fall back to defaults');
  }
}

const { A, instances, stored } = makeRuntime();
if (!A.play(0x49010038, 1, true, 1)) throw new Error('long-lived audio failed');
if (!A.play(0x49011003, 1, false, 100)) throw new Error('one-shot audio failed');

const bgm = instances[0];
const sfx = instances[1];
if (Math.abs(bgm.volume - 0.5) > 1e-9 || sfx.volume !== 1) {
  throw new Error('raw compatibility gain was not applied before user mix');
}

A.setVolumes({ master: 0.8, longLived: 0.5, oneShot: 0.25 });
if (Math.abs(bgm.volume - 0.2) > 1e-9 || Math.abs(sfx.volume - 0.2) > 1e-9) {
  throw new Error('live media gain did not update after user volume change');
}
const saved = JSON.parse(stored.get(A.STORAGE_KEY));
if (saved.version !== 1 || saved.master !== 0.8 || saved.longLived !== 0.5 || saved.oneShot !== 0.25) {
  throw new Error('audio settings were not persisted');
}

bgm.currentTime = 23.75;
sfx.currentTime = 4;
const affected = A.suspendForPageHide();
if (affected !== 2 || !A.isPageSuspended()) throw new Error('page suspend did not affect active voices');
let snap = A.snapshot(1);
if (!snap.longLived?.suspended || snap.oneShots.length !== 0) {
  throw new Error('page suspend must retain long-lived audio and discard one-shots');
}
if (!bgm.paused || bgm.currentTime !== 23.75 || sfx.currentTime !== 0) {
  throw new Error('page suspend changed long-lived position or retained transient playback');
}

if (!A.play(0x49011003, 2, false, 100)) throw new Error('hidden one-shot route failed');
if (A.snapshot(2).oneShots.length !== 0) {
  throw new Error('one-shot triggered while hidden must not queue for later playback');
}
const hiddenSfx = instances[2];
if (!hiddenSfx.paused || hiddenSfx.playCount !== 0) {
  throw new Error('hidden one-shot unexpectedly played');
}

if (!A.play(0x49010021, 2, true, 1)) throw new Error('hidden long-lived route failed');
const hiddenLong = instances[3];
if (!A.snapshot(2).longLived?.suspended || hiddenLong.playCount !== 0) {
  throw new Error('long-lived audio created while hidden must wait for resume');
}

const resumed = A.resumeFromPageHide();
if (resumed !== 2 || A.isPageSuspended()) throw new Error('page resume did not restart retained long-lived voices');
if (bgm.currentTime !== 23.75 || bgm.playCount !== 2 || hiddenLong.playCount !== 1) {
  throw new Error('page resume did not preserve position/restart retained long-lived voices');
}

A.setVolumes({ master: 2, longLived: -1, oneShot: 0.4 });
const clamped = A.settings();
if (clamped.master !== 1 || clamped.longLived !== 0 || clamped.oneShot !== 0.4) {
  throw new Error('audio settings must clamp to 0..1');
}

console.log('JYAudio settings PASS: persistence + live gain + page suspend/resume');
