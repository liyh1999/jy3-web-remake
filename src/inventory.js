(() => {
  const $ = (selector) => document.querySelector(selector);
  const model = { money: 0, items: [], slots: [] };
  let installed = false;

  function runLua(source, name = '@web/inventory') {
    return fengari.load(source, name)();
  }

  function resourceUrl(id) {
    return Number(id) ? window.JYResources?.url(Number(id)) : null;
  }

  function setStatus(message) {
    const status = $('#inventoryStatus');
    if (status) status.textContent = message || '';
  }

  function renderSlots() {
    const root = $('#inventorySlots');
    if (!root) return;
    root.innerHTML = '';
    for (const slot of model.slots) {
      const card = document.createElement('button');
      card.className = 'inventory-slot';
      card.type = 'button';
      card.disabled = !slot.id;
      card.title = slot.id ? `点击卸下${slot.label}` : slot.label;

      const imgUrl = resourceUrl(slot.icon);
      if (imgUrl) {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = '';
        card.appendChild(img);
      }

      const text = document.createElement('span');
      const label = document.createElement('b');
      label.textContent = slot.label;
      const value = document.createElement('small');
      value.textContent = slot.name;
      text.append(label, value);
      card.appendChild(text);

      if (slot.id) {
        card.onclick = () => {
          try {
            runLua(`return __jy_inventory_unequip(${JSON.stringify(slot.point)})`, '@web/unequip');
          } catch (error) {
            console.error(error);
            setStatus(`卸下失败：${error.message || error}`);
          }
        };
      }
      root.appendChild(card);
    }
  }

  function renderItems() {
    const root = $('#inventoryList');
    if (!root) return;
    root.innerHTML = '';

    if (!model.items.length) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.textContent = '背包为空';
      root.appendChild(empty);
      return;
    }

    for (const item of model.items) {
      const card = document.createElement('article');
      card.className = `inventory-item${item.equipped ? ' equipped' : ''}`;

      const icon = document.createElement('div');
      icon.className = 'inventory-icon';
      const imgUrl = resourceUrl(item.icon);
      if (imgUrl) {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = item.name;
        icon.appendChild(img);
      } else {
        icon.textContent = '物';
      }

      const body = document.createElement('div');
      body.className = 'inventory-item-body';
      const title = document.createElement('div');
      title.className = 'inventory-item-title';
      const name = document.createElement('b');
      name.textContent = item.name;
      const count = document.createElement('span');
      count.textContent = `×${item.count}`;
      title.append(name, count);

      const meta = document.createElement('div');
      meta.className = 'inventory-item-meta';
      meta.textContent = `${item.categoryName}${item.equipped ? ' · 已装备' : ''}`;

      const desc = document.createElement('p');
      desc.textContent = item.description || '无说明';
      body.append(title, meta, desc);

      const action = document.createElement('button');
      action.className = 'inventory-action';
      action.type = 'button';
      action.textContent = item.action || '查看';
      action.disabled = !item.action;
      if (item.action) {
        action.onclick = () => {
          try {
            runLua(`return __jy_inventory_action(${item.id})`, '@web/item-action');
          } catch (error) {
            console.error(error);
            setStatus(`物品操作失败：${error.message || error}`);
          }
        };
      }

      card.append(icon, body, action);
      root.appendChild(card);
    }
  }

  function render() {
    const money = $('#inventoryMoney');
    if (money) money.textContent = String(model.money);
    renderSlots();
    renderItems();
  }

  window.JYInventoryBridge = {
    begin(money) {
      model.money = Number(money) || 0;
      model.items = [];
      model.slots = [];
      setStatus('');
    },
    push(id, name, count, category, categoryName, description, icon, equipped, action) {
      model.items.push({
        id: Number(id),
        name: String(name || ''),
        count: Number(count) || 0,
        category: Number(category) || 0,
        categoryName: String(categoryName || '其他'),
        description: String(description || ''),
        icon: Number(icon) || 0,
        equipped: Boolean(equipped),
        action: String(action || '')
      });
    },
    slot(label, id, name, icon) {
      const pointMap = { 武器: '193', 暗器: '198', 内衣: '194', 外衣: '195' };
      model.slots.push({
        label: String(label || ''),
        point: pointMap[String(label || '')] || '',
        id: Number(id) || 0,
        name: String(name || '未装备'),
        icon: Number(icon) || 0
      });
    },
    status(message) { setStatus(String(message || '')); },
    finish() { render(); }
  };

  function refresh() {
    try {
      runLua('return __jy_inventory_refresh()', '@web/inventory-refresh');
    } catch (error) {
      console.error(error);
      setStatus(`背包读取失败：${error.message || error}`);
    }
  }

  function open() {
    const panel = $('#inventoryPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    refresh();
  }

  function close() {
    $('#inventoryPanel')?.classList.add('hidden');
  }

  async function install() {
    if (installed || !window.fengari || !window.JYWeb) return false;
    try {
      const gfReady = runLua('local ok=pcall(require,"gf"); return ok', '@web/inventory-probe');
      if (!gfReady) return false;
      const response = await fetch('./lua/inventory_web.lua');
      if (!response.ok) throw new Error(`inventory_web.lua HTTP ${response.status}`);
      runLua(await response.text(), '@inventory_web.lua');
      installed = true;
      const button = $('#inventoryBtn');
      if (button) button.disabled = false;
      return true;
    } catch (error) {
      console.debug('inventory adapter waiting for runtime', error);
      return false;
    }
  }

  $('#inventoryBtn')?.addEventListener('click', open);
  $('#inventoryClose')?.addEventListener('click', close);
  $('#inventoryBackdrop')?.addEventListener('click', close);

  const timer = setInterval(async () => {
    if (await install()) clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 30000);
})();
