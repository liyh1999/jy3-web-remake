(() => {
  const UPSTREAM_REV = 'c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8';
  const REMOTE_ASSET_BASE = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3`;
  const ASSET_BASE = window.JY_CONFIG?.assetBase || REMOTE_ASSET_BASE;
  const IMAGE_SIZES = window.JY_CONFIG?.imageSizes || {};

  // Mirrors JY3/dir.lua. Runtime resource ids carry an additional high-nibble
  // type tag (e.g. 0x56050001); the path id used by dir.lua is 0x06050001.
  const DIRS = new Map([
    [0x02000000, 'fonts'],
    [0x03000000, 'framelist'],
    [0x03010000, 'framelist/effect'],
    [0x03060000, 'framelist/enemy'],
    [0x03070000, 'framelist/friendly'],
    [0x03020000, 'framelist/hunting'],
    [0x03030000, 'framelist/body'],
    [0x04000000, 'particle'],
    [0x05000000, 'spine'],
    [0x06000000, 'image'],
    [0x06030000, 'image/03'],
    [0x06020000, 'image/1'],
    [0x060f0000, 'image/10'],
    [0x06010000, 'image/2'],
    [0x06160000, 'image/UI'],
    [0x06050000, 'image/bjmap'],
    [0x06130000, 'image/body'],
    [0x06120000, 'image/bodyframe'],
    [0x06070000, 'image/dump'],
    [0x060b0000, 'image/eventmap'],
    [0x060d0000, 'image/frame'],
    [0x06110000, 'image/frameshunting'],
    [0x06080000, 'image/head'],
    [0x060e0000, 'image/item'],
    [0x060a0000, 'image/list'],
    [0x06180000, 'image/skill'],
    [0x06190000, 'image/framelist'],
    [0x06100000, 'image/samllgame'],
    [0x060c0000, 'image/skillmap'],
    [0x06090000, 'image/standmap'],
    [0x06040000, 'image/title'],
    [0x06060000, 'image/worldmap'],
    [0x09000000, 'audio'],
    [0x09010000, 'audio/01'],
    [0x09020000, 'audio/02'],
    [0x08000000, 'newimage'],
  ]);

  const BASES = [...DIRS.keys()].sort((a, b) => b - a);
  const images = new Map();
  const audioChannels = new Map();

  function u32(value) {
    return Number(value) >>> 0;
  }

  function canonicalPathId(resourceId) {
    return u32(resourceId) & 0x0fffffff;
  }

  function findDirectoryBase(pathId) {
    const family = pathId & 0xff000000;
    for (const base of BASES) {
      if ((base & 0xff000000) !== family) continue;
      if (pathId >= base && pathId - base < 0x10000) return base;
    }
    return null;
  }

  function extensionFor(pathId) {
    const family = pathId & 0xff000000;
    if (family === 0x06000000 || family === 0x08000000) return '.png';
    if (family === 0x09000000) return '.mp3';
    return null;
  }

  function resolve(resourceId) {
    const id = u32(resourceId);
    const pathId = canonicalPathId(id);
    const base = findDirectoryBase(pathId);
    if (base === null) return null;

    const directory = DIRS.get(base);
    const index = pathId - base;
    const extension = extensionFor(pathId);
    const stem = index.toString(16).padStart(4, '0').toLowerCase();
    const relativePath = extension ? `${directory}/${stem}${extension}` : directory;

    return {
      id,
      pathId,
      base,
      directory,
      index,
      stem,
      extension,
      relativePath,
      url: `${ASSET_BASE}/${relativePath}`,
    };
  }

  function getPath(resourceId) {
    const hit = resolve(resourceId);
    return hit ? hit.directory : null;
  }

  function url(resourceId) {
    const hit = resolve(resourceId);
    return hit?.extension ? hit.url : null;
  }

  function metadataSize(id) {
    const hit = resolve(id);
    if (!hit) return null;
    return IMAGE_SIZES[hit.relativePath] || null;
  }

  function addImage(id, sourceId = id) {
    const targetId = u32(id);
    const source = resolve(sourceId);
    if (!source || source.extension !== '.png') return false;

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
    if (!source || source.extension !== '.mp3') return false;
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
    DIRS,
    canonicalPathId,
    resolve,
    getPath,
    url,
    addImage,
    imageWidth,
    imageHeight,
    hasImage,
    play,
    stop,
    activeAudio,
  };
})();
