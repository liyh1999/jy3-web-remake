(() => {
  const STORAGE_KEY = 'jy3-web-remake:debug';
  const params = new URLSearchParams(window.location.search);
  let persisted = false;
  try { persisted = window.localStorage?.getItem?.(STORAGE_KEY) === '1'; } catch (_) {}
  const enabled = params.get('debug') === '1' || persisted;
  const errors = [];
  const MAX_ERRORS = 32;

  function stringifyError(value) {
    if (value instanceof Error) return value.stack || value.message || String(value);
    if (value && typeof value === 'object') {
      try { return JSON.stringify(value); } catch (_) {}
    }
    return String(value ?? '');
  }

  function recordError(error, context = 'runtime') {
    const row = {
      time: new Date().toISOString(),
      context: String(context || 'runtime'),
      detail: stringifyError(error),
    };
    errors.push(row);
    while (errors.length > MAX_ERRORS) errors.shift();
    if (enabled) queueRefresh();
    return row;
  }

  function luaSnapshot() {
    if (!window.fengari?.load) return { ready: false, error: 'Fengari not ready' };
    try {
      const probe = window.fengari.load(`
        local event_name, event_status, last_event, wait_event = "", "none", "", ""
        if type(__jy_debug_event_state) == "function" then
          event_name, event_status, last_event, wait_event = __jy_debug_event_state()
        end
        local map_id = type(__jy_current_map) == "function" and __jy_current_map() or 0
        local missing_calls = type(__jy_missing_calls) == "function" and __jy_missing_calls() or ""
        local missing_objects = type(__jy_missing_objects) == "function" and __jy_missing_objects() or ""
        local save_objects = type(__jy_tracked_save_objects) == "function" and __jy_tracked_save_objects() or 0
        local runtime_objects = type(__jy_runtime_object_count) == "function" and __jy_runtime_object_count() or 0
        local trace_status, trace = "none", ""
        if type(__jy_debug_runtime_trace) == "function" then
          trace_status, trace = __jy_debug_runtime_trace()
        end
        return event_name, event_status, last_event, wait_event, map_id,
               missing_calls, missing_objects, save_objects, runtime_objects,
               trace_status, trace
      `, '@debug/runtime-snapshot');
      const result = probe();
      const values = Array.isArray(result) ? result : [result];
      return {
        ready: true,
        eventName: String(values[0] || ''),
        eventStatus: String(values[1] || 'none'),
        lastEvent: String(values[2] || ''),
        waitEvent: String(values[3] || ''),
        mapId: Number(values[4] || 0) >>> 0,
        missingCalls: String(values[5] || ''),
        missingObjects: String(values[6] || ''),
        saveObjects: Number(values[7] || 0),
        runtimeObjects: Number(values[8] || 0),
        traceStatus: String(values[9] || 'none'),
        trace: String(values[10] || ''),
      };
    } catch (error) {
      return { ready: false, error: stringifyError(error) };
    }
  }

  function resourceFailures() {
    const image = window.JYResources?.failures?.() || [];
    const audio = window.JYAudio?.failures?.() || [];
    return [...image, ...audio].slice(-64);
  }

  function snapshot() {
    return {
      generatedAt: new Date().toISOString(),
      enabled,
      location: window.location.href,
      userAgent: navigator.userAgent,
      upstreamRevision: window.JYUpstream?.UPSTREAM_REV || window.JYResources?.UPSTREAM_REV || '',
      offline: window.JY_CONFIG?.offline === true,
      lua: luaSnapshot(),
      resourceFailures: resourceFailures(),
      errors: errors.slice(),
    };
  }

  function formatHex(value) {
    const number = Number(value) >>> 0;
    return number ? '0x' + number.toString(16).padStart(8, '0') : '0x00000000';
  }

  function text(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value ?? '');
  }

  let refreshQueued = false;
  function queueRefresh() {
    if (refreshQueued || !enabled) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function refresh() {
    if (!enabled) return null;
    const data = snapshot();
    const lua = data.lua || {};
    text('debugEvent', lua.eventName || '—');
    text('debugEventState', lua.eventStatus || 'none');
    text('debugLastEvent', lua.lastEvent || '—');
    text('debugWaitEvent', lua.waitEvent || '—');
    text('debugMap', lua.ready ? formatHex(lua.mapId) : 'runtime 未就绪');
    text('debugSaveObjects', lua.saveObjects ?? 0);
    text('debugRuntimeObjects', lua.runtimeObjects ?? 0);
    text('debugMissingCalls', lua.missingCalls || 'none');
    text('debugMissingObjects', lua.missingObjects || 'none');
    text('debugTrace', lua.trace || (lua.error ? lua.error : 'none'));
    text('debugErrors', data.errors.length
      ? data.errors.map(row => `[${row.time}] ${row.context}\n${row.detail}`).join('\n\n')
      : 'none');
    text('debugResources', data.resourceFailures.length
      ? data.resourceFailures.map(row => JSON.stringify(row)).join('\n')
      : 'none');
    text('debugUpstream', data.upstreamRevision || 'unknown');
    text('debugMode', data.offline ? 'offline dist' : 'source/dev');
    return data;
  }

  async function copyReport() {
    const report = JSON.stringify(snapshot(), null, 2);
    let copied = false;
    try {
      await navigator.clipboard?.writeText?.(report);
      copied = true;
    } catch (_) {}
    if (!copied) {
      const area = document.createElement('textarea');
      area.value = report;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { copied = document.execCommand('copy'); } catch (_) {}
      area.remove();
    }
    text('debugCopyStatus', copied ? '诊断报告已复制' : '复制失败，请从面板手动选择');
    return copied;
  }

  window.JYDiagnostics = {
    enabled,
    recordError,
    snapshot,
    refresh,
    copyReport,
    clearErrors() {
      errors.length = 0;
      refresh();
    },
  };

  if (!enabled) return;

  const panel = document.getElementById('debugPanel');
  panel?.classList.remove('hidden');

  const originalConsoleError = console.error?.bind(console);
  if (originalConsoleError) {
    console.error = (...args) => {
      recordError(args.map(stringifyError).join(' '), 'console.error');
      originalConsoleError(...args);
    };
  }

  window.addEventListener('error', event => {
    recordError(event.error || event.message || 'window error', 'window.error');
  });
  window.addEventListener('unhandledrejection', event => {
    recordError(event.reason || 'unhandled rejection', 'unhandledrejection');
  });

  document.getElementById('debugRefresh')?.addEventListener('click', () => refresh());
  document.getElementById('debugCopy')?.addEventListener('click', () => copyReport());
  document.getElementById('debugClear')?.addEventListener('click', () => window.JYDiagnostics.clearErrors());

  refresh();
  window.setInterval(refresh, 1000);
})();
