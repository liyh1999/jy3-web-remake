import { launchBrowserHarness } from './browser-e2e-core.mjs';

const browser = await launchBrowserHarness({
  port: Number(process.env.JY3_TITLE_E2E_PORT || 8096),
  debugPort: Number(process.env.JY3_TITLE_E2E_DEBUG_PORT || 9232),
  dist: process.env.JY3_TITLE_E2E_DIST === '1',
});

const { evaluate, waitFor, cleanup, errors } = browser;

try {
  await waitFor(
    "document.querySelector('#startBtn') && !document.querySelector('#startBtn').disabled && document.querySelector('#startBtn').textContent.includes('原版')",
    { timeoutMs: 30000, label: 'original title runtime bootstrap' }
  );
  await waitFor(
    "['#titleBackdrop','#titleOverlay','#titleLogo','#titleMark'].every(s=>{const n=document.querySelector(s);return n?.complete && n.naturalWidth>0 && n.naturalHeight>0;})",
    { timeoutMs: 30000, label: 'original title artwork loaded' }
  );

  const state = await evaluate("(() => { const q=s=>document.querySelector(s); const pos=s=>{const n=q(s); return {left:n.offsetLeft,top:n.offsetTop,width:n.offsetWidth,height:n.offsetHeight};}; const css=s=>getComputedStyle(q(s)); return { titleMode:q('#game').classList.contains('title-mode'), scene:pos('#scene'), game:pos('#game'), topbar:css('.topbar').display, footer:css('.footer').display, dev:css('.title-dev-hooks').display, backdrop:q('#titleBackdrop').src, overlay:q('#titleOverlay').src, logo:q('#titleLogo').src, mark:q('#titleMark').src, start:pos('#startBtn'), cont:pos('#titleContinueBtn'), guide:pos('#titleGuideBtn'), exit:pos('#titleExitBtn'), startBg:css('#startBtn').backgroundImage, label:q('#startBtn').textContent.trim() }; })()");
  if (!state.titleMode) throw new Error('title mode class missing');
  if (state.topbar !== 'none' || state.footer !== 'none') throw new Error('runtime chrome still visible on original title');
  if (state.dev !== 'none') throw new Error('developer hooks are visible on title');
  if (state.scene.left !== 0 || state.scene.top !== 0 || state.scene.width !== 853 || state.scene.height !== 480) {
    throw new Error('title scene is not full 853x480: ' + JSON.stringify(state.scene));
  }
  const expectedPaths = [
    [state.backdrop, '/image/bjmap/0054.png'],
    [state.overlay, '/image/title/4004.png'],
    [state.logo, '/image/title/0002.png'],
    [state.mark, '/image/title/0003.png'],
  ];
  for (const [url, path] of expectedPaths) {
    if (!String(url).includes(path)) throw new Error('unexpected original title resource: ' + url + ' expected ' + path);
  }
  const expectedButtons = [
    ['start', state.start, 122],
    ['continue', state.cont, 202],
    ['guide', state.guide, 283],
    ['exit', state.exit, 363],
  ];
  for (const [name, rect, left] of expectedButtons) {
    if (Math.abs(rect.left-left)>1 || Math.abs(rect.top-224)>1 || Math.abs(rect.height-193)>1) {
      throw new Error(name + ' title button coordinates drifted: ' + JSON.stringify(rect));
    }
  }
  if (!state.startBg.includes('/image/title/1001.png')) throw new Error('start button is not using original artwork');
  if (!state.label.includes('原版')) throw new Error('accessible start label lost original-game semantics');

  const unexpected = errors.filter(row => !row.includes('favicon'));
  if (unexpected.length) throw new Error('unexpected browser title errors:\n' + unexpected.join('\n'));

  console.log('original title visual structure E2E PASS');
  console.log('  original background/logo/mark/button artwork loaded from offline dist');
  console.log('  v_title.lua button coordinates preserved on full 853x480 title frame');
} finally {
  await cleanup();
}
