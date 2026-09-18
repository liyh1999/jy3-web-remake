(() => {
  const Catalog = window.JYResourceCatalog;
  const Resources = window.JYResources;
  if (!Catalog) throw new Error('JYResourceCatalog must load before animation-resources.js');

  const FRAME_LIST_MARKER = 520683530;
  const directoryCache = { promise: null, map: null, source: '' };

  function u32(value) {
    return Number(value) >>> 0;
  }

  function parseDirectoryMap(source) {
    const map = new Map();
    const text = String(source || '');
    const re = /_dir\[(0x[0-9a-fA-F]+)\]\s*=\s*["']([^"']+)["']/g;
    for (const match of text.matchAll(re)) {
      map.set(Number.parseInt(match[1], 16) >>> 0, match[2]);
    }
    if (!map.size) throw new Error('dir.lua contained no _dir entries');
    return map;
  }

  function parseFrameResourceId(line) {
    const token = String(line || '').trim();
    if (!/^[0-9a-fA-F]{1,8}$/.test(token)) {
      throw new Error(`invalid framelist frame id: ${token}`);
    }
    return Number.parseInt(token, 16) >>> 0;
  }

  function parseFrameList(source, resourceId = 0) {
    const lines = String(source || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    if (lines.length < 3) throw new Error('framelist requires marker, rate/loop and at least one frame');

    const marker = Number.parseInt(lines[0], 10);
    if (marker !== FRAME_LIST_MARKER) {
      throw new Error(`unexpected framelist marker: ${lines[0]}`);
    }

    const header = lines[1].split(',').map(part => part.trim());
    if (header.length < 2) throw new Error(`invalid framelist header: ${lines[1]}`);
    const rate = Number(header[0]);
    const loopCode = Number(header[1]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`invalid framelist rate: ${header[0]}`);
    if (!Number.isFinite(loopCode)) throw new Error(`invalid framelist loop flag: ${header[1]}`);

    const frames = lines.slice(2).map(parseFrameResourceId);
    const frameDurationMs = 1000 / rate;
    return Object.freeze({
      resourceId: u32(resourceId),
      marker,
      rate,
      loopCode,
      loop: loopCode !== 0,
      frameDurationMs,
      durationMs: frameDurationMs * frames.length,
      frameCount: frames.length,
      frames: Object.freeze(frames),
    });
  }

  function resolveWithDirectoryMap(resourceId, directoryMap, assetBase = Resources?.ASSET_BASE || '') {
    return Catalog.resolveWithDirectories(resourceId, directoryMap, assetBase);
  }

  function describeFrameList(parsed, directoryMap, assetBase = Resources?.ASSET_BASE || '') {
    const frames = parsed.frames.map((id, index) => {
      const hit = resolveWithDirectoryMap(id, directoryMap, assetBase);
      return Object.freeze({
        index,
        id,
        relativePath: hit?.relativePath || null,
        url: hit?.url || null,
        kind: hit?.kind || null,
      });
    });
    return Object.freeze({ ...parsed, frames: Object.freeze(frames) });
  }

  function assetBase() {
    return Resources?.ASSET_BASE || window.JY_CONFIG?.assetBase || '';
  }

  async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.text();
  }

  async function loadDirectoryMap() {
    if (directoryCache.map) return directoryCache.map;
    if (!directoryCache.promise) {
      const base = String(assetBase()).replace(/\/$/, '');
      const url = `${base}/script/dir.lua`;
      directoryCache.promise = fetchText(url).then(source => {
        directoryCache.source = source;
        directoryCache.map = parseDirectoryMap(source);
        return directoryCache.map;
      }).catch(error => {
        directoryCache.promise = null;
        throw error;
      });
    }
    return directoryCache.promise;
  }

  async function loadFrameList(resourceId) {
    const directories = await loadDirectoryMap();
    const hit = resolveWithDirectoryMap(resourceId, directories, assetBase());
    if (!hit?.resolvableFile || hit.kind !== 'framelist') {
      throw new Error(`resource 0x${u32(resourceId).toString(16)} is not a resolvable framelist`);
    }
    const source = await fetchText(hit.url);
    const parsed = parseFrameList(source, resourceId);
    return Object.freeze({
      ...describeFrameList(parsed, directories, assetBase()),
      relativePath: hit.relativePath,
      url: hit.url,
    });
  }

  function resetDirectoryCache() {
    directoryCache.promise = null;
    directoryCache.map = null;
    directoryCache.source = '';
  }

  window.JYAnimationResources = Object.freeze({
    FRAME_LIST_MARKER,
    parseDirectoryMap,
    parseFrameResourceId,
    parseFrameList,
    resolveWithDirectoryMap,
    describeFrameList,
    loadDirectoryMap,
    loadFrameList,
    resetDirectoryCache,
  });
})();
