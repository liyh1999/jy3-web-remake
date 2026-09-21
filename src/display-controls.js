(() => {
  const Display = window.JYDisplay;
  if (!Display) return;

  const button = document.getElementById('displaySettingsBtn');
  const panel = document.getElementById('displaySettingsPanel');
  const select = document.getElementById('displayScaleSelect');
  const effective = document.getElementById('displayScaleEffective');
  if (!button || !panel || !select) return;

  const labels = {
    auto: '自动',
    '0.75': '75%',
    '1': '100%',
    '1.25': '125%',
    '1.5': '150%',
  };

  function sync() {
    const state = Display.settings();
    select.value = state.preference;
    const label = labels[state.preference] || state.preference;
    button.textContent = `画面 ${label}`;
    if (effective) effective.textContent = `当前 ${Math.round(state.scale * 100)}%`;
  }

  function setOpen(open) {
    panel.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  select.addEventListener('change', () => {
    Display.setPreference(select.value);
    sync();
  });

  button.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(panel.classList.contains('hidden'));
  });

  document.addEventListener('click', event => {
    if (panel.classList.contains('hidden')) return;
    if (panel.contains(event.target) || event.target === button) return;
    setOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setOpen(false);
  });

  window.addEventListener('resize', sync);
  window.addEventListener('jy3:display-scale-changed', sync);
  sync();
})();
