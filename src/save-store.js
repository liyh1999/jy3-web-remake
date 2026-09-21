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
        runtimeVersion: String(input.runtimeVersion || ''),
        protocolVersion: Number.isFinite(Number(input.protocolVersion)) ? Number(input.protocolVersion) : 0,
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
        runtimeVersion: '',
        protocolVersion: 0,
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

  function compatibility(payload, current = {}) {
    const savedProtocol = Number(payload?.protocolVersion || 0);
    const currentProtocol = Number(current?.protocolVersion || 0);
    const savedUpstream = String(payload?.upstream || '');
    const currentUpstream = String(current?.upstream || '');
    const savedRuntime = String(payload?.runtimeVersion || '');
    const currentRuntime = String(current?.runtimeVersion || '');

    if (savedProtocol > 0 && currentProtocol > 0 && savedProtocol !== currentProtocol) {
      return {
        compatible: false,
        code: savedProtocol > currentProtocol ? 'protocol-newer' : 'protocol-mismatch',
        message: `存档协议版本 ${savedProtocol} 与当前运行时协议 ${currentProtocol} 不兼容`,
      };
    }
    if (!savedProtocol) {
      return {
        compatible: true,
        legacy: true,
        code: 'legacy-unversioned',
        message: savedUpstream && currentUpstream && savedUpstream !== currentUpstream
          ? `旧存档未记录运行时协议，且原版数据版本为 ${savedUpstream.slice(0, 12)}；将按兼容模式读取`
          : '旧存档未记录运行时协议，将按兼容模式读取',
      };
    }
    if (savedUpstream && currentUpstream && savedUpstream !== currentUpstream) {
      return {
        compatible: false,
        code: 'upstream-mismatch',
        message: `存档原版数据版本 ${savedUpstream.slice(0, 12)} 与当前版本 ${currentUpstream.slice(0, 12)} 不一致`,
      };
    }
    return {
      compatible: true,
      legacy: false,
      code: savedRuntime && currentRuntime && savedRuntime !== currentRuntime ? 'runtime-different' : 'ok',
      message: savedRuntime && currentRuntime && savedRuntime !== currentRuntime
        ? `存档来自 runtime ${savedRuntime}，当前为 ${currentRuntime}；协议兼容`
        : '',
    };
  }

  function create(storage, options = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('save storage adapter requires getItem/setItem');
    }
    const prefix = String(options.prefix || PREFIX);
    const legacyKey = String(options.legacyKey || LEGACY_SINGLE_KEY);
    const currentVersion = {
      runtimeVersion: String(options.runtimeVersion || ROOT.JYRuntimeVersion?.runtimeVersion || ''),
      protocolVersion: Number(options.protocolVersion ?? ROOT.JYRuntimeVersion?.protocolVersion ?? 0),
      upstream: String(options.upstream || ROOT.JYUpstream?.UPSTREAM_REV || ''),
    };

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
        result.compatibility = compatibility(result.payload, currentVersion);
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
        runtimeVersion: input?.runtimeVersion || currentVersion.runtimeVersion,
        protocolVersion: input?.protocolVersion ?? currentVersion.protocolVersion,
        upstream: input?.upstream || currentVersion.upstream,
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
          compatible: result.ok ? result.compatibility?.compatible !== false : false,
          compatibility: result.ok ? { ...(result.compatibility || {}) } : null,
          runtimeVersion: result.ok ? result.payload.runtimeVersion : '',
          protocolVersion: result.ok ? result.payload.protocolVersion : 0,
          upstream: result.ok ? result.payload.upstream : '',
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
    compatibility,
    create,
  });
})();
