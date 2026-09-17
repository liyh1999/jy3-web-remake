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

  function beginMap(mapId, name, background, showMenu, showRest, showWoods) {
    if (!R) return false;
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
      count: 0,
    };

    document.querySelector('#villageActions')?.classList.add('hidden');
    document.querySelector('#hud')?.classList.remove('hidden');
    return true;
  }

  function addHotspot(index, cityId, name, icon, x, y, eventName, linkedMap, locked, showName) {
    if (!hotspotRoot || !R) return 0;
    const point = logicalFromOriginal(x, y);
    const node = R.quad();
    node.name = `map_city_${Number(cityId) || index}`;
    node.img = Number(icon) || 0;
    node.width = 64;
    node.height = 64;
    node.x = point.x;
    node.y = point.y;
    node.mouseEnabled = !Number(locked);
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
      hotspotRoot.addChild(label);
    }

    currentMap.count += 1;
    return node.handle;
  }

  function endMap() {
    R?.render?.();
    return currentMap?.count || 0;
  }

  function activate(row) {
    if (!row || row.locked) return false;
    if (row.eventName) {
      return window.JYWeb?.runEvent?.(row.eventName) !== false;
    }
    if (row.linkedMap) {
      return window.JYWeb?.enterMap?.(row.linkedMap) !== false;
    }
    return false;
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
      if (!currentMap?.id || !window.fengari?.load) return false;
      return !!window.fengari.load(`return __jy_render_map(${currentMap.id})`, '@web/map-refresh')();
    },
    clear: clearHotspots,
  };
})();