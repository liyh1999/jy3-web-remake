(() => {
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const SCHEMA_VERSION = 2;
  const PREFIX = 'jy3-web-remake:save:v2:';
  const LEGACY_SINGLE_KEY = 'jy3-web-remake:save:v1';
  const SLOT_IDS = Object.freeze(['slot1', 'slot2', 'slot3', 'autosave']);
  const MANUAL_SLOT_IDS = Object.freeze(['slot1', 'slot2', 'slot3']);

  function isSlot(slot) {
    return SLOT_IDS.includes(String(slot || ''));
  }

  function cloneMeta(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
    return { ...meta };
  }

  function migratePayload(input, slot) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('存档格式无效');
    }

    if (input.schemaVersion === SCHEMA_VERSION) {
      if (typeof input.luaState !== 'string' || !input.luaState) throw new Error('存档缺少 Lua 状态');
      return {
        schemaVersion: SCHEMA_VERSION,
        slot,
        upstream: String(input.upstream || ''),
        savedAt: String(input.savedAt || ''),
        meta: cloneMeta(input.meta),
        luaState: input.luaState,
      };
    }

    // Original single-slot prototype payload:
    // { version:1, upstream, savedAt, luaState }
    if ((input.version === 1 || input.schemaVersion === 1) && typeof input.luaState === 'string' && input.luaState) {
      return {
        schemaVersion: SCHEMA_VERSION,
        slot,
        upstream: String(input.upstream || ''),
        savedAt: String(input.savedAt || ''),
        meta: {
          ...cloneMeta(input.meta),
          migratedFrom: 1,
        },
        luaState: input.luaState,
      };
    }

    const version = input.schemaVersion ?? input.version ?? 'unknown';
    throw new Error(`不支持的存档版本：${version}`);
  }

  function parseRaw(raw, slot) {
    if (!raw) return { ok: false, empty: true, slot, error: 'empty' };
    try {
      const parsed = JSON.parse(raw);
      const payload = migratePayload(parsed, slot);
      return { ok: true, slot, payload };
    } catch (error) {
      return { ok: false, empty: false, slot, error: String(error?.message || error) };
    }
  }

  function create(storage, options = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('save storage adapter requires getItem/setItem');
    }
    const prefix = String(options.prefix || PREFIX);
    const legacyKey = String(options.legacyKey || LEGACY_SINGLE_KEY);

    function key(slot) {
      slot = String(slot || '');
      if (!isSlot(slot)) throw new Error(`未知存档槽：${slot}`);
      return prefix + slot;
    }

    function read(slot) {
      slot = String(slot || '');
      if (!isSlot(slot)) return { ok: false, empty: false, slot, error: `未知存档槽：${slot}` };
      let raw = null;
      try {
        raw = storage.getItem(key(slot));
      } catch (error) {
        return { ok: false, empty: false, slot, error: String(error?.message || error) };
      }
      const result = parseRaw(raw, slot);
      if (result.ok) {
        // Persist a migrated payload back into the current schema lazily.
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.schemaVersion !== SCHEMA_VERSION) {
            storage.setItem(key(slot), JSON.stringify(result.payload));
          }
        } catch (_) {}
      }
      return result;
    }

    function write(slot, input) {
      slot = String(slot || '');
      if (!isSlot(slot)) throw new Error(`未知存档槽：${slot}`);
      const payload = migratePayload({
        schemaVersion: SCHEMA_VERSION,
        upstream: input?.upstream || '',
        savedAt: input?.savedAt || new Date().toISOString(),
        meta: cloneMeta(input?.meta),
        luaState: input?.luaState,
      }, slot);
      storage.setItem(key(slot), JSON.stringify(payload));
      return payload;
    }

    function remove(slot) {
      if (typeof storage.removeItem !== 'function') return false;
      storage.removeItem(key(slot));
      return true;
    }

    function list() {
      return SLOT_IDS.map(slot => {
        const result = read(slot);
        return {
          slot,
          ok: result.ok,
          empty: !!result.empty,
          error: result.ok ? '' : result.error,
          savedAt: result.ok ? result.payload.savedAt : '',
          meta: result.ok ? cloneMeta(result.payload.meta) : {},
        };
      });
    }

    function migrateLegacySingleSlot() {
      try {
        if (storage.getItem(key('slot1'))) return { migrated: false, reason: 'slot1-exists' };
        const raw = storage.getItem(legacyKey);
        if (!raw) return { migrated: false, reason: 'legacy-empty' };
        const result = parseRaw(raw, 'slot1');
        if (!result.ok) return { migrated: false, reason: 'legacy-invalid', error: result.error };
        storage.setItem(key('slot1'), JSON.stringify(result.payload));
        return { migrated: true, payload: result.payload };
      } catch (error) {
        return { migrated: false, reason: 'storage-error', error: String(error?.message || error) };
      }
    }

    return { key, read, write, remove, list, migrateLegacySingleSlot };
  }

  ROOT.JYSaveStore = Object.freeze({
    SCHEMA_VERSION,
    PREFIX,
    LEGACY_SINGLE_KEY,
    SLOT_IDS,
    MANUAL_SLOT_IDS,
    migratePayload,
    create,
  });
})();
