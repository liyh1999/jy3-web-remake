const CACHE_NAME = 'jy3-web-shell-__JY3_CACHE_VERSION__';
const CORE_SHELL = [
  './',
  './index.html',
  './runtime-config.js',
  './src/style.css',
  './src/inventory.css',
  './src/person.css',
  './src/shop.css',
  './vendor/fengari/fengari-web.js',
  './src/version.js',
  './src/display.js',
  './src/keybindings.js',
  './src/resource-catalog.js',
  './src/resources.js',
  './src/cache.js',
  './src/audio.js',
  './src/debug.js',
  './src/keybindings-controls.js',
  './src/display-controls.js',
  './src/audio-controls.js',
  './src/animation-resources.js',
  './src/renderer.js',
  './src/animation-player.js',
  './src/input.js',
  './src/map-scene.js',
  './src/upstream.js',
  './src/shop.js',
  './src/save-store.js',
  './src/battle-effects.js',
  './src/battle.js',
  './src/app.js',
  './src/gcore-scene.js',
  './src/inventory.js',
  './src/person.js',
  './lua/gf_web.lua',
  './lua/runtime_shims.lua',
  './lua/program_runtime.lua',
  './lua/story_program_web.lua',
  './lua/minigame_web.lua',
  './lua/battle_web.lua',
  './lua/save_state.lua',
  './lua/jy3_demo.lua'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('jy3-web-shell-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/service-worker.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
  );
});
