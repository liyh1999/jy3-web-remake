import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
const releaseRoot = path.join(root, 'release', `jy3-web-remake-v${version}`);
const reportDir = path.join(root, 'reports', 'headless-playtest');
fs.rmSync(reportDir, { recursive: true, force: true });
fs.mkdirSync(reportDir, { recursive: true });

if (!fs.existsSync(path.join(releaseRoot, 'index.html'))) {
  throw new Error('release package missing; run release:prepare first');
}

const snapshots = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'regression-snapshots.json'), 'utf8'));
const openingAnswers = snapshots.opening.answers.slice(0, -1);
const port = Number(process.env.JY3_PLAYTEST_PORT || 8112);
const { spawn } = await import('node:child_process');
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', releaseRoot, '--bind', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverError = '';
server.stderr.on('data', chunk => { serverError += String(chunk); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const baseUrl = `http://127.0.0.1:${port}`;

async function waitServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/index.html`);
      if (r.ok) return;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('playtest server failed: ' + serverError);
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN
    ? { executablePath: process.env.CHROME_BIN }
    : { executablePath: chromium.executablePath() }),
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
const steps = [];
const report = {
  version,
  startedAt: new Date().toISOString(),
  browser: '',
  steps,
  errors,
  final: {},
};

page.on('pageerror', error => errors.push('pageerror: ' + String(error?.stack || error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const value = message.text();
  if (/favicon\.ico/i.test(value) || /^Failed to load resource:/i.test(value)) return;
  errors.push('console: ' + value);
});

async function shot(name) {
  const file = path.join(reportDir, `${String(steps.length).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(root, file).split(path.sep).join('/');
}

async function note(name, details = {}) {
  const entry = { name, at: new Date().toISOString(), ...details };
  steps.push(entry);
  console.log('PLAYTEST', name, JSON.stringify(details));
  return entry;
}

async function drainUntilVillage() {
  let answerIndex = 0;
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    if (errors.length) throw new Error(errors.join('\n'));
    const arrived = await page.evaluate(expectedMap => {
      try {
        const scene = document.querySelector('#scene');
        const mapId = Number(window.fengari.load(
          "local G=require 'gf'; return tonumber(G.QueryName(0x10030001)[tostring(140)]) or 0",
          '@playtest/opening-map'
        )()) || 0;
        return scene?.classList.contains('village-scene')
          && mapId === expectedMap
          && document.querySelector('#dialogue')?.classList.contains('hidden')
          && !document.querySelector('#continueBtn:not(.hidden):not(:disabled)')
          && document.querySelectorAll('#options button').length === 0;
      } catch (_) { return false; }
    }, snapshots.opening.expected.mapId);
    if (arrived) return answerIndex;

    const options = page.locator('#options button');
    const count = await options.count();
    if (count > 0) {
      if (answerIndex >= openingAnswers.length) throw new Error('opening answer fixture exhausted');
      const choice = Number(openingAnswers[answerIndex++]);
      if (choice < 1 || choice > count) throw new Error(`invalid opening answer ${choice}/${count}`);
      const target = await page.evaluate(({ index, answerNumber }) => {
        const buttons = [...document.querySelectorAll('#options button')];
        const button = buttons[index];
        if (!button) return { ok:false, answerNumber, choice:index + 1, reason:'button missing' };
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        const ok = hit === button || button.contains(hit);
        return {
          ok,
          answerNumber,
          choice:index + 1,
          text:button.textContent || '',
          x,
          y,
          rect:{ left:rect.left, top:rect.top, width:rect.width, height:rect.height },
          hit:{ tag:hit?.tagName || '', id:hit?.id || '', className:String(hit?.className || ''), text:String(hit?.textContent || '').slice(0,80) },
          display:window.JYDisplay?.settings?.() || null,
        };
      }, { index:choice - 1, answerNumber:answerIndex });
      await note('opening-choice-target', target);
      if (!target.ok) {
        throw new Error('opening choice is not physically hittable: ' + JSON.stringify(target));
      }
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(80);
      continue;
    }

    const next = page.locator('#continueBtn:not(.hidden):not(:disabled)');
    if (await next.count()) {
      await next.click();
      await page.waitForTimeout(60);
      continue;
    }
    await page.waitForTimeout(80);
  }
  throw new Error('opening playthrough timed out');
}

async function drainDialogue(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const options = page.locator('#options button');
    if (await options.count()) return 'menu';
    const next = page.locator('#continueBtn:not(.hidden):not(:disabled)');
    if (await next.count()) {
      await next.click();
      await page.waitForTimeout(80);
      continue;
    }
    const hidden = await page.locator('#dialogue').evaluate(node => node.classList.contains('hidden'));
    if (hidden) return 'done';
    await page.waitForTimeout(80);
  }
  throw new Error('dialogue drain timed out');
}

