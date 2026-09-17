(() => {
  const R = window.JYRenderer;
  const HOTKEY_SLOTS = Object.freeze({ q: 1, w: 2, e: 3, r: 4 });
  const SPECIAL_KEY_CODES = Object.freeze({
    Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ' ': 32,
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
    Delete: 46,
  });

  let hoverTarget = null;
  let downTarget = null;
  let installed = false;
  const subscribers = new Map();
  let nextSubscriber = 1;

  function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function screenToLogical(clientX, clientY, rect) {
    const r = rect || document.querySelector('#gcoreCanvas')?.getBoundingClientRect?.();
    if (!r || !(r.width > 0) || !(r.height > 0)) return null;
    const nx = (finite(clientX) - r.left) / r.width;
    const ny = (finite(clientY) - r.top) / r.height;
    return {
      x: nx * R.LOGICAL_WIDTH - R.HALF_WIDTH,
      y: R.HALF_HEIGHT - ny * R.LOGICAL_HEIGHT,
      inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1,
    };
  }

  function toNodeLocal(node, point) {
    let x = point.x - finite(node.x);
    let y = point.y - finite(node.y);
    const angle = -finite(node.rotation) * Math.PI / 180;
    if (angle) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      x = rx; y = ry;
    }
    const sx = finite(node.scaleX, 1) || 1;
    const sy = finite(node.scaleY, 1) || 1;
    return { x: x / sx, y: y / sy };
  }

  function containsLocal(node, point) {
    const width = Math.max(0, finite(node.width));
    const height = Math.max(0, finite(node.height));
    if (!width || !height) return false;
    const px = finite(node.pivotX, 0.5);
    const py = finite(node.pivotY, 0.5);
    const left = -px * width;
    const right = (1 - px) * width;
    const bottom = -py * height;
    const top = (1 - py) * height;
    return point.x >= left && point.x <= right && point.y >= bottom && point.y <= top;
  }

  function hitNode(node, parentPoint) {
    if (!node || node.visible === false) return null;
    const local = node.type === 'stage' ? parentPoint : toNodeLocal(node, parentPoint);
    if (node.clipChildren && !containsLocal(node, local)) return null;
    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const hit = hitNode(children[i], local);
      if (hit) return hit;
    }
    return node.mouseEnabled && containsLocal(node, local) ? node : null;
  }

  function hitTest(point) {
    if (!R || !point?.inside && point?.inside !== undefined) return null;
    const stage = R.stage();
    const children = stage.children || [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const hit = hitNode(children[i], point);
      if (hit) return hit;
    }
    return stage.mouseEnabled && containsLocal(stage, point) ? stage : null;
  }

  function normalizeKey(key) {
    const raw = String(key ?? '');
    if (raw.length === 1) {
      const info = /[a-z]/i.test(raw) ? raw.toUpperCase() : raw;
      return { info, code: info.charCodeAt(0), name: raw };
    }
    const code = SPECIAL_KEY_CODES[raw] || 0;
    return { info: code ? String.fromCharCode(code) : '', code, name: raw };
  }

  function hotkeySlot(key) {
    return HOTKEY_SLOTS[String(key || '').toLowerCase()] || 0;
  }

  function subscribe(kind, callback, priority = 0) {
    const id = nextSubscriber++;
    const row = { id, callback, priority: finite(priority) };
    const list = subscribers.get(kind) || [];
    list.push(row);
    list.sort((a, b) => b.priority - a.priority || a.id - b.id);
    subscribers.set(kind, list);
    return () => {
      const current = subscribers.get(kind) || [];
      subscribers.set(kind, current.filter(entry => entry.id !== id));
    };
  }

  function emit(kind, payload) {
    for (const entry of subscribers.get(kind) || []) {
      if (entry.callback(payload) === true) return true;
    }
    return false;
  }

  function dispatchLua(kind, target, point = {}, info = '', slot = 0) {
    if (!window.fengari?.load) return false;
    const handle = Number(target?.handle) || 0;
    const x = finite(point.x), y = finite(point.y);
    const chunk = `if type(__jy_input_event)=='function' then return __jy_input_event(${JSON.stringify(kind)},${handle},${x},${y},${JSON.stringify(info)},${Number(slot) || 0}) end return false`;
    try { return !!window.fengari.load(chunk, '@web/input-event')(); }
    catch (error) { console.error('[jy3-web] input dispatch failed', error); return false; }
  }

  function dispatch(kind, target, point, info = '', slot = 0) {
    const payload = { kind, target, handle: target?.handle || 0, x: point?.x || 0, y: point?.y || 0, info, slot };
    if (emit(kind, payload)) return true;
    return dispatchLua(kind, target, point, info, slot);
  }

  function setHover(next, point) {
    if (next === hoverTarget) return;
    if (hoverTarget) dispatch('rollOut', hoverTarget, point);
    hoverTarget = next;
    if (hoverTarget) dispatch('rollOver', hoverTarget, point);
  }

  function pointerPoint(event) {
    const canvas = document.querySelector('#gcoreCanvas') || R?.ensureCanvas?.();
    return screenToLogical(event.clientX, event.clientY, canvas?.getBoundingClientRect?.());
  }

  function onPointerMove(event) {
    const point = pointerPoint(event);
    if (!point) return;
    setHover(point.inside ? hitTest(point) : null, point);
    if (downTarget) dispatch('mouseMove', downTarget, point);
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const point = pointerPoint(event);
    if (!point?.inside) return;
    const target = hitTest(point);
    setHover(target, point);
    downTarget = target;
    if (target) {
      event.preventDefault?.();
      event.currentTarget?.setPointerCapture?.(event.pointerId);
      dispatch('mouseDown', target, point);
    }
  }

  function onPointerUp(event) {
    const point = pointerPoint(event) || { x: 0, y: 0, inside: false };
    const target = point.inside ? hitTest(point) : null;
    const pressed = downTarget;
    downTarget = null;
    if (pressed) dispatch('mouseUp', pressed, point);
    if (pressed && target === pressed) dispatch('click', pressed, point);
    setHover(target, point);
  }

  function onPointerCancel(event) {
    const point = pointerPoint(event) || { x: 0, y: 0, inside: false };
    if (downTarget) dispatch('mouseUp', downTarget, point);
    downTarget = null;
    setHover(null, point);
  }

  function visible(selector) {
    const node = document.querySelector(selector);
    return node && !node.classList.contains('hidden');
  }

  function handleHtmlModalKey(event, normalized) {
    if (visible('#personPanel') && normalized.code === 27) {
      document.querySelector('#personClose')?.click();
      return true;
    }
    if (visible('#inventoryPanel') && normalized.code === 27) {
      document.querySelector('#inventoryClose')?.click();
      return true;
    }
    if (!visible('#dialogue')) return false;
    if (normalized.code >= 49 && normalized.code <= 57) {
      const index = normalized.code - 49;
      const button = document.querySelectorAll('#options button')[index];
      if (button) { button.click(); return true; }
    }
    if (normalized.code === 13 || normalized.code === 32) {
      const button = document.querySelector('#continueBtn:not(.hidden)');
      if (button) { button.click(); return true; }
    }
    return false;
  }

  function onKeyDown(event) {
    const normalized = normalizeKey(event.key);
    if (!normalized.code) return;
    if (handleHtmlModalKey(event, normalized)) {
      event.preventDefault?.();
      return;
    }
    const active = document.activeElement;
    const editing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    if (editing && normalized.code !== 27) return;
    const slot = hotkeySlot(event.key);
    if (dispatch('keyDown', hoverTarget, { x: 0, y: 0 }, normalized.info, slot)) event.preventDefault?.();
  }

  function onKeyUp(event) {
    const normalized = normalizeKey(event.key);
    if (!normalized.code) return;
    const slot = hotkeySlot(event.key);
    if (dispatch('keyUp', hoverTarget, { x: 0, y: 0 }, normalized.info, slot)) event.preventDefault?.();
  }

  function install() {
    if (installed || typeof document === 'undefined' || !R) return false;
    const host = document.querySelector('#scene');
    if (!host) return false;
    installed = true;
    host.style.touchAction = 'none';
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('pointercancel', onPointerCancel);
    host.addEventListener('pointerleave', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return true;
  }

  window.JYInput = {
    HOTKEY_SLOTS,
    SPECIAL_KEY_CODES,
    screenToLogical,
    toNodeLocal,
    containsLocal,
    hitTest,
    normalizeKey,
    hotkeySlot,
    subscribe,
    dispatch,
    install,
    state: () => ({ hoverHandle: hoverTarget?.handle || 0, downHandle: downTarget?.handle || 0 }),
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  }
})();
