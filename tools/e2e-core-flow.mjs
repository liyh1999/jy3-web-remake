import { launchBrowserHarness } from './browser-e2e-core.mjs';

const browser = await launchBrowserHarness({
  port: Number(process.env.JY3_E2E_PORT || 8092),
  debugPort: Number(process.env.JY3_E2E_DEBUG_PORT || 9228),
  dist: process.env.JY3_E2E_DIST === '1',
});

const { evaluate, waitFor, click, errors, sleep } = browser;

async function drainDialogueUntil(predicate, answers = [], timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let answerIndex = 0;
  while (Date.now() < deadline) {
    if (errors.length) throw new Error('browser errors during dialogue flow:\n' + errors.join('\n'));
    if (await evaluate(`Boolean(${predicate})`)) return answerIndex;
    const optionCount = await evaluate("document.querySelectorAll('#options button').length");
    if (optionCount > 0) {
      if (answerIndex >= answers.length) {
        throw new Error(`menu answer fixture exhausted; visible options=${optionCount}`);
      }
      const choice = Number(answers[answerIndex++]);
      if (choice < 1 || choice > optionCount) throw new Error(`invalid menu choice ${choice}/${optionCount}`);
      const clicked = await evaluate(`(() => {
        const buttons = [...document.querySelectorAll('#options button')];
        const button = buttons[${choice - 1}];
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error('menu click failed');
      await sleep(60);
      continue;
    }
    const canContinue = await evaluate("Boolean(document.querySelector('#continueBtn:not(.hidden):not(:disabled)'))");
    if (canContinue) {
      await click('#continueBtn');
      await sleep(60);
      continue;
    }
    await sleep(80);
  }
  const snapshot = await evaluate(`(() => {
    let mapId = 0;
    let activeStatus = '';
    try {
      mapId = Number(window.fengari.load("local G=require 'gf'; return tonumber(G.QueryName(0x10030001)[tostring(140)]) or 0", '@e2e/debug-map')()) || 0;
      activeStatus = String(window.fengari.load("local a,b=__jy_story_program_status('序幕_开始'); return tostring(a or '')..':'..tostring(b or '')", '@e2e/debug-story')() || '');
    } catch (error) {
      activeStatus = 'debug-error:' + String(error?.message || error);
    }
    return {
      mapId,
      activeStatus,
      scene: document.querySelector('#scene')?.className || '',
      status: document.querySelector('#runtimeStatus')?.textContent || '',
      dialogueHidden: document.querySelector('#dialogue')?.classList.contains('hidden'),
      continueVisible: Boolean(document.querySelector('#continueBtn:not(.hidden):not(:disabled)')),
      options: [...document.querySelectorAll('#options button')].map(node => node.textContent),
      answerIndex: ${answerIndex},
    };
  })()`);
  throw new Error('dialogue/menu flow timed out: ' + JSON.stringify(snapshot));
}

try {
  await waitFor(
    "document.querySelector('#startBtn') && !document.querySelector('#startBtn').disabled && document.querySelector('#startBtn').textContent.includes('原版')",
    { timeoutMs: 30000, label: 'original runtime bootstrap' }
  );
  const strictMissing = await evaluate(`window.fengari.load("return __jy_set_strict_missing_calls(true)", '@e2e/strict-missing')()`);
  if (!strictMissing) throw new Error('failed to enable strict missing-call mode');

  // 1) Real page new-game button + original questionnaire menus.
  await click('#startBtn');
  const openingAnswers = [5,5,1,1,1,1,1,1,1,1,1,1,1,1];
  await drainDialogueUntil(
    "document.querySelector('#scene')?.classList.contains('village-scene') && document.querySelector('#dialogue')?.classList.contains('hidden') && !document.querySelector('#continueBtn:not(.hidden)') && document.querySelectorAll('#options button').length===0 && (() => { try { return Number(window.fengari.load(\"local G=require 'gf'; return tonumber(G.QueryName(0x10030001)[tostring(140)]) or 0\", '@e2e/opening-map')()) === 0x10060002; } catch (_) { return false; } })()",
    openingAnswers,
    30000
  );

  const openingState = await evaluate(`(() => ({
    scene: document.querySelector('#scene')?.className || '',
    hudHidden: document.querySelector('#hud')?.classList.contains('hidden'),
    morality: Number(window.JYWeb?.getPoint?.(15) || 0),
    money: Number(document.querySelector('#money')?.textContent || 0)
  }))()`);
  const openingMap = await evaluate("Number(window.fengari.load(\"local G=require 'gf'; return tonumber(G.QueryName(0x10030001)[tostring(140)]) or 0\", '@e2e/opening-map-check')())");
  if (openingMap !== 0x10060002) throw new Error('new game did not reach Niujia Village map state');
  if (!openingState.scene.includes('village-scene')) {
    throw new Error('new game reached Niujia Village state but browser scene did not render village');
  }
  if (openingState.hudHidden) throw new Error('new game reached Niujia Village with hidden HUD');

  // 2) Original Niujia NPC dialogue in the real browser UI.
  const huangStarted = await evaluate(`window.fengari.load("return __jy_run('牛家村-黄蓉')", '@e2e/huang-rong')()`);
  if (!huangStarted) throw new Error('Huang Rong event did not start');
  await drainDialogueUntil(
    "document.querySelector('#dialogue')?.classList.contains('hidden') && !document.querySelector('#continueBtn:not(.hidden)') && document.querySelectorAll('#options button').length===0",
    [],
    20000
  );
  await sleep(500);
  const autosaveRaw = await evaluate("localStorage.getItem('jy3-web-remake:save:v2:autosave')");
  if (!autosaveRaw) throw new Error('completed NPC event did not create autosave');

  // 3) Original Mu Nianci event -> menu -> original battle UI. Exercise browser escape control.
  // Keep the original event/data path, but use the Web dialogue bridge here so the
  // menu result is resumed into the same story coroutine deterministically. The
  // original dialogue runtime has its own async program wrapper and can finish the
  // event before the E2E click result reaches this direct __jy_run coroutine.
  await evaluate(`window.JYWeb.disableOriginalDialogue()`);
  const muStarted = await evaluate(`window.fengari.load("return __jy_run('牛家村-穆念慈')", '@e2e/mu-nianci')()`);
  if (!muStarted) throw new Error('Mu Nianci event did not start');

  // Initial talk, then choose the marriage/battle option.
  await waitFor("document.querySelector('#continueBtn:not(.hidden)')", { label: 'Mu Nianci opening talk' });
  await click('#continueBtn');
  await waitFor("document.querySelectorAll('#options button').length >= 2", { label: 'Mu Nianci menu' });
  const muOptions = await evaluate("[...document.querySelectorAll('#options button')].map(node => node.textContent)");
  const marriageIndex = muOptions.findIndex(text => String(text).includes('相公'));
  if (marriageIndex < 0) throw new Error('Mu Nianci battle option missing: ' + JSON.stringify(muOptions));
  const muClicked = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('#options button')];
    const button = buttons[${marriageIndex}];
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!muClicked) throw new Error('Mu Nianci battle option click failed');

  {
    const deadline = Date.now() + 30000;
    let battleVisible = false;
    while (Date.now() < deadline) {
      if (errors.length) {
        throw new Error('browser errors while starting original battle:\n' + errors.join('\n'));
      }
      battleVisible = await evaluate(
        "Boolean(document.querySelector('#battle') && !document.querySelector('#battle').classList.contains('hidden'))"
      );
      if (battleVisible) break;
      await sleep(80);
    }
    if (!battleVisible) {
      const snapshot = await evaluate(`(() => {
        let battleActive = false;
        let callBattleType = '';
        let originalEnabled = false;
        let storyStatus = '';
        let runtimeTrace = '';
        try {
          battleActive = Boolean(window.fengari.load("return __jy_battle_browser_active()", '@e2e/battle-active')());
          callBattleType = String(window.fengari.load("local G=require 'gf'; return type(G.api['call_battle'])", '@e2e/call-battle-type')() || '');
          originalEnabled = Boolean(window.fengari.load("local G=require 'gf'; return G.__original_battle_enabled == true", '@e2e/battle-enabled')());
          const trace = window.fengari.load("local s,t=__jy_debug_runtime_trace(); return tostring(s)..' || '..tostring(t)", '@e2e/runtime-trace')();
          runtimeTrace = String(trace || '');
          storyStatus = runtimeTrace.split(' || ')[0] || '';
        } catch (_) {}
        return {
          status: document.querySelector('#runtimeStatus')?.textContent || '',
          battleClass: document.querySelector('#battle')?.className || '',
          battleActive,
          callBattleType,
          originalEnabled,
          storyStatus,
          runtimeTrace,
          dialogueHidden: document.querySelector('#dialogue')?.classList.contains('hidden'),
          options: [...document.querySelectorAll('#options button')].map(node => node.textContent)
        };
      })()`);
      throw new Error('timed out waiting for original battle UI: ' + JSON.stringify({ snapshot, muOptions, marriageIndex }));
    }
  }
  const battleTitle = await evaluate("document.querySelector('#battleTitle')?.textContent || ''");
  if (!battleTitle) throw new Error('battle UI title missing');

  await waitFor(
    "document.querySelector('#battleEscapeBtn') && !document.querySelector('#battleEscapeBtn').disabled",
    { timeoutMs: 20000, label: 'battle escape enabled' }
  );
  await click('#battleEscapeBtn');

  await drainDialogueUntil(
    "document.querySelector('#battle')?.classList.contains('hidden') && document.querySelector('#dialogue')?.classList.contains('hidden') && document.querySelectorAll('#options button').length===0",
    [],
    30000
  );

  // 4) Manual slot save, mutate authoritative Lua state, then load and verify restoration.
  await evaluate(`(() => {
    const select = document.querySelector('#saveSlotSelect');
    select.value = 'slot1';
    select.dispatchEvent(new Event('change', { bubbles:true }));
  })()`);
  await waitFor("!document.querySelector('#saveBtn').disabled", { label: 'manual save enabled' });

  const before = await evaluate("Number(window.JYWeb.getPoint(15) || 0)");
  await click('#saveBtn');
  await waitFor("Boolean(localStorage.getItem('jy3-web-remake:save:v2:slot1'))", { label: 'slot1 persisted' });

  const slotPayload = await evaluate("JSON.parse(localStorage.getItem('jy3-web-remake:save:v2:slot1'))");
  if (slotPayload.schemaVersion !== 2 || !slotPayload.luaState || !slotPayload.meta) {
    throw new Error('manual slot payload is incomplete');
  }

  const changed = before === 77 ? 76 : 77;
  await evaluate(`window.fengari.load("local G=require 'gf'; return G.call('set_point',15,${changed})", '@e2e/mutate-save')()`);
  await waitFor(`Number(window.JYWeb.getPoint(15)) === ${changed}`, { label: 'mutated morality visible' });

  await click('#loadBtn');
  await waitFor(`Number(window.JYWeb.getPoint(15)) === ${before}`, { timeoutMs: 20000, label: 'manual slot restored morality' });

  // Let late async browser tasks settle before evaluating errors.
  await sleep(750);
  if (errors.length) {
    throw new Error(`browser errors captured:\n${errors.join('\n')}`);
  }
  const runtimeGaps = await evaluate(`(() => {
    const probe = window.fengari.load("return __jy_missing_calls(), __jy_missing_objects()", '@e2e/runtime-gaps');
    const values = probe();
    return Array.isArray(values)
      ? { calls: String(values[0] || ''), objects: String(values[1] || '') }
      : { calls: String(values || ''), objects: '' };
  })()`);
  if (runtimeGaps.calls) throw new Error('browser E2E used missing calls: ' + runtimeGaps.calls);

  console.log('browser E2E core flow PASS');
  console.log('  missing calls:', runtimeGaps.calls || 'none');
  console.log('  missing objects:', runtimeGaps.objects || 'none');
  console.log('  page load -> original new game -> Niujia NPC dialogue -> original battle escape -> slot1 save/load');
  console.log('  console errors / Runtime.exceptionThrown: 0');
} finally {
  await browser.cleanup();
}
