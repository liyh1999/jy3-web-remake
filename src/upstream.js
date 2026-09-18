(() => {
  const UPSTREAM_REV = 'c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8';
  const RAW_BASE = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3/script`;
  const LOCAL_BASE = window.JY_CONFIG?.upstreamScriptBase || './vendor/upstream/JY3/script';
  const OFFLINE = window.JY_CONFIG?.offline === true;

  const CORE_DATA = [
    '01_data/o_body.lua',
    '01_data/o_newbody.lua',
    '01_data/o_hotkey.lua',
    '01_data/o_files.lua',
    '01_data/o_misc.lua',
    '01_data/o_storehouse.lua',
    '01_data/o_role.lua',
    '01_data/o_skill.lua',
    '01_data/o_achieve.lua',
    '01_data/o_item.lua',
    '01_data/o_equip.lua',
    '01_data/o_note.lua',
    '01_data/o_love.lua',
    '01_data/o_teammate.lua',
    '01_data/o_shop.lua',
    '01_data/o_headevent.lua',
    '01_data/o_citymap_system_map.lua',
    '01_data/o_citymap_system_city.lua'
  ];

  // Battle-only data cached for C2, but not registered during normal boot.
  const ON_DEMAND_DATA = [
    '01_data/o_battle.lua',
    '01_data/o_notebook.lua'
  ];
  const CACHED_DATA = [...new Set([...CORE_DATA, ...ON_DEMAND_DATA])];

  const CORE_PROGRAMS = [
    '04_program/p_order.lua',
    '04_program/p_init.lua',
    '04_program/p_citymap_system.lua',
    '04_program/p_newgame.lua',
    '04_program/p_niujiacun.lua'
  ];

  // Cached and compile-gated, but deliberately not executed during normal boot.
  // C2 will load these on demand once the battle runtime surface is ready.
  const ON_DEMAND_PROGRAMS = [
    '04_program/p_battle.lua'
  ];
  const CACHED_PROGRAMS = [...new Set([...CORE_PROGRAMS, ...ON_DEMAND_PROGRAMS])];

  const LOGGING_UI_MODULES = [
    { module: 'c_button', path: '03_ui_component/c_button.lua' },
    { module: 'c_logging', path: '03_ui_component/c_logging.lua' },
    { module: 'c_movie', path: '03_ui_component/c_movie.lua' },
  ];
  const LOGGING_UI_VIEWS = [
    '02_ui_view/v_button.lua',
    '02_ui_view/v_logging.lua',
    '02_ui_view/v_movie.lua',
  ];

  const DIG_UI_MODULES = [
    { module: 'c_button', path: '03_ui_component/c_button.lua' },
    { module: 'c_dig', path: '03_ui_component/c_dig.lua' },
  ];
  const DIG_UI_VIEWS = [
    '02_ui_view/v_empty.lua',
    '02_ui_view/v_button.lua',
    '02_ui_view/v_dig.lua',
  ];

  const FISHING_UI_MODULES = [
    { module: 'c_button', path: '03_ui_component/c_button.lua' },
    { module: 'c_fishing', path: '03_ui_component/c_fishing.lua' },
  ];
  const FISHING_UI_VIEWS = [
    '02_ui_view/v_empty.lua',
    '02_ui_view/v_button.lua',
    '02_ui_view/v_fishing.lua',
  ];

  const HUNTING_UI_MODULES = [
    { module: 'c_button', path: '03_ui_component/c_button.lua' },
    { module: 'c_hunting', path: '03_ui_component/c_hunting.lua' },
  ];
  const HUNTING_UI_VIEWS = [
    '02_ui_view/v_empty.lua',
    '02_ui_view/v_button.lua',
    '02_ui_view/v_hunting.lua',
  ];

  const IDENT_START = /[A-Za-z_\p{L}]/u;
  const IDENT_PART = /[A-Za-z0-9_\p{L}\p{N}]/u;
  const NON_ASCII = /[^\x00-\x7f]/;

  function encodedIdentifier(name) {
    const hex = [...name].map(ch => ch.codePointAt(0).toString(16)).join('_');
    return `__jy_u_${hex}`;
  }

  function longBracketAt(source, index) {
    const match = source.slice(index).match(/^\[(=*)\[/);
    return match ? { open: match[0], close: `]${match[1]}]` } : null;
  }

  function normalizeLuaSource(source) {
    let out = '';
    let i = 0;
    let tableDepth = 0;

    while (i < source.length) {
      const ch = source[i];
      const next = source[i + 1];

      if (ch === '-' && next === '-') {
        const lb = longBracketAt(source, i + 2);
        if (lb) {
          const start = i;
          const bodyStart = i + 2 + lb.open.length;
          const end = source.indexOf(lb.close, bodyStart);
          if (end < 0) return out + source.slice(start);
          const stop = end + lb.close.length;
          out += source.slice(start, stop);
          i = stop;
          continue;
        }
        const end = source.indexOf('\n', i + 2);
        if (end < 0) return out + source.slice(i);
        out += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }

      if (ch === '"' || ch === "'") {
        const quote = ch;
        const start = i++;
        while (i < source.length) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === quote) { i += 1; break; }
          i += 1;
        }
        out += source.slice(start, i);
        continue;
      }

      if (ch === '[') {
        const lb = longBracketAt(source, i);
        if (lb) {
          const start = i;
          const bodyStart = i + lb.open.length;
          const end = source.indexOf(lb.close, bodyStart);
          if (end < 0) return out + source.slice(start);
          const stop = end + lb.close.length;
          out += source.slice(start, stop);
          i = stop;
          continue;
        }
      }

      if (ch === '.' && source[i - 1] !== '.' && IDENT_START.test(source[i + 1] || '')) {
        let j = i + 1;
        while (j < source.length && IDENT_PART.test(source[j])) j += 1;
        const name = source.slice(i + 1, j);
        if (NON_ASCII.test(name)) {
          out += `[${JSON.stringify(name)}]`;
          i = j;
          continue;
        }
      }

      if (IDENT_START.test(ch)) {
        let j = i + 1;
        while (j < source.length && IDENT_PART.test(source[j])) j += 1;
        const name = source.slice(i, j);
        if (NON_ASCII.test(name)) {
          let k = j;
          while (/\s/.test(source[k] || '')) k += 1;
          const prev = out.trimEnd().slice(-1);
          if (tableDepth > 0 && (prev === '{' || prev === ',') && source[k] === '=') {
            out += `[${JSON.stringify(name)}]`;
          } else {
            out += encodedIdentifier(name);
          }
        } else {
          out += name;
        }
        i = j;
        continue;
      }

      if (ch === '{') tableDepth += 1;
      if (ch === '}') tableDepth = Math.max(0, tableDepth - 1);
      out += ch;
      i += 1;
    }

    return out;
  }

  function luaLongString(text) {
    let level = 0;
    while (text.includes(`]${'='.repeat(level)}]`)) level += 1;
    const eq = '='.repeat(level);
    return `[${eq}[${text}]${eq}]`;
  }

  async function fetchText(path) {
    try {
      const local = await fetch(`${LOCAL_BASE}/${path}`);
      if (local.ok) return local.text();
      if (OFFLINE) {
        throw new Error(`${path}: missing from offline package (HTTP ${local.status})`);
      }
    } catch (error) {
      if (OFFLINE) throw error;
      // Development fallback below.
    }

    const response = await fetch(`${RAW_BASE}/${path}`);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  }

  function registerDataSource(source, name) {
    const normalized = normalizeLuaSource(source);
    const wrapper = `return __jy_register_data_source(${luaLongString(normalized)}, ${JSON.stringify('@upstream/' + name)})`;
    return fengari.load(wrapper, '@web/register-data')();
  }

  function registerModuleSource(moduleName, source, name = moduleName) {
    const normalized = normalizeLuaSource(source);
    const wrapper = `
