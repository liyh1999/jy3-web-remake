import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const vendorRoot = path.join(root, 'vendor');
const fengariDir = path.join(vendorRoot, 'fengari');

// Reuse the exact pinned revision and runtime manifest used by the browser.
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, 'src/upstream.js'), 'utf8'), {
  filename: 'src/upstream.js'
});
const { UPSTREAM_REV, RAW_BASE, CACHED_DATA, CACHED_PROGRAMS } = globalThis.window.JYUpstream;
const upstreamJY3Base = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3`;
const upstreamApiBase = 'https://api.github.com/repos/ssz66666/jy3-mirror';
const runtimeScripts = [...new Set([...CACHED_DATA, ...CACHED_PROGRAMS])];
const scanSources = JSON.parse(fs.readFileSync(path.join(root, 'tools/resource-scan-sources.json'), 'utf8'));
const files = [...new Set([...runtimeScripts, ...scanSources])];
const assets = JSON.parse(fs.readFileSync(path.join(root, 'tools/offline-assets.json'), 'utf8'));
const resumeCache = process.env.JY3_CACHE_RESUME === '1';

// Use the official pinned release asset, not a floating CDN URL.
const FENGARI_VERSION = '0.1.4';
const FENGARI_URL = `https://github.com/fengari-lua/fengari-web/releases/download/v${FENGARI_VERSION}/fengari-web.js`;
const FONT_VERSION = '5.3.0';
const FONT_BASE = `https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@${FONT_VERSION}`;
const FONT_FILE = 'noto-serif-sc-chinese-simplified-400-normal.woff2';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function downloadCandidates(url) {
  const candidates = [url];
  const target = new URL(url);
  if (url === FENGARI_URL) {
    candidates.push(
      `https://cdn.jsdelivr.net/npm/fengari-web@${FENGARI_VERSION}/dist/fengari-web.js`,
      `https://unpkg.com/fengari-web@${FENGARI_VERSION}/dist/fengari-web.js`
    );
  }
  if (target.hostname === 'raw.githubusercontent.com') {
    const parts = target.pathname.split('/').filter(Boolean);
    if (parts.length >= 4) {
      const [owner, repo, revision, ...rest] = parts;
      candidates.unshift(`https://github.com/${owner}/${repo}/raw/${revision}/${rest.join('/')}`);
    }
  }
  return candidates;
}

