(() => {
  const DEFAULT_VILLAGE_MAP = 0x10060003;

  function currentMapId() {
    if (!window.fengari?.load) return 0;
    try { return Number(window.fengari.load('return __jy_current_map()', '@web/current-map')()) || 0; }
    catch (_) { return 0; }
  }

  function mountCurrentMap(fallback = DEFAULT_VILLAGE_MAP) {
    if (!window.fengari?.load || !window.JYMapHost) return false;
    const mapId = currentMapId() || Number(fallback) || DEFAULT_VILLAGE_MAP;
    try {
      return window.fengari.load(`return __jy_enter_map(${mapId})`, '@web/mount-map')() !== false;
    } catch (error) {
      console.error('[jy3-web] unable to mount current map', error);
      return false;
    }
  }

  function install() {
    const web = window.JYWeb;
    if (!web || web.__gcoreSceneInstalled) return false;

    const enterVillage = web.enterVillage?.bind(web);
    const finishNewGame = web.finishNewGame?.bind(web);

    if (enterVillage) {
      web.enterVillage = (...args) => {
        const result = enterVillage(...args);
        mountCurrentMap(DEFAULT_VILLAGE_MAP);
        return result;
      };
    }
    if (finishNewGame) {
      web.finishNewGame = (...args) => {
        const result = finishNewGame(...args);
        mountCurrentMap(DEFAULT_VILLAGE_MAP);
        return result;
      };
    }

    web.__gcoreSceneInstalled = true;
    return true;
  }

  window.JYGcoreScene = {
    DEFAULT_VILLAGE_MAP,
    currentMapId,
    mountCurrentMap,
    install,
  };

  install();
})();
