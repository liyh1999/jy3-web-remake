(() => {
  const UPSTREAM_REV = 'c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8';
  const RAW_BASE = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3/script`;

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
    '01_data/o_note.lua',
    '01_data/o_love.lua'
  ];

  const CORE_PROGRAMS = ['04_program/p_order.lua'];

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

      // Never treat the second dot of Lua's concat operator (`..foo`) as field access.
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
          if ((prev === '{' || prev === ',') && source[k] === '=') {
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
    const response = await fetch(`${RAW_BASE}/${path}`);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  }

  function registerDataSource(source, name) {
    const normalized = normalizeLuaSource(source);
    const wrapper = `return __jy_register_data_source(${luaLongString(normalized)}, ${JSON.stringify('@upstream/' + name)})`;
    return fengari.load(wrapper, '@web/register-data')();
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
      onProgress?.(`加载原程序 ${loaded + 1}/${paths.length}: ${path.split('/').pop()}`);
      await loadProgram(path);
      loaded += 1;
    }
    return loaded;
  }

  async function bootstrapPrograms(onProgress) {
    return loadPrograms(CORE_PROGRAMS, onProgress);
  }

  async function bootstrapData(onProgress) {
    let loaded = 0;
    for (const path of CORE_DATA) {
      onProgress?.(`加载原数据 ${loaded + 1}/${CORE_DATA.length}: ${path.split('/').pop()}`);
      const source = await fetchText(path);
      registerDataSource(source, path);
      loaded += 1;
    }
    fengari.load('return __jy_reset_runtime()', '@web/reset-runtime')();
    const loadedPrograms = await bootstrapPrograms(onProgress);
    return { loadedModules: loaded, loadedPrograms };
  }

  window.JYUpstream = {
    UPSTREAM_REV,
    RAW_BASE,
    CORE_DATA,
    CORE_PROGRAMS,
    normalizeLuaSource,
    bootstrapData,
    bootstrapPrograms,
    loadProgram,
    loadPrograms,
    fetchText
  };
})();
