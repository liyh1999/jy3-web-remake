(() => {
  const LOGICAL_WIDTH = 853;
  const LOGICAL_HEIGHT = 480;
  const VIEWPORT_MARGIN = 16;
  let scale = 1;

  function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function computeScale(width = window.innerWidth, height = window.innerHeight) {
    const availableWidth = Math.max(1, finite(width) - VIEWPORT_MARGIN);
    const availableHeight = Math.max(1, finite(height) - VIEWPORT_MARGIN);
    return Math.max(0.1, Math.min(availableWidth / LOGICAL_WIDTH, availableHeight / LOGICAL_HEIGHT));
  }

  function apply() {
    const shell = document.querySelector('#shell');
    const game = document.querySelector('#game');
    if (!shell || !game) return 0;
    scale = computeScale();
    shell.style.width = `${LOGICAL_WIDTH * scale}px`;
    shell.style.height = `${LOGICAL_HEIGHT * scale}px`;
    game.style.width = `${LOGICAL_WIDTH}px`;
    game.style.height = `${LOGICAL_HEIGHT}px`;
    game.style.transformOrigin = '0 0';
    game.style.transform = `scale(${scale})`;
    window.JYRenderer?.resizeCanvas?.();
    return scale;
  }

  window.JYDisplay = Object.freeze({
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    computeScale,
    apply,
    scale: () => scale,
  });

  window.addEventListener('resize', apply);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();
