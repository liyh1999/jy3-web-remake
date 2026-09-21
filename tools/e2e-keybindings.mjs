import { launchBrowserHarness } from './browser-e2e-core.mjs';

const browser = await launchBrowserHarness({
  port: Number(process.env.JY3_KEYS_E2E_PORT || 8095),
  debugPort: Number(process.env.JY3_KEYS_E2E_DEBUG_PORT || 9231),
  dist: process.env.JY3_KEYS_E2E_DIST === '1',
});

const { evaluate, waitFor, cleanup, errors } = browser;

try {
  await waitFor(
    "window.JYKeybindings && window.JYBattleView && window.JYWeb && document.querySelector('#keySettingsBtn')",
    { timeoutMs: 30000, label: 'keybinding runtime' }
  );

  await evaluate("window.JYKeybindings.reset(); document.querySelector('#keySettingsBtn').click()");
  await waitFor("!document.querySelector('#keySettingsPanel').classList.contains('hidden') && document.querySelector('[data-key-action=\"skill1\"]')", { label: 'key settings panel' });

  await evaluate("document.querySelector('[data-key-action=\"skill1\"]').click(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',bubbles:true,cancelable:true}))");
  await waitFor("window.JYKeybindings.binding('skill1') === 'z'", { label: 'skill1 rebound to z' });

  const uiState = await evaluate("({ stored: localStorage.getItem(window.JYKeybindings.STORAGE_KEY), skill1: document.querySelector('[data-key-action=\"skill1\"]')?.textContent || '', status: document.querySelector('#keyBindingsStatus')?.textContent || '' })");
  if (!String(uiState.stored).includes('\"skill1\":\"z\"')) throw new Error('keybinding was not persisted');
  if (uiState.skill1 !== 'Z') throw new Error('keybinding UI did not render remapped key');

  await evaluate("document.querySelector('[data-key-action=\"item1\"]').click(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',bubbles:true,cancelable:true}))");
  const conflict = await evaluate("({ item1: window.JYKeybindings.binding('item1'), status: document.querySelector('#keyBindingsStatus')?.textContent || '' })");
  if (conflict.item1 !== 'q' || !conflict.status.includes('已用于')) throw new Error('duplicate key conflict was not surfaced');

  await evaluate("document.body.click(); window.JYBattleView.begin(1,1); window.JYBattleView.skillOption(1,13,'测试武功',2,true,'1'); window.__jyKeyCalls=[]; window.JYWeb.chooseOriginalBattleSkill=(slot)=>window.__jyKeyCalls.push(Number(slot));");
  const hotkeyLabel = await evaluate("document.querySelector('#battleSkills button[data-slot=\"1\"] kbd')?.textContent || ''");
  if (hotkeyLabel !== 'Z') throw new Error('battle skill label did not follow remapped key');

  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'1',bubbles:true,cancelable:true}))");
  let calls = await evaluate("window.__jyKeyCalls.slice()");
  if (calls.length !== 0) throw new Error('legacy skill key remained active after rebinding');

  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',bubbles:true,cancelable:true}))");
  calls = await evaluate("window.__jyKeyCalls.slice()");
  if (calls.length !== 1 || calls[0] !== 1) throw new Error('remapped battle key did not trigger skill1');

  await evaluate("location.reload()");
  await waitFor("window.JYKeybindings?.binding('skill1') === 'z'", { timeoutMs: 30000, label: 'keybinding reload persistence' });

  const unexpected = errors.filter(row => !row.includes('favicon'));
  if (unexpected.length) throw new Error('unexpected browser keybinding errors:\n' + unexpected.join('\n'));

  console.log('battle keybindings browser E2E PASS');
  console.log('  UI capture + conflict rejection + battle action remap + persistence');
} finally {
  await cleanup();
}
