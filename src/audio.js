(() => {
  const Resources = window.JYResources;
  if (!Resources) throw new Error('JYResources must be loaded before audio.js');

  const STORAGE_KEY = 'jy3.audio.settings.v1';
  const groups = new Map();
  const failureLog = [];
  let nextVoiceId = 1;
  let pageSuspended = typeof document !== 'undefined' && !!document.hidden;

  function groupKey(value) {
    const number = Number(value);
    return Number.isFinite(number) && number !== 0 ? number : 1;
  }

  function rawValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 1;
  }

  function recordFailure(resourceId, url, reason) {
    failureLog.push({
      kind: 'audio',
      resourceId: Number(resourceId) >>> 0,
      url: String(url || ''),
      reason: String(reason || 'error'),
    });
    while (failureLog.length > 64) failureLog.shift();
  }

  function unit(value, fallback = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(1, number));
  }

  // The native gcore gain curve is not present in the fixed upstream mirror.
  // D2-2 therefore keeps the raw Lua value and applies an explicit Web
  // compatibility curve. The endpoints can be calibrated without changing Lua.
  const gainConfig = window.JY_CONFIG?.audioGain || {};
  const raw1Gain = unit(gainConfig.raw1, 0.55);
  const raw100Gain = unit(gainConfig.raw100, 1);

  function browserGain(value) {
    const number = rawValue(value);
    if (number <= 0) return 0;
    if (number <= 1) return unit(number * raw1Gain, 0);
    if (number >= 100) return raw100Gain;
    const t = (number - 1) / 99;
    return unit(raw1Gain + (raw100Gain - raw1Gain) * t, 0);
  }

  function gainPolicy() {
    return {
      name: 'jy3-web-compat-v1',
      raw1: raw1Gain,
      raw100: raw100Gain,
      source: 'web-compat-not-native-gcore',
    };
  }

  function storage() {
    try {
      return window.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function loadMixSettings() {
    const defaults = { master: 1, longLived: 1, oneShot: 1 };
    try {
      const raw = storage()?.getItem?.(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        master: unit(parsed?.master, defaults.master),
        longLived: unit(parsed?.longLived, defaults.longLived),
        oneShot: unit(parsed?.oneShot, defaults.oneShot),
      };
    } catch (_) {
      return defaults;
    }
  }

  let mixSettings = loadMixSettings();

  function saveMixSettings() {
    try {
      storage()?.setItem?.(STORAGE_KEY, JSON.stringify({
        version: 1,
        master: mixSettings.master,
        longLived: mixSettings.longLived,
        oneShot: mixSettings.oneShot,
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function settings() {
    return { ...mixSettings };
  }

  function effectiveGain(rawGain, longLived) {
    const lane = longLived ? mixSettings.longLived : mixSettings.oneShot;
    return unit(rawGain * mixSettings.master * lane, 0);
  }

  function stateFor(group, create = true) {
    const key = groupKey(group);
    let state = groups.get(key);
    if (!state && create) {
      state = { key, longLived: null, oneShots: new Set() };
      groups.set(key, state);
    }
    return state || null;
  }

  function applyVoiceGain(voice) {
    if (!voice) return 0;
    voice.gain = effectiveGain(voice.rawGain, voice.longLived);
    try {
      if (voice.media) voice.media.volume = voice.gain;
    } catch (_) {}
    return voice.gain;
  }

  function updateAllVoiceGains() {
    for (const state of groups.values()) {
      if (state.longLived) applyVoiceGain(state.longLived);
      for (const voice of state.oneShots) applyVoiceGain(voice);
    }
  }

  function setVolumes(next = {}, persist = true) {
    mixSettings = {
      master: unit(next.master, mixSettings.master),
      longLived: unit(next.longLived, mixSettings.longLived),
      oneShot: unit(next.oneShot, mixSettings.oneShot),
    };
    updateAllVoiceGains();
    if (persist) saveMixSettings();
    return settings();
  }

  function resetVolumes(persist = true) {
    mixSettings = { master: 1, longLived: 1, oneShot: 1 };
    updateAllVoiceGains();
    if (persist) saveMixSettings();
    return settings();
  }

  function publicVoice(voice) {
    if (!voice) return null;
    return {
      id: voice.id,
      resourceId: voice.resourceId,
      url: voice.url,
      group: voice.group,
      loop: voice.loop,
      longLived: voice.longLived,
      rawVolume: voice.rawVolume,
      rawGain: voice.rawGain,
      volume: voice.gain,
      gain: voice.gain,
      pending: voice.pending,
      suspended: voice.suspended,
      stopped: voice.stopped,
    };
  }

  function removeVoice(voice) {
    const state = stateFor(voice.group, false);
    if (!state) return;
    if (state.longLived === voice) state.longLived = null;
    state.oneShots.delete(voice);
    if (!state.longLived && state.oneShots.size === 0) groups.delete(state.key);
  }

  function stopVoice(voice, detach = true) {
    if (!voice || voice.stopped) return false;
    voice.stopped = true;
    voice.pending = false;
    voice.suspended = false;
    try {
      voice.media?.pause?.();
      if (voice.media && 'currentTime' in voice.media) voice.media.currentTime = 0;
    } catch (_) {}
    if (detach) removeVoice(voice);
    return true;
  }

  function markPlayRejected(voice, error) {
    if (voice.stopped) return;
    if (voice.longLived) {
      voice.pending = true;
    } else {
      stopVoice(voice);
    }
    console.debug?.('[jy3-web] audio play deferred/blocked', voice.url, error?.message || error);
  }

  function startVoice(voice) {
    if (!voice || voice.stopped || !voice.media?.play || pageSuspended) return false;
    voice.pending = false;
    voice.suspended = false;
    try {
      const promise = voice.media.play();
      if (promise?.catch) promise.catch(error => markPlayRejected(voice, error));
      return true;
    } catch (error) {
      markPlayRejected(voice, error);
      return false;
    }
  }

  function attachMedia(voice) {
    const AudioCtor = window.Audio || globalThis.Audio;
    if (typeof AudioCtor !== 'function') return null;

    const media = new AudioCtor(voice.url);
    media.loop = voice.loop;
    media.preload = 'auto';
    voice.media = media;
    applyVoiceGain(voice);

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('ended', () => {
        if (!voice.loop) removeVoice(voice);
      }, { once: true });
      media.addEventListener('error', () => {
        recordFailure(voice.resourceId, voice.url, 'media-load-error');
      }, { once: true });
    }

    if (pageSuspended) {
      if (voice.longLived) {
        voice.suspended = true;
      } else {
        stopVoice(voice);
      }
      return media;
    }

    startVoice(voice);
    return media;
  }

  function play(resourceId, group = 1, loop = false, rawVolume = 1) {
    const source = Resources.resolve(resourceId);
    if (!source || source.kind !== 'audio' || !source.resolvableFile) {
      recordFailure(resourceId, '', 'unresolvable');
      return false;
    }

    const state = stateFor(group, true);
    const longLived = !!loop;

    if (longLived && state.longLived) {
      const previous = state.longLived;
      state.longLived = null;
      stopVoice(previous, false);
    }

    const voice = {
      id: nextVoiceId++,
      resourceId: Number(resourceId) >>> 0,
      url: source.url,
      group: state.key,
      loop: !!loop,
      longLived,
      rawVolume: rawValue(rawVolume),
      rawGain: browserGain(rawVolume),
      gain: 0,
      pending: false,
      suspended: false,
      stopped: false,
      media: null,
    };
    applyVoiceGain(voice);

    if (longLived) state.longLived = voice;
    else state.oneShots.add(voice);
    attachMedia(voice);
    return true;
  }

  function stop(group = 1) {
    const state = stateFor(group, false);
    if (!state) return false;
    const voices = [
      ...(state.longLived ? [state.longLived] : []),
      ...state.oneShots,
    ];
    for (const voice of voices) stopVoice(voice);
    groups.delete(state.key);
    return voices.length > 0;
  }

  function activeAudio(group = 1) {
    const state = stateFor(group, false);
    if (!state) return null;
    if (state.longLived) return publicVoice(state.longLived);
    const voices = [...state.oneShots];
    return publicVoice(voices[voices.length - 1] || null);
  }

  function failures() {
    return failureLog.map(row => ({ ...row }));
  }

  function snapshot(group = 1) {
    const state = stateFor(group, false);
    if (!state) return { group: groupKey(group), longLived: null, oneShots: [] };
    return {
      group: state.key,
      longLived: publicVoice(state.longLived),
      oneShots: [...state.oneShots].map(publicVoice),
    };
  }

  function retryBlocked() {
    if (pageSuspended) return 0;
    let retried = 0;
    for (const state of groups.values()) {
      const voice = state.longLived;
      if (!voice?.pending || voice.stopped || !voice.media?.play) continue;
      retried += 1;
      startVoice(voice);
    }
    return retried;
  }

  function suspendForPageHide() {
    if (pageSuspended) return 0;
    pageSuspended = true;
    let affected = 0;
    for (const state of [...groups.values()]) {
      const longVoice = state.longLived;
      if (longVoice && !longVoice.stopped) {
        longVoice.pending = false;
        longVoice.suspended = true;
        try { longVoice.media?.pause?.(); } catch (_) {}
        affected += 1;
      }
      for (const voice of [...state.oneShots]) {
        if (stopVoice(voice)) affected += 1;
      }
    }
    return affected;
  }

  function resumeFromPageHide() {
    if (!pageSuspended) return 0;
    pageSuspended = false;
    let resumed = 0;
    for (const state of groups.values()) {
      const voice = state.longLived;
      if (!voice?.suspended || voice.stopped) continue;
      voice.suspended = false;
      if (startVoice(voice)) resumed += 1;
    }
    return resumed;
  }

  function isPageSuspended() {
    return pageSuspended;
  }

  if (typeof document !== 'undefined' && document?.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) suspendForPageHide();
      else resumeFromPageHide();
    });
    const resume = () => retryBlocked();
    document.addEventListener('pointerdown', resume, { passive: true });
    document.addEventListener('keydown', resume);
  }

  window.JYAudio = Object.freeze({
    STORAGE_KEY,
    play,
    stop,
    activeAudio,
    failures,
    snapshot,
    retryBlocked,
    suspendForPageHide,
    resumeFromPageHide,
    isPageSuspended,
    browserGain,
    gainPolicy,
    settings,
    setVolumes,
    resetVolumes,
  });
})();
