(() => {
  const Keybindings = window.JYKeybindings;
  if (!Keybindings) return;

  const button = document.getElementById('keySettingsBtn');
  const panel = document.getElementById('keySettingsPanel');
  const list = document.getElementById('keyBindingsList');
  const reset = document.getElementById('keyBindingsReset');
  const status = document.getElementById('keyBindingsStatus');
  if (!button || !panel || !list) return;

  let captureAction = '';

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = String(message || '');
    status.classList.toggle('error', error);
  }

  function setOpen(open) {
    panel.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) {
      captureAction = '';
      setStatus('');
      render();
    }
  }

  function render() {
    const rows = Keybindings.DEFINITIONS;
    list.innerHTML = '';
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'keybinding-row';
      const label = document.createElement('span');
      label.textContent = row.label;
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'keybinding-key';
      key.dataset.keyAction = row.action;
      key.textContent = captureAction === row.action ? '按新按键…' : Keybindings.keyLabel(Keybindings.binding(row.action));
      key.addEventListener('click', event => {
        event.stopPropagation();
        captureAction = row.action;
        setStatus(`正在修改：${row.label}`);
        render();
      });
      line.append(label, key);
      list.appendChild(line);
    }
  }

  function capture(event) {
    if (!captureAction || panel.classList.contains('hidden')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const action = captureAction;
    captureAction = '';
    const result = Keybindings.setBinding(action, event.key);
    if (!result.ok) {
      setStatus(result.error || '快捷键设置失败', true);
      captureAction = action;
    } else {
      setStatus(`已设置为 ${result.label}`);
    }
    render();
  }

  button.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(panel.classList.contains('hidden'));
  });

  reset?.addEventListener('click', event => {
    event.stopPropagation();
    Keybindings.reset();
    captureAction = '';
    setStatus('已恢复默认快捷键');
    render();
  });

  document.addEventListener('keydown', capture, true);
  document.addEventListener('click', event => {
    if (panel.classList.contains('hidden')) return;
    if (panel.contains(event.target) || event.target === button) return;
    setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (captureAction || panel.classList.contains('hidden') || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    setOpen(false);
  });
  window.addEventListener('jy3:keybindings-changed', render);

  render();
})();