try {
  await waitServer();
  report.browser = browser.version();

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('#startBtn');
    return Boolean(b && !b.disabled && b.textContent.includes('原版'));
  }, null, { timeout: 30000 });
  const titleMetrics = await page.evaluate(() => ({
    boot: { ...window.JYBootMetrics },
    frame: {
      width: document.querySelector('#game')?.offsetWidth || 0,
      height: document.querySelector('#game')?.offsetHeight || 0,
    },
    titleMode: document.querySelector('#game')?.classList.contains('title-mode') || false,
  }));
  await note('title-ready', titleMetrics);
  await shot('title');

  await page.click('#startBtn');
  const answered = await drainUntilVillage();
  await note('new-game-to-village', {
    questionnaireAnswers: answered,
    mapId: await page.evaluate(() => Number(window.fengari.load(
      "local G=require 'gf'; return tonumber(G.QueryName(0x10030001)[tostring(140)]) or 0",
      '@playtest/map'
    )()) || 0),
  });
  await shot('village');

  // The original title presentation intentionally hides the Web footer. Touch
  // player settings only after entering the in-game HUD, where they are visible.
  await page.click('#displaySettingsBtn');
  await page.selectOption('#displayScaleSelect', '1');
  await page.click('#audioSettingsBtn');
  await page.$eval('#audioMaster', node => {
    node.value = '70';
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const settings = await page.evaluate(() => ({
    scale: document.querySelector('#displayScaleSelect')?.value || '',
    audio: document.querySelector('#audioMaster')?.value || '',
    footerVisible: getComputedStyle(document.querySelector('.footer')).display !== 'none',
  }));
  if (!settings.footerVisible) throw new Error('in-game settings footer is not visible');
  await note('settings-touched-in-game', settings);

  await page.click('#personBtn');
  await page.waitForSelector('#personPanel:not(.hidden)', { timeout: 10000 });
  const person = await page.evaluate(() => ({
    name: document.querySelector('#personName')?.textContent || '',
    school: document.querySelector('#personSchool')?.textContent || '',
    skills: document.querySelectorAll('#personSkills > *').length,
    team: document.querySelector('#personTeamCount')?.textContent || '',
  }));
  await note('person-panel', person);
  await shot('person');
  await page.click('#personClose');

  await page.click('#inventoryBtn');
  await page.waitForSelector('#inventoryPanel:not(.hidden)', { timeout: 10000 });
  const inventory = await page.evaluate(() => ({
    money: document.querySelector('#inventoryMoney')?.textContent || '',
    items: document.querySelectorAll('#inventoryList > *').length,
  }));
  await note('inventory-panel', inventory);
  await shot('inventory');
  await page.click('#inventoryClose');

  // Start an original NPC event, then play through its dialogue by clicking continue.
  const huang = await page.evaluate(() => window.fengari.load(
    "return __jy_run('牛家村-黄蓉')",
    '@playtest/huang-rong'
  )());
  if (!huang) throw new Error('could not start 黄蓉 event');
  await drainDialogue();
  await page.waitForTimeout(400);
  const huangState = await page.evaluate(() => ({
    autosave: Boolean(localStorage.getItem('jy3-web-remake:save:v2:autosave')),
    item75: Number(window.fengari.load("local G=require 'gf'; return G.call('get_item',75)", '@playtest/item75')()) || 0,
  }));
  if (!huangState.autosave || huangState.item75 < 1) throw new Error('黄蓉 event did not persist expected state');
  await note('huang-rong-event', huangState);

  // Enter a real original battle via the Mu Nianci event and use the visible escape button.
  await page.evaluate(() => window.JYWeb.disableOriginalDialogue());
  const mu = await page.evaluate(() => window.fengari.load(
    "return __jy_run('牛家村-穆念慈')",
    '@playtest/mu-nianci'
  )());
  if (!mu) throw new Error('could not start 穆念慈 event');
  await page.waitForSelector('#continueBtn:not(.hidden):not(:disabled)', { timeout: 15000 });
  await page.click('#continueBtn');
  await page.waitForFunction(() => document.querySelectorAll('#options button').length >= 2, null, { timeout: 15000 });
  const marriageIndex = await page.evaluate(() =>
    [...document.querySelectorAll('#options button')].findIndex(node => String(node.textContent).includes('相公'))
  );
  if (marriageIndex < 0) throw new Error('穆念慈 battle menu option missing');
  await page.locator('#options button').nth(marriageIndex).click();
  await page.waitForSelector('#battle:not(.hidden)', { timeout: 30000 });
  const battle = await page.evaluate(() => ({
    title: document.querySelector('#battleTitle')?.textContent || '',
    allies: document.querySelectorAll('#battleAllies .battle-slot').length,
    enemies: document.querySelectorAll('#battleEnemies .battle-slot').length,
    escapeEnabled: !document.querySelector('#battleEscapeBtn')?.disabled,
  }));
  await note('battle-entered', battle);
  await shot('battle');
  await page.waitForFunction(() => {
    const b = document.querySelector('#battleEscapeBtn');
    return Boolean(b && !b.disabled);
  }, null, { timeout: 20000 });
  await page.click('#battleEscapeBtn');
  await page.waitForFunction(() => document.querySelector('#battle')?.classList.contains('hidden'), null, { timeout: 30000 });
  await note('battle-escaped');

  // Manual save/load via visible HUD controls.
  await page.selectOption('#saveSlotSelect', 'slot1');
  await page.waitForFunction(() => !document.querySelector('#saveBtn')?.disabled, null, { timeout: 10000 });
  const before = await page.evaluate(() => Number(window.JYWeb.getPoint(15) || 0));
  await page.click('#saveBtn');
  await page.waitForFunction(() => Boolean(localStorage.getItem('jy3-web-remake:save:v2:slot1')), null, { timeout: 10000 });
  const changed = before === 77 ? 76 : 77;
  await page.evaluate(value => window.fengari.load(
    `local G=require 'gf'; return G.call('set_point',15,${value})`,
    '@playtest/mutate'
  )(), changed);
  await page.waitForFunction(value => Number(window.JYWeb.getPoint(15)) === value, changed, { timeout: 10000 });
  await page.click('#loadBtn');
  await page.waitForFunction(value => Number(window.JYWeb.getPoint(15)) === value, before, { timeout: 20000 });
  await note('save-load-restored', { before, mutated: changed, restored: before });

  const finalState = await page.evaluate(() => {
    const gaps = window.fengari.load("return __jy_missing_calls(), __jy_missing_objects()", '@playtest/gaps')();
    const values = Array.isArray(gaps) ? gaps : [gaps, ''];
    return {
      status: document.querySelector('#runtimeStatus')?.textContent || '',
      mapId: Number(window.fengari.load("local G=require 'gf'; return tonumber(G.QueryName(0x10030001)[tostring(140)]) or 0", '@playtest/final-map')()) || 0,
      missingCalls: String(values[0] || ''),
      missingObjects: String(values[1] || ''),
      boot: { ...window.JYBootMetrics },
    };
  });
  report.final = finalState;
  await shot('final-village');

  if (finalState.missingCalls || finalState.missingObjects) {
    throw new Error('runtime gaps during playtest: ' + JSON.stringify(finalState));
  }
  if (errors.length) throw new Error('browser errors during playtest:\n' + errors.join('\n'));

  report.finishedAt = new Date().toISOString();
  report.result = 'PASS';
  fs.writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('HEADLESS EXPLORATORY PLAYTEST PASS');
  console.log('  title/settings -> original new game -> village -> person/inventory -> 黄蓉 -> 穆念慈 battle -> save/load');
  console.log('  browser errors: 0');
  console.log('  missing calls/objects: none');
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.result = 'FAIL';
  report.failure = String(error?.stack || error);
  try { await shot('failure'); } catch (_) {}
  fs.writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await context.close();
  await browser.close();
  server.kill('SIGTERM');
}
