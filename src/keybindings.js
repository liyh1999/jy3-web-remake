(() => {
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const STORAGE_KEY = 'jy3-web-remake:keybindings:v1';
  const DEFINITIONS = Object.freeze([
    ...Array.from({ length: 8 }, (_, index) => Object.freeze({
      action: `skill${index + 1}`,
      label: `武功 ${index + 1}`,
      group: 'skill',
      defaultKey: String(index + 1),
    })),
    ...['q', 'w', 'e', 'r'].map((key, index) => Object.freeze({
      action: `item${index + 1}`,
      label: `物品 ${index + 1}`,
      group: 'item',
      defaultKey: key,
    })),
    Object.freeze({ action: 'auto', label: '自动战斗', group: 'command', defaultKey: 'a' }),
    Object.freeze({ action: 'escape', label: '逃跑', group: 'command', defaultKey: 'Escape' }),
  ]);
  const DEFINITION_BY_ACTION = new Map(DEFINITIONS.map(row => [row.action, row]));
  const DEFAULTS = Object.freeze(Object.fromEntries(DEFINITIONS.map(row => [row.action, row.defaultKey])));
  let bindings = { ...DEFAULTS };

  function normalizeKey(value) {
    const raw = String(value ?? '');
    if (raw === 'Escape' || raw === 'Esc') return 'Escape';
    if (raw.length === 1 && /^[a-z0-9]$/i.test(raw)) return raw.toLowerCase();
    return '';
  }

  function keyLabel(value) {
    const key = normalizeKey(value);
    return key === 'Escape' ? 'Esc' : key.toUpperCase();
  }

  function validBindings(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const next = {};
    const used = new Set();
    for (const row of DEFINITIONS) {
      const key = normalizeKey(input[row.action] ?? row.defaultKey);
      if (!key || used.has(key)) return null;
      used.add(key);
      next[row.action] = key;
    }
    return next;
  }

  function load() {
    try {
      const raw = ROOT.localStorage?.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      bindings = validBindings(parsed) || { ...DEFAULTS };
    } catch (_) {
      bindings = { ...DEFAULTS };
    }
    return settings();
  }

  function persist() {
    try { ROOT.localStorage?.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch (_) {}
  }

  function emit() {
    try {
      ROOT.dispatchEvent?.(new CustomEvent('jy3:keybindings-changed', { detail: settings() }));
    } catch (_) {}
  }

  function binding(action) {
    const id = String(action || '');
    return bindings[id] || '';
  }

  function actionForKey(value) {
    const key = normalizeKey(value);
    if (!key) return '';
    for (const row of DEFINITIONS) {
      if (bindings[row.action] === key) return row.action;
    }
    return '';
  }

  function setBinding(action, value) {
    const id = String(action || '');
    if (!DEFINITION_BY_ACTION.has(id)) return { ok: false, error: `未知快捷键动作：${id}` };
    const key = normalizeKey(value);
    if (!key) return { ok: false, error: '仅支持字母、数字或 Esc' };
    const conflict = actionForKey(key);
    if (conflict && conflict !== id) {
      return {
        ok: false,
        error: `${keyLabel(key)} 已用于 ${DEFINITION_BY_ACTION.get(conflict)?.label || conflict}`,
        conflict,
      };
    }
    bindings = { ...bindings, [id]: key };
    persist();
    emit();
    return { ok: true, action: id, key, label: keyLabel(key) };
  }

  function reset() {
    bindings = { ...DEFAULTS };
    persist();
    emit();
    return settings();
  }

  function settings() {
    return {
      storageKey: STORAGE_KEY,
      bindings: { ...bindings },
    };
  }

  load();

  ROOT.JYKeybindings = Object.freeze({
    STORAGE_KEY,
    DEFINITIONS,
    DEFAULTS,
    normalizeKey,
    keyLabel,
    binding,
    actionForKey,
    setBinding,
    reset,
    settings,
    load,
  });
})();
