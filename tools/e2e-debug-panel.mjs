import { launchBrowserHarness } from './browser-e2e-core.mjs';

const browser = await launchBrowserHarness({
  port: Number(process.env.JY3_DEBUG_E2E_PORT || 8093),
  debugPort: Number(process.env.JY3_DEBUG_E2E_DEBUG_PORT || 9229),
  dist: process.env.JY3_DEBUG_E2E_DIST === '1',
});

const { cdp, evaluate, waitFor, errors, baseUrl, cleanup } = browser;

try {
  await waitFor(
    "document.querySelector('#startBtn') && !document.querySelector('#startBtn').disabled",
    { timeoutMs: 30000, label: 'default runtime bootstrap' }
  );
  const hiddenByDefault = await evaluate(
    "Boolean(document.querySelector('#debugPanel')?.classList.contains('hidden')) && window.JYDiagnostics?.enabled === false"
  );
  if (!hiddenByDefault) throw new Error('developer diagnostics UI is not disabled by default');

  await cdp.send('Page.navigate', { url: baseUrl + '/index.html?debug=1' });
  await waitFor(
    "document.readyState === 'complete' && window.JYDiagnostics?.enabled === true && !document.querySelector('#debugPanel')?.classList.contains('hidden')",
    { timeoutMs: 30000, label: 'debug mode panel' }
  );
  await waitFor(
    "document.querySelector('#startBtn') && !document.querySelector('#startBtn').disabled",
    { timeoutMs: 30000, label: 'debug runtime bootstrap' }
  );

  const statePrepared = await evaluate("(() => { const enter = window.fengari.load(\"return __jy_enter_map(0x10060003)\", '@debug-e2e/map'); if (!enter()) return false; const runEvent = window.fengari.load(\"return __jy_run('牛家村-黄蓉')\", '@debug-e2e/event'); if (!runEvent()) return false; const exportState = window.fengari.load(\"return __jy_export_state()\", '@debug-e2e/save'); exportState(); window.JYDiagnostics.recordError(new Error('diagnostic stack probe'), 'debug-e2e'); window.JYResources.addImage(0xdeadbeef, 0xdeadbeef); window.JYDiagnostics.refresh(); return true; })()");
  if (!statePrepared) throw new Error('failed to prepare diagnostics state');

  const report = await evaluate('window.JYDiagnostics.snapshot()');
  if (!report?.lua?.ready) throw new Error('diagnostics report did not read Lua runtime state');
  if (Number(report.lua.mapId) !== 0x10060003) throw new Error('diagnostics current map mismatch');
  if (report.lua.eventName !== '牛家村-黄蓉') throw new Error('diagnostics current event mismatch: ' + report.lua.eventName);
  if (Number(report.lua.saveObjects) < 3) throw new Error('diagnostics save object count missing');
  if (Number(report.lua.runtimeObjects) <= 0) throw new Error('diagnostics runtime object count missing');
  if (typeof report.lua.missingCalls !== 'string' || typeof report.lua.missingObjects !== 'string') {
    throw new Error('diagnostics missing call/object fields absent');
  }
  if (!Array.isArray(report.errors) || !report.errors.some(row => String(row.detail).includes('diagnostic stack probe'))) {
    throw new Error('diagnostics error/stack capture missing');
  }
  if (!Array.isArray(report.resourceFailures) || !report.resourceFailures.some(row => Number(row.id) === 0xdeadbeef || Number(row.sourceId) === 0xdeadbeef)) {
    throw new Error('diagnostics resource failure list missing');
  }

  const rendered = await evaluate("(() => ({ event: document.querySelector('#debugEvent')?.textContent || '', map: document.querySelector('#debugMap')?.textContent || '', save: Number(document.querySelector('#debugSaveObjects')?.textContent || 0), resources: document.querySelector('#debugResources')?.textContent || '', errors: document.querySelector('#debugErrors')?.textContent || '', copy: typeof window.JYDiagnostics?.copyReport === 'function' }))()");
  if (rendered.event !== '牛家村-黄蓉') throw new Error('debug panel event rendering mismatch');
  if (rendered.map !== '0x10060003') throw new Error('debug panel map rendering mismatch');
  if (rendered.save < 3) throw new Error('debug panel save object rendering mismatch');
  if (!rendered.resources.includes('deadbeef') && !rendered.resources.includes('3735928559')) {
    throw new Error('debug panel did not render resource failure');
  }
  if (!rendered.errors.includes('diagnostic stack probe')) throw new Error('debug panel did not render captured stack');
  if (!rendered.copy) throw new Error('copy diagnostics report action missing');

  const unexpected = errors.filter(row => !row.includes('diagnostic stack probe'));
  if (unexpected.length) throw new Error('unexpected browser diagnostics errors:\n' + unexpected.join('\n'));

  console.log('developer diagnostics browser E2E PASS');
  console.log('  default hidden -> ?debug=1 visible');
  console.log('  Lua map/missing/object/save state + error stack + resource failure + copy report surface');
} finally {
  await cleanup();
}
