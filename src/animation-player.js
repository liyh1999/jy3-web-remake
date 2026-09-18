(() => {
  const AnimationResources = window.JYAnimationResources;
  if (!AnimationResources) throw new Error('JYAnimationResources must load before animation-player.js');

  const imageCache = new Map();

  function u32(value) {
    return Number(value) >>> 0;
  }

  function defaultNow() {
    if (globalThis.performance?.now) return performance.now();
    return Date.now();
  }

  function defaultSchedule(callback) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
    return setTimeout(() => callback(defaultNow()), 16);
  }

  function defaultCancel(token) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(token);
    else clearTimeout(token);
  }

  function defaultHidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  function normalizeFrame(frame) {
    if (typeof frame === 'number') {
      return { id: u32(frame), url: null, relativePath: null, x: 0, y: 0, flag: 1, end: false };
    }
    return {
      ...frame,
      id: u32(frame?.id),
      url: frame?.url || null,
      relativePath: frame?.relativePath || null,
      x: Number(frame?.x) || 0,
      y: Number(frame?.y) || 0,
      flag: Number.isFinite(Number(frame?.flag)) ? Number(frame.flag) : 1,
      end: Boolean(frame?.end),
    };
  }

  function preloadImage(frame) {
    const normalized = normalizeFrame(frame);
    if (!normalized.id) return Promise.resolve(null);
    if (imageCache.has(normalized.id)) return imageCache.get(normalized.id);

    const rendererImage = window.JYRenderer?.preloadImage?.(normalized.id);
    if (rendererImage) {
      const promise = rendererImage.complete
        ? Promise.resolve(rendererImage)
        : new Promise(resolve => {
            rendererImage.addEventListener?.('load', () => resolve(rendererImage), { once: true });
            rendererImage.addEventListener?.('error', () => resolve(null), { once: true });
            if (!rendererImage.addEventListener) resolve(rendererImage);
          });
      imageCache.set(normalized.id, promise);
      return promise;
    }

    if (typeof Image === 'undefined' || !normalized.url) {
      const promise = Promise.resolve(null);
      imageCache.set(normalized.id, promise);
      return promise;
    }

    const image = new Image();
    image.decoding = 'async';
    const promise = new Promise(resolve => {
      image.addEventListener('load', () => resolve(image), { once: true });
      image.addEventListener('error', () => resolve(null), { once: true });
    });
    image.src = normalized.url;
    imageCache.set(normalized.id, promise);
    return promise;
  }

  async function preloadFrames(frames) {
    return Promise.allSettled((frames || []).map(preloadImage));
  }

  class FramePlayer {
    constructor(options = {}) {
      this.loader = options.loader || ((resourceId, request) => {
        if (request?.baseResourceId) {
          return AnimationResources.loadFrameAction(request.baseResourceId, request.actionId);
        }
        return AnimationResources.loadFrameList(resourceId);
      });
      this.schedule = options.schedule || defaultSchedule;
      this.cancelSchedule = options.cancelSchedule || defaultCancel;
      this.now = options.now || defaultNow;
      this.isHidden = options.isHidden || defaultHidden;
      this.preload = options.preload || preloadFrames;
      this.channels = new Map();
      this.generation = 1;
    }

    resolveResource(request = {}) {
      if (request.resourceId) return u32(request.resourceId);
      return AnimationResources.actionResourceId(request.baseResourceId, request.actionId);
    }

    play(key, request = {}) {
      const channelKey = String(key);
      this.stop(channelKey, 'replace');

      const generation = this.generation++;
      const state = {
        key: channelKey,
        generation,
        request,
        resourceId: this.resolveResource(request),
        actionId: Number(request.actionId) || 0,
        frameIndex: 0,
        cycle: 0,
        accumulator: 0,
        lastTimestamp: null,
        scheduleToken: null,
        parsed: null,
        active: true,
        ready: null,
      };
      this.channels.set(channelKey, state);

      state.ready = Promise.resolve()
        .then(() => this.loader(state.resourceId, request))
        .then(async parsed => {
          if (!this.isCurrent(state)) return state;
          const frames = (parsed?.frames || []).map(normalizeFrame).filter(frame => frame.id);
          if (!frames.length) throw new Error(`framelist 0x${state.resourceId.toString(16)} has no drawable frames`);
          state.parsed = {
            ...parsed,
            frames,
            rate: Number(request.rate) > 0 ? Number(request.rate) : Number(parsed.rate) || 1,
            loop: request.loop === undefined ? Boolean(parsed.loop) : Boolean(request.loop),
          };
          await this.preload(frames);
          if (!this.isCurrent(state)) return state;
          this.emitFrame(state, 0);
          state.lastTimestamp = this.now();
          state.scheduleToken = this.schedule(timestamp => this.tick(state, timestamp));
          return state;
        })
        .catch(error => {
          if (!this.isCurrent(state)) return state;
          state.active = false;
          this.channels.delete(channelKey);
          try { request.onError?.(error, state); } catch (_) {}
          return state;
        });

      return {
        key: channelKey,
        generation,
        ready: state.ready,
        stop: () => this.stop(channelKey, 'manual'),
        state: () => this.state(channelKey),
      };
    }

    isCurrent(state) {
      return Boolean(state?.active && this.channels.get(state.key) === state);
    }

    emitFrame(state, index) {
      if (!this.isCurrent(state) || !state.parsed) return false;
      const frame = state.parsed.frames[index];
      if (!frame) return false;
      state.frameIndex = index;
      try {
        state.request.onFrame?.(frame, {
          key: state.key,
          resourceId: state.resourceId,
          actionId: state.actionId,
          index,
          cycle: state.cycle,
          frameCount: state.parsed.frames.length,
          rate: state.parsed.rate,
        });
      } catch (_) {}
      return true;
    }

    finishCycle(state) {
      if (!this.isCurrent(state)) return false;
      state.cycle += 1;
      const meta = {
        key: state.key,
        resourceId: state.resourceId,
        actionId: state.actionId,
        cycle: state.cycle,
        frameCount: state.parsed.frames.length,
      };
      try { state.request.onFrameEnd?.(meta); } catch (_) {}
      if (!this.isCurrent(state)) return false;

      if (!state.parsed.loop) {
        this.stop(state.key, 'complete');
        try { state.request.onComplete?.(meta); } catch (_) {}
        return false;
      }
      return true;
    }

    tick(state, timestamp) {
      if (!this.isCurrent(state) || !state.parsed) return;

      const now = Number.isFinite(Number(timestamp)) ? Number(timestamp) : this.now();
      if (this.isHidden()) {
        state.lastTimestamp = now;
        state.scheduleToken = this.schedule(next => this.tick(state, next));
        return;
      }

      const last = state.lastTimestamp ?? now;
      const delta = Math.max(0, Math.min(250, now - last));
      state.lastTimestamp = now;
      state.accumulator += delta;

      const frameDuration = 1000 / Math.max(0.001, state.parsed.rate);
      let guard = 0;
      while (state.accumulator + 1e-9 >= frameDuration && guard < 12 && this.isCurrent(state)) {
        guard += 1;
        state.accumulator -= frameDuration;
        let next = state.frameIndex + 1;
        if (next >= state.parsed.frames.length) {
          if (!this.finishCycle(state)) return;
          next = 0;
        }
        this.emitFrame(state, next);
      }

      if (this.isCurrent(state)) {
        state.scheduleToken = this.schedule(next => this.tick(state, next));
      }
    }

    stop(key, reason = 'manual') {
      const channelKey = String(key);
      const state = this.channels.get(channelKey);
      if (!state) return false;
      state.active = false;
      if (state.scheduleToken !== null && state.scheduleToken !== undefined) {
        this.cancelSchedule(state.scheduleToken);
      }
      state.scheduleToken = null;
      this.channels.delete(channelKey);
      try { state.request.onStop?.(reason, state); } catch (_) {}
      return true;
    }

    stopAll(reason = 'reset') {
      for (const key of [...this.channels.keys()]) this.stop(key, reason);
      return true;
    }

    state(key) {
      const state = this.channels.get(String(key));
      if (!state) return null;
      return {
        key: state.key,
        generation: state.generation,
        resourceId: state.resourceId,
        actionId: state.actionId,
        frameIndex: state.frameIndex,
        cycle: state.cycle,
        active: state.active,
        rate: state.parsed?.rate || 0,
        loop: state.parsed?.loop ?? null,
        frameCount: state.parsed?.frames?.length || 0,
      };
    }
  }

  const shared = new FramePlayer();

  window.JYFramePlayer = Object.freeze({
    FramePlayer,
    shared,
    play: (...args) => shared.play(...args),
    stop: (...args) => shared.stop(...args),
    stopAll: (...args) => shared.stopAll(...args),
    state: (...args) => shared.state(...args),
    preloadImage,
    preloadFrames,
    imageCache,
  });
})();
