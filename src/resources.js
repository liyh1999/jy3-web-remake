(() => {
  const UPSTREAM_REV = 'c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8';
  const REMOTE_ASSET_BASE = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3`;
  const ASSET_BASE = window.JY_CONFIG?.assetBase || REMOTE_ASSET_BASE;
  const IMAGE_SIZES = window.JY_CONFIG?.imageSizes || {};
  const Catalog = window.JYResourceCatalog;

  if (!Catalog) throw new Error('JYResourceCatalog must be loaded before resources.js');

  const images = new Map();
  const audioChannels = new Map();

  function u32(value) {
    return Number(value) >>> 0;
  }

  function resolve(resourceId) {
    return Catalog.resolve(resourceId, ASSET_BASE);
  }

  function getPath(resourceId) {
    const hit = resolve(resourceId);
    return hit ? hit.directory : null;
  }

  function url(resourceId) {
    const hit = resolve(resourceId);
    return hit?.resolvableFile ? hit.url : null;
  }

  function metadataSize(id) {
    const hit = resolve(id);
    if (!hit?.relativePath) return null;
    return IMAGE_SIZES[hit.relativePath] || null;
  }

  function addImage(id, sourceId = id) {
    const targetId = u32(id);
    const source = resolve(sourceId);
    if (!source || source.kind !== 'image' || !source.resolvableFile) return false;

    const size = IMAGE_SIZES[source.relativePath] || null;
    const entry = {
      id: targetId,
      sourceId: u32(sourceId),
      url: source.url,
      width: Number(size?.width) || 0,
      height: Number(size?.height) || 0,
      loaded: false,
      error: false,
      image: null,
    };
    images.set(targetId, entry);

    if (typeof Image === 'undefined') return true;
    const image = new Image();
    entry.image = image;
    image.onload = () => {
      entry.width = image.naturalWidth || image.width || entry.width || 0;
      entry.height = image.naturalHeight || image.height || entry.height || 0;
      entry.loaded = true;
    };
    image.onerror = () => { entry.error = true; };
    image.src = source.url;
    return true;
  }

  function imageWidth(id) {
    const key = u32(id);
    return images.get(key)?.width || Number(metadataSize(key)?.width) || 0;
  }

  function imageHeight(id) {
    const key = u32(id);
    return images.get(key)?.height || Number(metadataSize(key)?.height) || 0;
  }

  function imageSize(id) {
    const width = imageWidth(id);
    const height = imageHeight(id);
    if (!width && !height) return null;
    return { width, height };
  }

  function hasImage(id) {
    return images.has(u32(id));
  }

  function normalizedVolume(volume) {
    const value = Number(volume);
    if (!Number.isFinite(value)) return 1;
    if (value <= 1) return Math.max(0, value);
    return Math.max(0, Math.min(1, value / 100));
  }

  function stop(channel = 1) {
    const key = Number(channel) || 1;
    const current = audioChannels.get(key);
    if (!current) return false;
    try {
      current.pause?.();
      if ('currentTime' in current) current.currentTime = 0;
    } catch (_) {}
    audioChannels.delete(key);
    return true;
  }

  function play(resourceId, channel = 1, loop = false, volume = 1) {
    const source = resolve(resourceId);
    if (!source || source.kind !== 'audio' || !source.resolvableFile) return false;
    const key = Number(channel) || 1;

    stop(key);
    if (typeof Audio === 'undefined') {
      // Node/CI can still validate routing without a browser audio implementation.
      audioChannels.set(key, { resourceId: u32(resourceId), url: source.url, loop: !!loop, volume: normalizedVolume(volume) });
      return true;
    }

    const audio = new Audio(source.url);
    audio.loop = !!loop;
    audio.volume = normalizedVolume(volume);
    audio.preload = 'auto';
    audioChannels.set(key, audio);
    const promise = audio.play();
    if (promise?.catch) {
      promise.catch((error) => {
        // Browser autoplay restrictions are expected before the first user gesture.
        console.debug?.('[jy3-web] audio play deferred/blocked', source.url, error?.message || error);
      });
    }
    return true;
  }

  function activeAudio(channel = 1) {
    return audioChannels.get(Number(channel) || 1) || null;
  }

  window.JYResources = {
    UPSTREAM_REV,
    ASSET_BASE,
    REMOTE_ASSET_BASE,
    IMAGE_SIZES,
    DIRS: Catalog.DIRS,
    canonicalPathId: Catalog.canonicalPathId,
    familyOf: Catalog.familyOf,
    findDirectoryBase: Catalog.findDirectoryBase,
    ruleFor: Catalog.ruleFor,
    resolve,
    getPath,
    url,
    addImage,
    imageWidth,
    imageHeight,
    imageSize,
    hasImage,
    play,
    stop,
    activeAudio,
  };
})();
