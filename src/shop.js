(() => {
  const clampQuantity = (value, maximum) => {
    const max = Math.max(0, Math.floor(Number(maximum) || 0));
    const n = Math.floor(Number(value) || 0);
    return Math.max(0, Math.min(max, n));
  };

  const calculateTotal = (prices, quantities) => prices.reduce((sum, price, index) => {
    return sum + (Number(price) || 0) * (Number(quantities[index]) || 0);
  }, 0);

  window.JYShopModel = { clampQuantity, calculateTotal };

  let session = null;
  let ui = null;

  function ensureUi() {
    if (ui) return ui;
    const panel = document.createElement('section');
    panel.id = 'shopPanel';
    panel.className = 'shop-panel hidden';
    panel.innerHTML = `
      <button class="shop-backdrop" type="button" aria-label="离开商店"></button>
      <div class="shop-window" role="dialog" aria-modal="true" aria-label="商店">
        <header class="shop-header">
          <div>
            <strong id="shopTitle">商店</strong>
            <span id="shopMoney">银两 0</span>
          </div>
          <button id="shopClose" class="shop-close" type="button">离开</button>
        </header>
        <div id="shopList" class="shop-list"></div>
        <footer class="shop-footer">
          <div><span>合计</span><strong id="shopTotal">0 两</strong></div>
          <button id="shopCheckout" class="primary" type="button">结账</button>
        </footer>
      </div>`;
    document.body.appendChild(panel);

    ui = {
      panel,
      backdrop: panel.querySelector('.shop-backdrop'),
      title: panel.querySelector('#shopTitle'),
      money: panel.querySelector('#shopMoney'),
      list: panel.querySelector('#shopList'),
      total: panel.querySelector('#shopTotal'),
      checkout: panel.querySelector('#shopCheckout'),
      close: panel.querySelector('#shopClose'),
    };
    ui.backdrop.onclick = () => finish(false);
    ui.close.onclick = () => finish(false);
    ui.checkout.onclick = () => finish(true);
    return ui;
  }

  function currentTotal() {
    if (!session) return 0;
    return calculateTotal(session.products.map(row => row.price), session.quantities);
  }

  function render() {
    const view = ensureUi();
    if (!session) return;
    view.title.textContent = session.mode === 'sell' ? '出售物品' : '购买物品';
    view.money.textContent = `银两 ${session.money}`;
    view.list.innerHTML = '';

    session.products.forEach((product, index) => {
      const quantity = session.quantities[index];
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML = `
        <div class="shop-product">
          <strong></strong>
          <span class="shop-price"></span>
          <small class="shop-owned"></small>
        </div>
        <div class="shop-quantity">
          <button class="shop-minus" type="button">−</button>
          <input class="shop-count" inputmode="numeric" min="0" max="${product.maximum}" value="${quantity}">
          <button class="shop-plus" type="button">＋</button>
        </div>`;
      row.querySelector('.shop-product strong').textContent = product.name;
      row.querySelector('.shop-price').textContent = `${product.price} 两`;
      row.querySelector('.shop-owned').textContent = session.mode === 'sell'
        ? `持有 ${product.owned} · 最多出售 ${product.maximum}`
        : '单项最多 99';

      const input = row.querySelector('.shop-count');
      const setQuantity = (next) => {
        session.quantities[index] = clampQuantity(next, product.maximum);
        input.value = String(session.quantities[index]);
        updateSummary();
      };
      row.querySelector('.shop-minus').onclick = () => setQuantity(session.quantities[index] - 1);
      row.querySelector('.shop-plus').onclick = () => setQuantity(session.quantities[index] + 1);
      input.oninput = () => setQuantity(input.value);
      view.list.appendChild(row);
    });
    updateSummary();
  }

  function updateSummary() {
    if (!session || !ui) return;
    const total = currentTotal();
    ui.total.textContent = `${total} 两`;
    ui.checkout.disabled = total <= 0;
  }

  function finish(checkedOut) {
    if (!session) return;
    const current = session;
    session = null;
    const view = ensureUi();
    view.panel.classList.add('hidden');
    const quantities = checkedOut ? current.quantities : current.quantities.map(() => 0);
    const total = checkedOut ? calculateTotal(current.products.map(row => row.price), quantities) : 0;
    current.resume(Boolean(checkedOut), total, ...quantities, ...Array(Math.max(0, 8 - quantities.length)).fill(0));
  }

  function open(names, prices, owned, mode, money, resume) {
    const nameList = [...names].map(String);
    const priceList = [...prices].map(value => Number(value) || 0);
    const ownedList = [...owned].map(value => Math.max(0, Number(value) || 0));
    const shopMode = String(mode) === 'sell' ? 'sell' : 'buy';
    const products = nameList.map((name, index) => ({
      name,
      price: priceList[index] || 0,
      owned: ownedList[index] || 0,
      maximum: shopMode === 'sell' ? ownedList[index] || 0 : 99,
    }));

    session = {
      products,
      quantities: products.map(() => 0),
      mode: shopMode,
      money: Number(money) || 0,
      resume,
    };
    const view = ensureUi();
    view.panel.classList.remove('hidden');
    render();
  }

  window.JYShop = { open, cancel: () => finish(false) };

  function installWebBridge() {
    if (!window.JYWeb) return false;
    window.JYWeb.showShop = function(names, prices, owned, mode, money, resume) {
      window.JYShop.open(names, prices, owned, mode, money, resume);
    };
    return true;
  }

  // p_order.lua must already be loaded before shop_web.lua wraps G.call.  The
  // upstream bootstrap is the stable point where gf_web/runtime_shims exist and
  // original data/program modules have finished loading.
  const upstream = window.JYUpstream;
  if (upstream?.bootstrapData) {
    const bootstrapData = upstream.bootstrapData.bind(upstream);
    upstream.bootstrapData = async (...args) => {
      const result = await bootstrapData(...args);
      installWebBridge();
      const response = await fetch('./lua/shop_web.lua');
      if (!response.ok) throw new Error(`shop_web.lua: HTTP ${response.status}`);
      fengari.load(await response.text(), '@shop_web.lua')();
      return result;
    };
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && session) {
      event.preventDefault();
      finish(false);
    }
  });
})();
