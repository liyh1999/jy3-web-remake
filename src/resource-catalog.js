(() => {
  // Canonical Web representation of JY3/dir.lua. Runtime ids may contain an
  // extra high-nibble type tag; the lower 28 bits are the original path id.
  const DEFINITIONS = [
    [0x02000000, 'fonts'],
    [0x03000000, 'framelist'],
    [0x03010000, 'framelist/effect'],
    [0x03060000, 'framelist/enemy'],
    [0x03070000, 'framelist/friendly'],
    [0x03020000, 'framelist/hunting'],
    [0x03030000, 'framelist/body'],
    [0x04000000, 'particle'],
    [0x05000000, 'spine'],
    [0x06000000, 'image'],
    [0x06030000, 'image/03'],
    [0x06020000, 'image/1'],
    [0x060f0000, 'image/10'],
    [0x06010000, 'image/2'],
    [0x06160000, 'image/UI'],
    [0x06050000, 'image/bjmap'],
    [0x06130000, 'image/body'],
    [0x06120000, 'image/bodyframe'],
    [0x06070000, 'image/dump'],
    [0x060b0000, 'image/eventmap'],
    [0x060d0000, 'image/frame'],
    [0x06110000, 'image/frameshunting'],
    [0x06080000, 'image/head'],
    [0x060e0000, 'image/item'],
    [0x060a0000, 'image/list'],
    [0x06180000, 'image/skill'],
    [0x06190000, 'image/framelist'],
    [0x06100000, 'image/samllgame'],
    [0x060c0000, 'image/skillmap'],
    [0x06090000, 'image/standmap'],
    [0x06040000, 'image/title'],
    [0x06060000, 'image/worldmap'],
    [0x09000000, 'audio'],
    [0x09010000, 'audio/01'],
    [0x09020000, 'audio/02'],
    [0x08000000, 'newimage'],
  ];

  const DIRS = new Map(DEFINITIONS);
  const BASES = [...DIRS.keys()].sort((a, b) => b - a);
  const FAMILY_RULES = new Map([
    [0x02000000, { kind: 'font', extension: '.ttf' }],
    [0x03000000, { kind: 'framelist', extension: '.swf' }],
    [0x04000000, { kind: 'particle', extension: null, structured: true }],
    [0x05000000, { kind: 'spine', extension: null, structured: true }],
    [0x06000000, { kind: 'image', extension: '.png' }],
    [0x08000000, { kind: 'image', extension: '.png' }],
    [0x09000000, { kind: 'audio', extension: '.mp3' }],
  ]);

  function u32(value) {
    return Number(value) >>> 0;
  }

  function canonicalPathId(resourceId) {
    return u32(resourceId) & 0x0fffffff;
  }

  function familyOf(pathId) {
    return canonicalPathId(pathId) & 0xff000000;
  }

  function findDirectoryBase(pathId) {
    pathId = canonicalPathId(pathId);
    const family = familyOf(pathId);
    for (const base of BASES) {
      if ((base & 0xff000000) !== family) continue;
      if (pathId >= base && pathId - base < 0x10000) return base;
    }
    return null;
  }

  function ruleFor(resourceId) {
    return FAMILY_RULES.get(familyOf(resourceId)) || null;
  }

  function resolve(resourceId, assetBase = '') {
    const id = u32(resourceId);
    const pathId = canonicalPathId(id);
    const base = findDirectoryBase(pathId);
    if (base === null) return null;

    const directory = DIRS.get(base);
    const index = pathId - base;
    const rule = ruleFor(pathId);
    const isDirectory = pathId === base;
    const stem = index.toString(16).padStart(4, '0').toLowerCase();

    let relativePath = directory;
    let extension = null;
    let kind = 'directory';
    let resolvableFile = false;

    if (!isDirectory && rule) {
      kind = rule.kind;
      extension = rule.extension;
      if (extension) {
        relativePath = `${directory}/${stem}${extension}`;
        resolvableFile = true;
      } else {
        // Particle/Spine resources are compound directory/file sets. Keep the
        // resource family visible without inventing a filename that dir.lua
        // itself does not define.
        relativePath = null;
      }
    }

    const baseUrl = String(assetBase || '').replace(/\/$/, '');
    return {
      id,
      pathId,
      base,
      directory,
      index,
      stem,
      family: familyOf(pathId),
      kind,
      extension,
      isDirectory,
      structured: !!rule?.structured,
      resolvableFile,
      relativePath,
      url: relativePath && baseUrl ? `${baseUrl}/${relativePath}` : relativePath,
    };
  }

  window.JYResourceCatalog = Object.freeze({
    DEFINITIONS,
    DIRS,
    FAMILY_RULES,
    canonicalPathId,
    familyOf,
    findDirectoryBase,
    ruleFor,
    resolve,
  });
})();
