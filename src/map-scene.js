(() => {
  const R = window.JYRenderer;
  const Input = window.JYInput;
  const hotspotByHandle = new Map();
  let currentMap = null;
  let hotspotRoot = null;

  function logicalFromOriginal(x, y) {
    return {
      x: Number(x || 0) - R.HALF_WIDTH,
      y: R.HALF_HEIGHT - Number(y || 0),
    };
  }

  function clearHotspots() {
    hotspotByHandle.clear();
    hotspotRoot?.removeFromParent?.();
    hotspotRoot = null;
  }

  function setPlayerPortrait(resourceId) {
    const host = document.querySelector('#hudPortrait');
    if (!host) return false;
    const id = Number(resourceId) >>> 0;
    const url = id ? window.JYResources?.url?.(id) : null;
    host.dataset.resourceId = id ? `0x${id.toString(16).padStart(8, '0')}` : '';
    host.style.backgroundImage = url ? `url("${url}")` : '';
    host.classList.toggle('has-image', Boolean(url));
    host.textContent = url ? '' : '侠';
    return Boolean(url);
  }

  function beginMap(mapId, name, background, showMenu, showRest, showWoods, showRiver = 0, portraitId = 0) {
    if (!R) return false;
    const scene = document.querySelector('#scene');
    if (scene) {
      scene.querySelectorAll('.title-copy').forEach(node => node.remove());
      scene.style.backgroundImage = 'none';
      scene.style.backgroundSize = '';
      scene.style.backgroundPosition = '';
    }

    R.ensureCanvas?.();
    R.setBackground(Number(background) || 0);
    clearHotspots();

    hotspotRoot = R.container();
    hotspotRoot.name = '__map_hotspots';
    R.stage().addChild(hotspotRoot);

    currentMap = {
      id: Number(mapId) || 0,
      name: String(name || ''),
      background: Number(background) || 0,
      showMenu: Number(showMenu) || 0,
      showRest: Number(showRest) || 0,
      showWoods: Number(showWoods) || 0,
      showRiver: Number(showRiver) || 0,
      count: 0,
    };

    setPlayerPortrait(portraitId);
    document.querySelector('#villageActions')?.classList.add('hidden');
    document.querySelector('#hud')?.classList.remove('hidden');
    return true;
  }

  function addHotspot(index, cityId, name, icon, x, y, eventName, linkedMap, locked, showName, eventRecord = 0) {
    if (!hotspotRoot || !R) return 0;
    const point = logicalFromOriginal(x, y);
    const node = R.quad();
    node.name = `map_city_${Number(cityId) || index}`;
    node.img = Number(icon) || 0;
    node.width = 64;
    node.height = 64;
    node.x = point.x;
    node.y = point.y;
    // Locked locations still receive hover in the original UI; activation is
    // blocked in Lua so the user can still see which destination is locked.
    node.mouseEnabled = true;
    node.alpha = Number(locked) ? 128 : 255;
    hotspotRoot.addChild(node);

    const row = {
      index: Number(index) || 0,
      cityId: Number(cityId) || 0,
      name: String(name || ''),
      icon: Number(icon) || 0,
      originalX: Number(x) || 0,
      originalY: Number(y) || 0,
      eventName: String(eventName || ''),
      linkedMap: Number(linkedMap) || 0,
      locked: !!Number(locked),
      showName: Number(showName) || 0,
      eventRecord: Number(eventRecord) || 0,
      handle: node.handle,
    };
    hotspotByHandle.set(node.handle, row);

    if (row.showName) {
      const label = R.textQuad();
      label.name = `${node.name}_label`;
      label.text = row.name;
      label.font = 0x61100000;
      label.width = 120;
      label.height = 24;
      label.x = point.x;
      label.y = point.y - 42;
      label.mouseEnabled = false;
      hotspotRoot.addChild(label);
    }

    currentMap.count += 1;
    return node.handle;
  }

  function endMap() {
    R?.render?.();
    return currentMap?.count || 0;
  }

  function runLua(chunk, name) {
    if (!window.fengari?.load) return false;
    try {
      return window.fengari.load(chunk, name)() !== false;
    } catch (error) {
      console.error('[jy3-web] map action failed', error);
      const status = document.querySelector('#runtimeStatus');
      if (status) status.textContent = `地图事件错误：${error.message || error}`;
      return false;
    }
  }

  function activate(row) {
    if (!row) return false;
    return runLua(`return __jy_activate_city(${Number(row.cityId) || 0})`, '@web/map-city');
  }

  function setHoverStatus(row) {
    const status = document.querySelector('#runtimeStatus');
    if (!status || !row?.name) return;
    status.textContent = row.locked ? `${row.name} · 未解锁` : row.name;
  }

  Input?.subscribe?.('rollOver', ({ handle }) => {
    const row = hotspotByHandle.get(Number(handle));
    if (!row) return false;
    setHoverStatus(row);
    const scene = document.querySelector('#scene');
    if (scene) scene.style.cursor = row.locked ? 'not-allowed' : 'pointer';
    return false;
  }, 50);

  Input?.subscribe?.('rollOut', ({ handle }) => {
    if (!hotspotByHandle.has(Number(handle))) return false;
    const scene = document.querySelector('#scene');
    if (scene) scene.style.cursor = '';
    return false;
  }, 50);

  Input?.subscribe?.('click', ({ handle }) => {
    const row = hotspotByHandle.get(Number(handle));
    if (!row) return false;
    return activate(row);
  }, 100);

  window.JYMapHost = {
    beginMap,
    addHotspot,
    endMap,
    activateByHandle(handle) { return activate(hotspotByHandle.get(Number(handle))); },
    logicalFromOriginal,
    current: () => currentMap ? { ...currentMap } : null,
    hotspots: () => [...hotspotByHandle.values()].map(row => ({ ...row })),
    refresh() {
      if (!currentMap?.id) return false;
      return runLua(`return __jy_render_map(${currentMap.id})`, '@web/map-refresh');
    },
    clear: clearHotspots,
    setPlayerPortrait,
  };
})();
