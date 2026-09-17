(() => {
  const $ = (selector) => document.querySelector(selector);
  const model = {
    name: '', nickname: '', school: '', rank: '', master: '', portrait: 0,
    vitals: [], qualities: [], slots: []
  };
  let installed = false;

  function runLua(source, name = '@web/person') {
    return fengari.load(source, name)();
  }

  function resourceUrl(id) {
    return Number(id) ? window.JYResources?.url(Number(id)) : null;
  }

  function renderHeader() {
    const portrait = $('#personPortrait');
    const url = resourceUrl(model.portrait);
    if (portrait) {
      portrait.innerHTML = '';
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = model.name;
        portrait.appendChild(img);
      } else {
        portrait.textContent = '侠';
      }
    }
    if ($('#personName')) $('#personName').textContent = model.name || '无名侠客';
    if ($('#personNickname')) $('#personNickname').textContent = model.nickname || '无绰号';
    if ($('#personSchool')) $('#personSchool').textContent = model.school || '无门派';
    if ($('#personRank')) $('#personRank').textContent = model.rank || '—';
    if ($('#personMaster')) $('#personMaster').textContent = model.master || '—';
  }

  function renderRows(rootSelector, rows, className) {
    const root = $(rootSelector);
    if (!root) return;
    root.innerHTML = '';
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = className;
      const label = document.createElement('span');
      label.textContent = row.label;
      const value = document.createElement('b');
      value.textContent = row.max > 0 ? `${row.value} / ${row.max}` : String(row.value);
      item.append(label, value);
      root.appendChild(item);
    }
  }

  function renderSlots() {
    const root = $('#personSlots');
    if (!root) return;
    root.innerHTML = '';
    for (const slot of model.slots) {
      const item = document.createElement('div');
      item.className = `person-slot${slot.id ? ' equipped' : ''}`;
      const icon = document.createElement('div');
      icon.className = 'person-slot-icon';
      const url = resourceUrl(slot.icon);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        icon.appendChild(img);
      } else {
        icon.textContent = slot.id ? '装' : '—';
      }
      const text = document.createElement('div');
      const label = document.createElement('span');
      label.textContent = slot.label;
      const name = document.createElement('b');
      name.textContent = slot.name || '未装备';
      text.append(label, name);
      item.append(icon, text);
      root.appendChild(item);
    }
  }

  function render() {
    renderHeader();
    renderRows('#personVitals', model.vitals, 'person-stat');
    renderRows('#personQualities', model.qualities, 'person-stat compact');
    renderSlots();
  }

  window.JYPersonBridge = {
    begin(name, nickname, school, rank, master, portrait) {
      model.name = String(name || '');
      model.nickname = String(nickname || '');
      model.school = String(school || '');
      model.rank = String(rank || '');
      model.master = String(master || '');
      model.portrait = Number(portrait) || 0;
      model.vitals = [];
      model.qualities = [];
      model.slots = [];
    },
    vital(label, value, max) {
      model.vitals.push({ label: String(label || ''), value: Number(value) || 0, max: Number(max) || 0 });
    },
    quality(label, value) {
      model.qualities.push({ label: String(label || ''), value: Number(value) || 0, max: 0 });
    },
    slot(label, id, name, icon, point) {
      model.slots.push({
        label: String(label || ''), id: Number(id) || 0, name: String(name || '未装备'),
        icon: Number(icon) || 0, point: String(point || '')
      });
    },
    finish() { render(); }
  };

  function refresh() {
    try {
      runLua('return __jy_person_refresh()', '@web/person-refresh');
    } catch (error) {
      console.error(error);
      const status = $('#runtimeStatus');
      if (status) status.textContent = `人物面板读取失败：${error.message || error}`;
    }
  }

  function open() {
    const panel = $('#personPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    refresh();
  }

  function close() {
    $('#personPanel')?.classList.add('hidden');
  }

  async function install() {
    if (installed || !window.fengari || !window.JYWeb) return false;
    try {
      const gfReady = runLua('local ok=pcall(require,"gf"); return ok', '@web/person-probe');
      if (!gfReady) return false;
      const response = await fetch('./lua/person_web.lua');
      if (!response.ok) throw new Error(`person_web.lua HTTP ${response.status}`);
      runLua(await response.text(), '@person_web.lua');
      installed = true;
      const button = $('#personBtn');
      if (button) button.disabled = false;
      return true;
    } catch (error) {
      console.debug('person adapter waiting for runtime', error);
      return false;
    }
  }

  $('#personBtn')?.addEventListener('click', open);
  $('#personClose')?.addEventListener('click', close);
  $('#personBackdrop')?.addEventListener('click', close);

  const timer = setInterval(async () => {
    if (await install()) clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 30000);
})();
