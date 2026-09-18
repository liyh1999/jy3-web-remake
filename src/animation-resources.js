(() => {
  const Catalog = window.JYResourceCatalog;
  const Resources = window.JYResources;
  if (!Catalog) throw new Error('JYResourceCatalog must load before animation-resources.js');

  const FRAME_LIST_MARKER = 520683530;
  const ACTION_SET_VERSION = 1;
  const directoryCache = { promise: null, map: null, source: '' };
  const frameListCache = new Map();

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

  function parsePositiveRate(token) {
    const rate = Number(token);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`invalid framelist rate: ${token}`);
    }
    return rate;
  }

  function parseSimpleFrameList(lines, resourceId) {
    const marker = Number.parseInt(lines[0], 10);
    const header = lines[1].split(',').map(part => part.trim());
    if (header.length < 2) throw new Error(`invalid framelist header: ${lines[1]}`);
    const rate = parsePositiveRate(header[0]);
    const loopCode = Number(header[1]);
    if (!Number.isFinite(loopCode)) throw new Error(`invalid framelist loop flag: ${header[1]}`);

    const frames = lines.slice(2).map(parseFrameResourceId);
    const frameDurationMs = 1000 / rate;
    return Object.freeze({
      format: 'simple',
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

  function parseActionFrame(line) {
    const parts = String(line || '').split(',').map(part => part.trim());
    if (parts.length < 1) throw new Error(`invalid action frame: ${line}`);
    const id = parseFrameResourceId(parts[0]);
    const numberField = (token, fallback) => {
      if (token === undefined || token === null || token === '') return fallback;
      return Number(String(token).replace(/\s+/g, ''));
    };
    const flag = numberField(parts[1], 1);
    const x = numberField(parts[2], 0);
    const y = numberField(parts[3], 0);
    if (!Number.isFinite(flag) || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`invalid action frame metadata: ${line}`);
    }
    return Object.freeze({ id, flag, x, y, end: flag < 0 });
  }

  function parseActionSet(lines, resourceId) {
    const version = Number.parseInt(lines[0], 10);
    if (version !== ACTION_SET_VERSION) {
      throw new Error(`unsupported action-set version: ${lines[0]}`);
    }
    const header = lines[1].split(',').map(part => part.trim());
    if (header.length < 3) throw new Error(`invalid action-set header: ${lines[1]}`);
    const rate = parsePositiveRate(header[0]);
    const width = Number(header[1]);
    const height = Number(header[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`invalid action-set dimensions: ${lines[1]}`);
    }

    const actions = {};
    let current = null;
    let totalFrameCount = 0;
    for (const line of lines.slice(2)) {
      const marker = /^DA=([0-9a-fA-F]+)$/i.exec(line);
      if (marker) {
        const actionId = Number.parseInt(marker[1], 16);
        const key = String(actionId);
        if (!actions[key]) actions[key] = { actionId, label: marker[1], frames: [] };
        current = actions[key];
        continue;
      }
      if (!current) throw new Error(`action frame appears before DA marker: ${line}`);
      current.frames.push(parseActionFrame(line));
      totalFrameCount += 1;
    }

    const frameDurationMs = 1000 / rate;
    const frozenActions = {};
    for (const [key, action] of Object.entries(actions)) {
      const frames = Object.freeze(action.frames);
      frozenActions[key] = Object.freeze({
        actionId: action.actionId,
        label: action.label,
        frameCount: frames.length,
        durationMs: frameDurationMs * frames.length,
        frames,
      });
    }

    return Object.freeze({
      format: 'action-set',
      resourceId: u32(resourceId),
      version,
      rate,
      width,
      height,
      frameDurationMs,
      frameCount: totalFrameCount,
      actionCount: Object.keys(frozenActions).length,
      actions: Object.freeze(frozenActions),
    });
  }

  function parseFrameList(source, resourceId = 0) {
    const lines = String(source || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    if (lines.length < 3) throw new Error('framelist requires a header and frame data');

    const first = Number.parseInt(lines[0], 10);
    if (first === FRAME_LIST_MARKER) return parseSimpleFrameList(lines, resourceId);
    if (first === ACTION_SET_VERSION) return parseActionSet(lines, resourceId);
    throw new Error(`unexpected framelist marker: ${lines[0]}`);
  }

  function resolveWithDirectoryMap(resourceId, directoryMap, assetBase = Resources?.ASSET_BASE || '') {
    return Catalog.resolveWithDirectories(resourceId, directoryMap, assetBase);
  }

  function actionResourceId(baseResourceId, actionId) {
    const base = u32(baseResourceId);
    const action = Number(actionId);
    if (!Number.isFinite(action) || Math.trunc(action) === 0) return base;
    return ((base & 0xffff0000) | (Math.trunc(action) & 0xffff)) >>> 0;
  }

  function describeFrame(frame, index, directoryMap, base) {
    const source = typeof frame === 'number' ? { id: frame } : frame;
    const id = u32(source?.id);
    const hit = resolveWithDirectoryMap(id, directoryMap, base);
    return Object.freeze({
      ...source,
      index,
      id,
      relativePath: hit?.relativePath || null,
      url: hit?.url || null,
      kind: hit?.kind || null,
    });
  }

  function describeFrameList(parsed, directoryMap, assetBase = Resources?.ASSET_BASE || '') {
    const base = String(assetBase || '').replace(/\/$/, '');
    if (parsed.format === 'action-set') {
      const actions = {};
      for (const [key, action] of Object.entries(parsed.actions || {})) {
        const frames = action.frames.map((frame, index) => describeFrame(frame, index, directoryMap, base));
        actions[key] = Object.freeze({ ...action, frames: Object.freeze(frames) });
      }
      return Object.freeze({ ...parsed, actions: Object.freeze(actions) });
    }

    const frames = parsed.frames.map((frame, index) => describeFrame(frame, index, directoryMap, base));
    return Object.freeze({ ...parsed, frames: Object.freeze(frames) });
  }

  function selectFrameAction(parsed, actionId) {
    if (parsed.format !== 'action-set') return parsed;
    const id = Math.trunc(Number(actionId) || 0);
    const action = parsed.actions?.[String(id)];
    if (!action) {
      throw new Error(
        `framelist 0x${u32(parsed.resourceId).toString(16)} has no DA action 0x${id.toString(16)}`
      );
    }
    return Object.freeze({
      format: 'action',
      resourceId: parsed.resourceId,
      actionId: id,
      actionLabel: action.label,
      rate: parsed.rate,
      width: parsed.width,
      height: parsed.height,
      frameDurationMs: parsed.frameDurationMs,
      durationMs: action.durationMs,
      frameCount: action.frameCount,
      frames: action.frames,
    });
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

  async function loadParsedFrameList(resourceId) {
    const id = u32(resourceId);
    if (frameListCache.has(id)) return frameListCache.get(id);
    const promise = (async () => {
      const directories = await loadDirectoryMap();
      const hit = resolveWithDirectoryMap(id, directories, assetBase());
      if (!hit?.resolvableFile || hit.kind !== 'framelist') {
        throw new Error(`resource 0x${id.toString(16)} is not a resolvable framelist`);
      }
      const source = await fetchText(hit.url);
      return Object.freeze({
        parsed: parseFrameList(source, id),
        hit,
        directories,
      });
    })().catch(error => {
      frameListCache.delete(id);
      throw error;
    });
    frameListCache.set(id, promise);
    return promise;
  }

  function describedSelection(parsed, directories, hit) {
    const described = describeFrameList(parsed, directories, assetBase());
    return Object.freeze({
      ...described,
      relativePath: hit.relativePath,
      url: hit.url,
    });
  }

  async function loadFrameList(resourceId) {
    const loaded = await loadParsedFrameList(resourceId);
    return describedSelection(loaded.parsed, loaded.directories, loaded.hit);
  }

  async function loadFrameAction(baseResourceId, actionId = 0) {
    const baseId = u32(baseResourceId);
    const action = Math.trunc(Number(actionId) || 0);
    const base = await loadParsedFrameList(baseId);

    if (base.parsed.format === 'action-set') {
      return describedSelection(
        selectFrameAction(base.parsed, action),
        base.directories,
        base.hit
      );
    }

    const targetId = actionResourceId(baseId, action);
    if (targetId === baseId) {
      return describedSelection(base.parsed, base.directories, base.hit);
    }

    const target = await loadParsedFrameList(targetId);
    if (target.parsed.format === 'action-set') {
      return describedSelection(
        selectFrameAction(target.parsed, action),
        target.directories,
        target.hit
      );
    }
    return describedSelection(target.parsed, target.directories, target.hit);
  }

  function resetDirectoryCache() {
    directoryCache.promise = null;
    directoryCache.map = null;
    directoryCache.source = '';
    frameListCache.clear();
  }

  window.JYAnimationResources = Object.freeze({
    FRAME_LIST_MARKER,
    ACTION_SET_VERSION,
    parseDirectoryMap,
    parseFrameResourceId,
    parseFrameList,
    parseActionFrame,
    resolveWithDirectoryMap,
    actionResourceId,
    selectFrameAction,
    describeFrameList,
    loadDirectoryMap,
    loadFrameList,
    loadFrameAction,
    resetDirectoryCache,
  });
})();
