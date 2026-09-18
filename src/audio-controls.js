(() => {
  const AudioManager = window.JYAudio;
  if (!AudioManager) return;

  const button = document.getElementById('audioSettingsBtn');
  const panel = document.getElementById('audioSettingsPanel');
  const reset = document.getElementById('audioResetBtn');
  const controls = {
    master: document.getElementById('audioMaster'),
    longLived: document.getElementById('audioLongLived'),
    oneShot: document.getElementById('audioOneShot'),
  };
  const outputs = {
    master: document.getElementById('audioMasterValue'),
    longLived: document.getElementById('audioLongLivedValue'),
    oneShot: document.getElementById('audioOneShotValue'),
  };

  if (!button || !panel || Object.values(controls).some(node => !node)) return;

  function percent(value) {
    return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  }

  function sync() {
    const current = AudioManager.settings();
    for (const key of Object.keys(controls)) {
      const value = percent(current[key]);
      controls[key].value = String(value);
      if (outputs[key]) outputs[key].textContent = `${value}%`;
    }
    const master = percent(current.master);
    button.textContent = master === 0 ? '音频：静音' : `音频 ${master}%`;
  }

  function setOpen(open) {
    panel.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  for (const [key, input] of Object.entries(controls)) {
    input.addEventListener('input', () => {
      AudioManager.setVolumes({ [key]: Number(input.value) / 100 });
      sync();
    });
  }

  button.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(panel.classList.contains('hidden'));
  });

  reset?.addEventListener('click', () => {
    AudioManager.resetVolumes();
    sync();
  });

  document.addEventListener('click', event => {
    if (panel.classList.contains('hidden')) return;
    if (panel.contains(event.target) || event.target === button) return;
    setOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setOpen(false);
  });

  sync();
})();
