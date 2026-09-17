(() => {
  const VILLAGE_BACKGROUND = 0x56050001;

  function mountVillage() {
    const renderer = window.JYRenderer;
    const scene = document.querySelector('#scene');
    if (!renderer || !scene) return false;

    // app.js still owns the temporary HTML controls. The actual scene image is now
    // rendered by the gcore Canvas path instead of CSS background-image.
    scene.style.backgroundImage = 'none';
    scene.style.backgroundSize = '';
    scene.style.backgroundPosition = '';
    renderer.ensureCanvas();
    renderer.setBackground(VILLAGE_BACKGROUND);
    return true;
  }

  function install() {
    const web = window.JYWeb;
    if (!web || web.__gcoreSceneInstalled) return false;

    const enterVillage = web.enterVillage?.bind(web);
    const finishNewGame = web.finishNewGame?.bind(web);

    if (enterVillage) {
      web.enterVillage = (...args) => {
        const result = enterVillage(...args);
        mountVillage();
        return result;
      };
    }
    if (finishNewGame) {
      web.finishNewGame = (...args) => {
        const result = finishNewGame(...args);
        mountVillage();
        return result;
      };
    }

    web.__gcoreSceneInstalled = true;
    return true;
  }

  window.JYGcoreScene = {
    VILLAGE_BACKGROUND,
    mountVillage,
    install,
  };

  install();
})();