package.loaded[${JSON.stringify(String(moduleName))}] = nil
package.preload[${JSON.stringify(String(moduleName))}] = function()
  local fn, err = load(${luaLongString(normalized)}, ${JSON.stringify('@upstream-module/' + String(name))})
  if not fn then error(err) end
  return fn()
end
return true
`;
    return fengari.load(wrapper, '@web/register-module')();
  }

  async function loadModule(moduleName, path) {
    const source = await fetchText(path);
    registerModuleSource(moduleName, source, path);
    return moduleName;
  }

  async function loadModules(entries, onProgress) {
    let loaded = 0;
    for (const entry of entries) {
      const moduleName = typeof entry === 'string' ? entry : entry.module;
      const path = typeof entry === 'string' ? entry : entry.path;
      onProgress?.(`加载原模块 ${moduleName}…`);
      await loadModule(moduleName, path);
      loaded += 1;
    }
    return loaded;
  }

  async function loadProgram(path) {
    const source = await fetchText(path);
    const normalized = normalizeLuaSource(source);
    fengari.load(normalized, `@upstream/${path}`)();
    return path;
  }

  async function loadPrograms(paths, onProgress) {
    let loaded = 0;
    for (const path of paths) {
      onProgress?.(`加载原程序 ${path}…`);
      await loadProgram(path);
      loaded += 1;
    }
    return loaded;
  }

  async function loadData(paths, onProgress) {
    let loaded = 0;
    for (const path of paths) {
      onProgress?.(`加载原数据 ${path}…`);
      const source = await fetchText(path);
      registerDataSource(source, path);
      loaded += 1;
    }
    return loaded;
  }

  let battleRuntimePromise = null;
  async function prepareBattleRuntime(onProgress) {
    if (!battleRuntimePromise) {
      battleRuntimePromise = (async () => {
        const loadedData = await loadData(ON_DEMAND_DATA, onProgress);
        const loadedPrograms = await loadPrograms(ON_DEMAND_PROGRAMS, onProgress);
        return { loadedData, loadedPrograms };
      })().catch((error) => {
        battleRuntimePromise = null;
        throw error;
      });
    }
    return battleRuntimePromise;
  }

  let loggingUiPromise = null;
  async function prepareLoggingUI(onProgress) {
    if (!loggingUiPromise) {
      loggingUiPromise = (async () => {
        const loadedModules = await loadModules(LOGGING_UI_MODULES, onProgress);
        const loadedViews = await loadPrograms(LOGGING_UI_VIEWS, onProgress);
        return { loadedModules, loadedViews };
      })().catch((error) => {
        loggingUiPromise = null;
        throw error;
      });
    }
    return loggingUiPromise;
  }

  let digUiPromise = null;
  async function prepareDigUI(onProgress) {
    if (!digUiPromise) {
      digUiPromise = (async () => {
        const loadedModules = await loadModules(DIG_UI_MODULES, onProgress);
        const loadedViews = await loadPrograms(DIG_UI_VIEWS, onProgress);
        return { loadedModules, loadedViews };
      })().catch((error) => {
        digUiPromise = null;
        throw error;
      });
    }
    return digUiPromise;
  }

  let fishingUiPromise = null;
  async function prepareFishingUI(onProgress) {
    if (!fishingUiPromise) {
      fishingUiPromise = (async () => {
        const loadedModules = await loadModules(FISHING_UI_MODULES, onProgress);
        const loadedViews = await loadPrograms(FISHING_UI_VIEWS, onProgress);
        return { loadedModules, loadedViews };
      })().catch((error) => {
        fishingUiPromise = null;
        throw error;
      });
    }
    return fishingUiPromise;
  }

  let huntingUiPromise = null;
  async function prepareHuntingUI(onProgress) {
    if (!huntingUiPromise) {
      huntingUiPromise = (async () => {
        const loadedModules = await loadModules(HUNTING_UI_MODULES, onProgress);
        const loadedViews = await loadPrograms(HUNTING_UI_VIEWS, onProgress);
        return { loadedModules, loadedViews };
      })().catch((error) => {
        huntingUiPromise = null;
        throw error;
      });
    }
    return huntingUiPromise;
  }

  async function bootstrapData(onProgress) {
    let loadedModules = 0;
    for (const path of CORE_DATA) {
      onProgress?.(`加载原数据 ${path}…`);
      const source = await fetchText(path);
      registerDataSource(source, path);
      loadedModules += 1;
    }
    fengari.load('return __jy_reset_runtime()', '@web/reset-after-data')();
    const loadedPrograms = await loadPrograms(CORE_PROGRAMS, onProgress);
    return { loadedModules, loadedPrograms };
  }

  window.JYUpstream = {
    UPSTREAM_REV,
    RAW_BASE,
    LOCAL_BASE,
    OFFLINE,
    CORE_DATA,
    ON_DEMAND_DATA,
    CACHED_DATA,
    CORE_PROGRAMS,
    ON_DEMAND_PROGRAMS,
    CACHED_PROGRAMS,
    LOGGING_UI_MODULES,
    LOGGING_UI_VIEWS,
    DIG_UI_MODULES,
    DIG_UI_VIEWS,
    FISHING_UI_MODULES,
    FISHING_UI_VIEWS,
    HUNTING_UI_MODULES,
    HUNTING_UI_VIEWS,
    normalizeLuaSource,
    fetchText,
    registerDataSource,
    registerModuleSource,
    loadModule,
    loadModules,
    loadProgram,
    loadPrograms,
    loadData,
    prepareBattleRuntime,
    prepareLoggingUI,
    prepareDigUI,
    prepareFishingUI,
    prepareHuntingUI,
    bootstrapData,
  };
})();
