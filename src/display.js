(() => {
  const LOGICAL_WIDTH = 853;
  const LOGICAL_HEIGHT = 480;
  const VIEWPORT_MARGIN = 16;
  const STORAGE_KEY = 'jy3-web-remake:display-scale:v1';
  const SCALE_OPTIONS = Object.freeze(['auto', '0.75', '1', '1.25', '1.5']);
  let scale = 1;
  let preference = 'auto';

  function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function fitScale(width = window.innerWidth, height = window.innerHeight) {
    const availableWidth = Math.max(1, finite(width) - VIEWPORT_MARGIN);
    const availableHeight = Math.max(1, finite(height) - VIEWPORT_MARGIN);
    return Math.max(0.1, Math.min(availableWidth / LOGICAL_WIDTH, availableHeight / LOGICAL_HEIGHT));
  }

  function normalizePreference(value) {
    const normalized = String(value ?? 'auto');
    return SCALE_OPTIONS.includes(normalized) ? normalized : 'auto';
  }

  function loadPreference() {
    try { preference = normalizePreference(window.localStorage?.getItem(STORAGE_KEY) || 'auto'); }
    catch (_) { preference = 'auto'; }
    return preference;
  }

  function computeScale(width = window.innerWidth, height = window.innerHeight, requested = preference) {
    const fit = fitScale(width, height);
    const normalized = normalizePreference(requested);
    if (normalized === 'auto') return fit;
    return Math.max(0.1, Math.min(fit, finite(normalized, fit)));
  }

  function setPreference(value) {
    preference = normalizePreference(value);
    try { window.localStorage?.setItem(STORAGE_KEY, preference); } catch (_) {}
    apply();
    window.dispatchEvent(new CustomEvent('jy3:display-scale-changed', { detail: settings() }));
    return preference;
  }

  function settings() {
    return {
      preference,
      scale,
      fitScale: fitScale(),
    };
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

  loadPreference();

  window.JYDisplay = Object.freeze({
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    STORAGE_KEY,
    SCALE_OPTIONS,
    fitScale,
    computeScale,
    apply,
    scale: () => scale,
    preference: () => preference,
    settings,
    setPreference,
  });

  window.addEventListener('resize', apply);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();
