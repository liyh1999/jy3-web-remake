(() => {
  const RAW_BASE = 'https://raw.githubusercontent.com/ssz66666/jy3-mirror/master/JY3/script';

  const CORE_DATA = [
    '01_data/o_body.lua',
    '01_data/o_hotkey.lua',
    '01_data/o_files.lua',
    '01_data/o_misc.lua',
    '01_data/o_storehouse.lua',
    '01_data/o_role.lua',
    '01_data/o_achieve.lua',
    '01_data/o_item.lua'
  ];

  const CORE_PROGRAMS = [
    '04_program/p_order.lua'
  ];

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
    const wrapper = `return __jy_register_data_source(${luaLongString(source)}, ${JSON.stringify('@upstream/' + name)})`;
    return fengari.load(wrapper, '@web/register-data')();
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
    return { loadedModules: loaded };
  }

  async function loadProgram(path) {
    const source = await fetchText(path);
    fengari.load(source, `@upstream/${path}`)();
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

  window.JYUpstream = {
    RAW_BASE,
    CORE_DATA,
    CORE_PROGRAMS,
    bootstrapData,
    bootstrapPrograms,
    loadProgram,
    loadPrograms,
    fetchText
  };
})();
