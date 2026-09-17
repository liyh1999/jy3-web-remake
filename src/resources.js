(() => {
  const UPSTREAM_REV = 'c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8';
  const ASSET_BASE = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3`;

  // Mirrors JY3/dir.lua. Runtime resource ids carry an additional high-nibble
  // type tag (e.g. 0x56050001); the path id used by dir.lua is 0x06050001.
  const DIRS = new Map([
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
  ]);

  const BASES = [...DIRS.keys()].sort((a, b) => b - a);

  function u32(value) {
    return Number(value) >>> 0;
  }

  function canonicalPathId(resourceId) {
    return u32(resourceId) & 0x0fffffff;
  }

  function findDirectoryBase(pathId) {
    const family = pathId & 0xff000000;
    for (const base of BASES) {
      if ((base & 0xff000000) !== family) continue;
      if (pathId >= base && pathId - base < 0x10000) return base;
    }
    return null;
  }

  function extensionFor(pathId) {
    const family = pathId & 0xff000000;
    if (family === 0x06000000 || family === 0x08000000) return '.png';
    if (family === 0x09000000) return '.mp3';
    return null;
  }

  function resolve(resourceId) {
    const id = u32(resourceId);
    const pathId = canonicalPathId(id);
    const base = findDirectoryBase(pathId);
    if (base === null) return null;

    const directory = DIRS.get(base);
    const index = pathId - base;
    const extension = extensionFor(pathId);
    const stem = index.toString(16).padStart(4, '0').toLowerCase();
    const relativePath = extension ? `${directory}/${stem}${extension}` : directory;

    return {
      id,
      pathId,
      base,
      directory,
      index,
      stem,
      extension,
      relativePath,
      url: `${ASSET_BASE}/${relativePath}`,
    };
  }

  function getPath(resourceId) {
    const hit = resolve(resourceId);
    return hit ? hit.directory : null;
  }

  function url(resourceId) {
    const hit = resolve(resourceId);
    return hit?.extension ? hit.url : null;
  }

  window.JYResources = {
    UPSTREAM_REV,
    ASSET_BASE,
    DIRS,
    canonicalPathId,
    resolve,
    getPath,
    url,
  };
})();
