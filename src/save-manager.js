(() => {
  const $ = (selector) => document.querySelector(selector);
  const PREFIX = 'jy3-web-remake:save:v2:';
  const LEGACY_KEY = 'jy3-web-remake:save:v1';
  const SLOTS = [
    { id: 'slot1', label: '存档一', manual: true },
    { id: 'slot2', label: '存档二', manual: true },
    { id: 'slot3', label: '存档三', manual: true },
    { id: 'auto', label: '自动存档', manual: false }
  ];
  const bridge = { payload: '', meta: null };
  let installed = false;
  let mode = 'save';
  let loading = false;

  window.JYSaveBridge = bridge;

  function key(slotId) { return `${PREFIX}${slotId}`; }
  function runLua(source, name = '@web/save-manager') { return fengari.load(source, name)(); }

  function setStatus(message) {
    const status = $('#runtimeStatus');
    if (status) status.textContent = String(message || '');
  }

  function readSlot(slotId) {
    const raw = localStorage.getItem(key(slotId));
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (_) { return null; }
  }

  function captureMeta() {
    bridge.meta = null;
    bridge.capture = (name, mapId, level, money, day) => {
      bridge.meta = {
        name: String(name || '无名'),
        mapId: Number(mapId) || 0,
        level: Number(level) || 0,
        money: Number(money) || 0,
        day: Number(day) || 0
      };
    };
    runLua(`
      local js=require"js"
      local G=require"gf"
      local b=G.QueryName(0x10030001)
      js.global.JYSaveBridge:capture(
        tostring(b[tostring(2)] or b["姓名"] or "无名"),
        tonumber(b[tostring(140)]) or 0,
        tonumber(b[tostring(6)]) or 0,
        tonumber(b[tostring(110)]) or 0,
        tonumber(b[tostring(70)]) or 0
      )
      return true
    `, '@web/save-meta');
    return bridge.meta || { name: '无名', mapId: 0, level: 0, money: 0, day: 0 };
  }

  function saveTo(slotId, { silent = false } = {}) {
    try {
      const luaState = runLua('return __jy_export_state()', '@web/export-save-v2');
      const meta = captureMeta();
      const payload = {
        version: 2,
        upstream: window.JYUpstream?.UPSTREAM_REV || '',
        savedAt: new Date().toISOString(),
        meta,
        luaState
      };
      localStorage.setItem(key(slotId), JSON.stringify(payload));
      if (!silent) setStatus(`已保存到${SLOTS.find(s => s.id === slotId)?.label || slotId}`);
      renderSlots();
      refreshTopButtons();
      return true;
    } catch (error) {
      console.error(error);
      if (!silent) setStatus(`存档失败：${error.message || error}`);
      return false;
    }
  }

  function loadFrom(slotId) {
    const payload = readSlot(slotId);
    if (!payload?.luaState) {
      setStatus('该槽位没有有效存档');
      return false;
    }
    try {
      loading = true;
      $('#dialogue')?.classList.add('hidden');
      $('#battle')?.classList.add('hidden');
      window.JYWeb?.reset?.();
      runLua('return __jy_reset_runtime()', '@web/reset-before-load-v2');
      bridge.payload = payload.luaState;
      const ok = runLua('local js=require"js"; return __jy_import_state(js.global.JYSaveBridge.payload)', '@web/import-save-v2');
      bridge.payload = '';
      if (!ok) throw new Error('Lua 状态导入失败');
      window.JYWeb?.enterVillage?.();
      setStatus(`已读取${SLOTS.find(s => s.id === slotId)?.label || slotId}`);
      closePanel();
      return true;
    } catch (error) {
      bridge.payload = '';
      console.error(error);
      setStatus(`读档失败：${error.message || error}`);
      return false;
    } finally {
      setTimeout(() => { loading = false; }, 0);
    }
  }

  function deleteSlot(slotId) {
    localStorage.removeItem(key(slotId));
    renderSlots();
    refreshTopButtons();
    setStatus(`已删除${SLOTS.find(s => s.id === slotId)?.label || slotId}`);
  }

  function formatMeta(payload) {
    if (!payload) return '空槽位';
    const meta = payload.meta || {};
    const time = payload.savedAt ? new Date(payload.savedAt).toLocaleString() : '未知时间';
    const pieces = [meta.name || '无名'];
    if (Number(meta.money)) pieces.push(`银两 ${meta.money}`);
    if (Number(meta.day)) pieces.push(`第 ${meta.day} 天`);
    return `${pieces.join(' · ')}\n${time}`;
  }

  function renderSlots() {
    const root = $('#saveSlotList');
    if (!root) return;
    root.innerHTML = '';
    for (const slot of SLOTS) {
      const payload = readSlot(slot.id);
      const card = document.createElement('article');
      card.className = 'save-slot';

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = slot.label;
      const detail = document.createElement('pre');
      detail.textContent = formatMeta(payload);
      info.append(title, detail);

      const actions = document.createElement('div');
      actions.className = 'save-slot-actions';
      const main = document.createElement('button');
      if (mode === 'save' && slot.manual) {
        main.textContent = payload ? '覆盖' : '保存';
        main.onclick = () => saveTo(slot.id);
      } else {
        main.textContent = '读取';
        main.disabled = !payload;
        main.onclick = () => loadFrom(slot.id);
      }
      actions.appendChild(main);

      if (payload && slot.manual) {
        const remove = document.createElement('button');
        remove.textContent = '删除';
        remove.className = 'danger-lite';
        remove.onclick = () => deleteSlot(slot.id);
        actions.appendChild(remove);
      }

      card.append(info, actions);
      root.appendChild(card);
    }
  }

  function openPanel(nextMode) {
    mode = nextMode;
    const title = $('#savePanelTitle');
    if (title) title.textContent = mode === 'save' ? '保存游戏' : '读取游戏';
    $('#savePanel')?.classList.remove('hidden');
    renderSlots();
  }

  function closePanel() { $('#savePanel')?.classList.add('hidden'); }

  function refreshTopButtons() {
    const load = $('#loadBtn');
    if (load) load.disabled = !SLOTS.some(slot => readSlot(slot.id));
  }

  function migrateLegacy() {
    if (SLOTS.some(slot => readSlot(slot.id))) return;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    try {
      const old = JSON.parse(raw);
      if (!old?.luaState) return;
      localStorage.setItem(key('slot1'), JSON.stringify({
        version: 2,
        upstream: old.upstream || window.JYUpstream?.UPSTREAM_REV || '',
        savedAt: old.savedAt || new Date().toISOString(),
        meta: { name: '旧版存档', mapId: 0, level: 0, money: 0, day: 0 },
        luaState: old.luaState
      }));
    } catch (_) {
      // Keep a malformed legacy save untouched for manual recovery.
    }
  }

  function autoSave() {
    if (!installed || loading) return false;
    return saveTo('auto', { silent: true });
  }

  function install() {
    if (installed || !window.fengari || !window.JYWeb) return false;
    try {
      const ready = runLua('return type(__jy_export_state)=="function" and type(__jy_import_state)=="function"', '@web/save-manager-probe');
      if (!ready) return false;
      installed = true;
      migrateLegacy();

      const save = $('#saveBtn');
      const load = $('#loadBtn');
      if (save) { save.disabled = false; save.onclick = () => openPanel('save'); }
      if (load) load.onclick = () => openPanel('load');
      $('#savePanelClose')?.addEventListener('click', closePanel);
      $('#savePanelBackdrop')?.addEventListener('click', closePanel);
      refreshTopButtons();

      const originalEnterVillage = window.JYWeb.enterVillage?.bind(window.JYWeb);
      if (originalEnterVillage) {
        window.JYWeb.enterVillage = (...args) => {
          const result = originalEnterVillage(...args);
          if (!loading) setTimeout(autoSave, 0);
          return result;
        };
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  window.JYSaveManager = { saveTo, loadFrom, autoSave, openPanel, readSlot };

  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 30000);
})();
