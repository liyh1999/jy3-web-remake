(() => {
  const Resources = window.JYResources;
  if (!Resources) throw new Error('JYResources must be loaded before audio.js');

  const groups = new Map();
  let nextVoiceId = 1;

  function groupKey(value) {
    const number = Number(value);
    return Number.isFinite(number) && number !== 0 ? number : 1;
  }

  function rawValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 1;
  }

  // D2-2 keeps gain policy centralized here. The original raw value is stored
  // independently on every voice so later calibration never loses Lua intent.
  // This initial browser gain policy intentionally preserves the legacy audible
  // behavior; final balance calibration remains separate from resource routing.
  function browserGain(value) {
    const number = rawValue(value);
    if (number <= 1) return Math.max(0, Math.min(1, number));
    return Math.max(0, Math.min(1, number / 100));
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
      volume: voice.gain,
      gain: voice.gain,
      pending: voice.pending,
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
    try {
      voice.media?.pause?.();
      if (voice.media && 'currentTime' in voice.media) voice.media.currentTime = 0;
    } catch (_) {}
    if (detach) removeVoice(voice);
    return true;
  }

  function attachMedia(voice) {
    const AudioCtor = window.Audio || globalThis.Audio;
    if (typeof AudioCtor !== 'function') return null;

    const media = new AudioCtor(voice.url);
    media.loop = voice.loop;
    media.volume = voice.gain;
    media.preload = 'auto';
    voice.media = media;

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('ended', () => {
        if (!voice.loop) removeVoice(voice);
      }, { once: true });
    }

    try {
      const promise = media.play?.();
      if (promise?.catch) {
        promise.catch((error) => {
          if (voice.stopped) return;
          voice.pending = voice.longLived;
          console.debug?.(
            '[jy3-web] audio play deferred/blocked',
            voice.url,
            error?.message || error
          );
        });
      }
    } catch (error) {
      voice.pending = voice.longLived;
      console.debug?.('[jy3-web] audio play deferred/blocked', voice.url, error?.message || error);
    }
    return media;
  }

  function play(resourceId, group = 1, loop = false, rawVolume = 1) {
    const source = Resources.resolve(resourceId);
    if (!source || source.kind !== 'audio' || !source.resolvableFile) return false;

    const state = stateFor(group, true);
    const longLived = !!loop;

    // Original scripts use the same group value for BGM and SFX. Replacing a
    // long-lived voice must not tear down transient one-shots in that group.
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
      gain: browserGain(rawVolume),
      pending: false,
      stopped: false,
      media: null,
    };

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
    let retried = 0;
    for (const state of groups.values()) {
      const voice = state.longLived;
      if (!voice?.pending || voice.stopped || !voice.media?.play) continue;
      voice.pending = false;
      retried += 1;
      try {
        const promise = voice.media.play();
        if (promise?.catch) {
          promise.catch(() => {
            if (!voice.stopped) voice.pending = true;
          });
        }
      } catch (_) {
        if (!voice.stopped) voice.pending = true;
      }
    }
    return retried;
  }

  if (typeof document !== 'undefined' && document?.addEventListener) {
    const resume = () => retryBlocked();
    document.addEventListener('pointerdown', resume, { passive: true });
    document.addEventListener('keydown', resume);
  }

  window.JYAudio = Object.freeze({
    play,
    stop,
    activeAudio,
    snapshot,
    retryBlocked,
    browserGain,
  });
})();
