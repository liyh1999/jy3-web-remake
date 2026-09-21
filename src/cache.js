(() => {
  const state = window.JYCacheStatus = {
    enabled: false,
    status: 'disabled',
    scope: '',
    error: '',
  };
  const config = window.JY_CONFIG;
  if (config?.offline !== true || !('serviceWorker' in navigator)) return;

  const secureHost = location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';
  if (!secureHost) {
    state.status = 'unsupported-origin';
    return;
  }

  state.enabled = true;
  state.status = 'registering';
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(registration => {
        state.scope = registration.scope || '';
        return navigator.serviceWorker.ready;
      })
      .then(registration => {
        state.status = 'ready';
        state.scope = registration.scope || state.scope;
        window.dispatchEvent(new CustomEvent('jy3:cache-ready', { detail: { ...state } }));
      })
      .catch(error => {
        state.status = 'failed';
        state.error = String(error?.message || error || 'unknown');
        console.warn('service worker cache registration failed', error);
      });
  }, { once: true });
})();
