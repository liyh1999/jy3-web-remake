import { launchBrowserHarness } from './browser-e2e-core.mjs';

const browser = await launchBrowserHarness({
  port: Number(process.env.JY3_DISPLAY_E2E_PORT || 8094),
  debugPort: Number(process.env.JY3_DISPLAY_E2E_DEBUG_PORT || 9230),
  dist: process.env.JY3_DISPLAY_E2E_DIST === '1',
});

const { cdp, evaluate, waitFor, cleanup, sleep } = browser;
const LOGICAL_WIDTH = 853;
const LOGICAL_HEIGHT = 480;
const MARGIN = 16;

function expectedScale(width, height) {
  return Math.min((width - MARGIN) / LOGICAL_WIDTH, (height - MARGIN) / LOGICAL_HEIGHT);
}

try {
  await waitFor(
    "window.JYDisplay && document.querySelector('#game') && document.querySelector('#gcoreCanvas')",
    { timeoutMs: 30000, label: 'logical display runtime' }
  );
  await evaluate("window.JYDisplay.setPreference('auto')");

  for (const [width, height] of [[1280,720],[1024,768],[800,600]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(150);

    const state = await evaluate("(() => { const game=document.querySelector('#game'); const shell=document.querySelector('#shell'); const scene=document.querySelector('#scene'); const canvas=document.querySelector('#gcoreCanvas'); const rect=node=>{ const r=node.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; }; return { viewport:{width:innerWidth,height:innerHeight}, scale:window.JYDisplay.scale(), gameOffset:{width:game.offsetWidth,height:game.offsetHeight}, game:rect(game), shell:rect(shell), scene:rect(scene), canvas:rect(canvas), canvasOffset:{width:canvas.offsetWidth,height:canvas.offsetHeight} }; })()");
    const expected = expectedScale(width, height);
    if (state.gameOffset.width !== LOGICAL_WIDTH || state.gameOffset.height !== LOGICAL_HEIGHT) throw new Error('logical frame changed at ' + width + 'x' + height + ': ' + JSON.stringify(state.gameOffset));
    if (Math.abs(state.scale - expected) > 0.01) throw new Error('display scale mismatch at ' + width + 'x' + height + ': ' + state.scale + ' != ' + expected);
    if (Math.abs(state.game.width / state.game.height - LOGICAL_WIDTH / LOGICAL_HEIGHT) > 0.002) throw new Error('game aspect ratio drifted at ' + width + 'x' + height);
    if (Math.abs(state.shell.width - state.game.width) > 1 || Math.abs(state.shell.height - state.game.height) > 1) throw new Error('shell/game scaled bounds diverged at ' + width + 'x' + height);
    if (state.game.left < -1 || state.game.top < -1 || state.game.right > width + 1 || state.game.bottom > height + 1) throw new Error('scaled game overflowed viewport at ' + width + 'x' + height + ': ' + JSON.stringify(state.game));
    if (Math.abs(state.canvas.width - state.canvasOffset.width * state.scale) > 2 || Math.abs(state.canvas.height - state.canvasOffset.height * state.scale) > 2) throw new Error('gcore canvas was scaled twice at ' + width + 'x' + height);
    if (state.canvas.width > state.scene.width + 2 || state.canvas.height > state.scene.height + 2) throw new Error('gcore canvas escaped scene bounds at ' + width + 'x' + height);
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await evaluate("window.JYDisplay.setPreference('1')");
  await sleep(100);
  let manual = await evaluate("({ scale: window.JYDisplay.scale(), pref: window.JYDisplay.preference(), stored: localStorage.getItem(window.JYDisplay.STORAGE_KEY), label: document.querySelector('#displaySettingsBtn')?.textContent || '', selected: document.querySelector('#displayScaleSelect')?.value || '' })");
  if (Math.abs(manual.scale - 1) > 0.01 || manual.pref !== '1' || manual.stored !== '1') {
    throw new Error('100% display preference was not applied/persisted: ' + JSON.stringify(manual));
  }
  if (!manual.label.includes('100%') || manual.selected !== '1') throw new Error('display settings UI did not sync to 100%');

  await cdp.send('Page.reload');
  await waitFor("window.JYDisplay && document.querySelector('#displayScaleSelect')?.value === '1'", { timeoutMs: 30000, label: 'display preference reload' });
  manual = await evaluate("({ scale: window.JYDisplay.scale(), pref: window.JYDisplay.preference() })");
  if (Math.abs(manual.scale - 1) > 0.01 || manual.pref !== '1') throw new Error('display preference did not survive reload');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
  await evaluate("window.JYDisplay.setPreference('1.5')");
  await sleep(100);
  const capped = await evaluate("({ scale: window.JYDisplay.scale(), fit: window.JYDisplay.fitScale(), pref: window.JYDisplay.preference() })");
  if (capped.pref !== '1.5' || Math.abs(capped.scale - capped.fit) > 0.01 || capped.scale >= 1.5) {
    throw new Error('oversized manual scale was not capped to viewport: ' + JSON.stringify(capped));
  }
  await evaluate("window.JYDisplay.setPreference('auto')");

  console.log('853x480 desktop scaling E2E PASS');
  console.log('  1280x720 / 1024x768 / 800x600 preserve one uniform transform');
  console.log('  auto/manual scale preferences persist and oversized zoom is viewport-capped');
  console.log('  gcore canvas remains in logical coordinates and is not double-scaled');
} finally {
  await cleanup();
}