async function fetchWithRetry(url, attempts = 6) {
  let lastStatus = 0;
  let lastError = null;
  const apiToken = process.env.GITHUB_TOKEN || '';
  const candidates = downloadCandidates(url);
  const attemptsPerCandidate = Math.max(1, Math.ceil(attempts / candidates.length));
  for (const candidate of candidates) {
    for (let i = 0; i < attemptsPerCandidate; i += 1) {
      const target = new URL(candidate);
      const headers = {
        'User-Agent': 'jy3-web-remake-offline-cache',
        'Accept': 'application/vnd.github+json',
      };
      if (apiToken && target.hostname === 'api.github.com') {
        headers.Authorization = `Bearer ${apiToken}`;
      }
      let response;
      try {
        response = await fetch(candidate, { headers, signal: AbortSignal.timeout(30000) });
      } catch (error) {
        lastError = error;
        if (i + 1 < attemptsPerCandidate) {
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
          continue;
        }
        break;
      }
      if (response.ok) {
        try {
          return Buffer.from(await response.arrayBuffer());
        } catch (error) {
          lastError = error;
          if (i + 1 < attemptsPerCandidate) {
            await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
            continue;
          }
          break;
        }
      }
      lastStatus = response.status;
      const retryable = response.status === 403 || response.status === 429 || response.status >= 500;
      if (!retryable) break;
      const retryAfter = Number(response.headers.get('retry-after')) || 0;
      const delay = retryAfter > 0 ? retryAfter * 1000 : 500 * (i + 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  if (lastError && lastStatus === 0) {
    throw new Error(`Network failure after ${attempts} attempts: ${url}`, { cause: lastError });
  }
  throw new Error(`HTTP ${lastStatus}: ${url}`);
}

async function fetchJson(url) {
  return JSON.parse((await fetchWithRetry(url)).toString('utf8'));
}

async function cache(url, destination, relativePath) {
  const body = resumeCache && fs.existsSync(destination)
    ? await fsp.readFile(destination)
    : await fetchWithRetry(url);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, body);
  return {
    path: relativePath.replaceAll('\\', '/'),
    bytes: body.length,
    sha256: sha256(body),
    source: url,
  };
}

async function cacheBatch(items, label, worker) {
  const configured = Number(process.env.JY3_CACHE_CONCURRENCY || 8);
  const concurrency = Math.max(1, Math.min(16, Number.isFinite(configured) ? Math.floor(configured) : 8));
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      const result = await worker(item, index);
      results[index] = result.entry;
      console.log(`[${result.kind || label} ${index + 1}/${items.length}] ${item} (${result.entry.bytes} bytes)`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

async function cacheUpstreamIndex() {
  const commit = await fetchJson(`${upstreamApiBase}/git/commits/${UPSTREAM_REV}`);
  const treeSha = commit?.tree?.sha;
  if (!treeSha) throw new Error('unable to resolve pinned upstream tree SHA');

  const tree = await fetchJson(`${upstreamApiBase}/git/trees/${treeSha}?recursive=1`);
  if (tree.truncated) {
    throw new Error('GitHub truncated the pinned upstream tree; resource integrity scan would be incomplete');
  }

  const entries = (tree.tree || [])
    .filter(entry => entry.type === 'blob' && entry.path.startsWith('JY3/'))
    .map(entry => ({
      path: entry.path.slice(4),
      size: Number(entry.size) || 0,
      sha: entry.sha,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const index = {
    schemaVersion: 1,
    upstreamRevision: UPSTREAM_REV,
    treeSha,
    fileCount: entries.length,
    files: entries,
  };
  await fsp.writeFile(
    path.join(vendorRoot, 'upstream-file-index.json'),
    `${JSON.stringify(index, null, 2)}\n`,
    'utf8'
  );
  console.log(`upstream file index: ${entries.length} files`);
  return index;
}

// A normal refresh removes the previous generated set. Resume mode keeps files
// that completed successfully and reconstructs the manifest after interruptions.
if (!resumeCache) {
  await fsp.rm(path.join(vendorRoot, 'upstream'), { recursive: true, force: true });
  await fsp.rm(fengariDir, { recursive: true, force: true });
  await fsp.rm(path.join(vendorRoot, 'fonts'), { recursive: true, force: true });
  await fsp.rm(path.join(vendorRoot, 'upstream-file-index.json'), { force: true });
}
await fsp.mkdir(vendorRoot, { recursive: true });

const upstreamIndex = await cacheUpstreamIndex();
const entries = await cacheBatch(files, 'script', async remotePath => {
  const relativePath = path.join('upstream', 'JY3', 'script', ...remotePath.split('/'));
  const destination = path.join(vendorRoot, relativePath);
  const entry = await cache(`${RAW_BASE}/${remotePath}`, destination, relativePath);
  const scanOnly = !runtimeScripts.includes(remotePath);
  return { entry, kind: scanOnly ? 'scan' : 'script' };
});

const assetEntries = await cacheBatch(assets, 'asset', async remotePath => {
  const relativePath = path.join('upstream', 'JY3', ...remotePath.split('/'));
  const destination = path.join(vendorRoot, relativePath);
  const entry = await cache(`${upstreamJY3Base}/${remotePath}`, destination, relativePath);
  return { entry, kind: 'asset' };
});
entries.push(...assetEntries);

const fengariRelative = path.join('fengari', 'fengari-web.js');
const fengariEntry = await cache(
  FENGARI_URL,
  path.join(fengariDir, 'fengari-web.js'),
  fengariRelative
);
entries.push(fengariEntry);
console.log(`fengari-web ${FENGARI_VERSION} (${fengariEntry.bytes} bytes)`);

const fontEntry = await cache(
  `${FONT_BASE}/files/${FONT_FILE}`,
  path.join(vendorRoot, 'fonts', FONT_FILE),
  path.join('fonts', FONT_FILE)
);
const fontLicenseEntry = await cache(
  `${FONT_BASE}/LICENSE`,
  path.join(vendorRoot, 'fonts', 'OFL.txt'),
  path.join('fonts', 'OFL.txt')
);
entries.push(fontEntry, fontLicenseEntry);
console.log(`Noto Serif SC ${FONT_VERSION} (${fontEntry.bytes} bytes)`);

const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  upstreamRevision: UPSTREAM_REV,
  upstreamTreeSha: upstreamIndex.treeSha,
  upstreamFileCount: upstreamIndex.fileCount,
  fengariVersion: FENGARI_VERSION,
  fontVersion: FONT_VERSION,
  runtimeScripts,
  scanSources,
  scripts: files,
  assets,
  entries,
  totalBytes,
};
await fsp.writeFile(
  path.join(vendorRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);
console.log(`offline cache ready: ${entries.length} files, ${totalBytes} bytes`);
