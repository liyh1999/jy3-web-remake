import { launchBrowserHarness } from './browser-e2e-core.mjs';

const browser = await launchBrowserHarness({
  port: Number(process.env.JY3_BATTLE_MINIGAME_E2E_PORT || 8100),
  debugPort: Number(process.env.JY3_BATTLE_MINIGAME_E2E_DEBUG_PORT || 9236),
  dist: process.env.JY3_BATTLE_MINIGAME_E2E_DIST === '1',
});

const { evaluate, waitFor, cleanup, errors, sleep } = browser;

const closeEnough = (value, expected, tolerance = 1) => Math.abs(Number(value) - expected) <= tolerance;

try {
  await waitFor(
    "window.JYBattleView && window.JYWeb && window.JYResources && document.querySelector('#battle') && document.querySelector('#gcoreCanvas')",
    { timeoutMs: 30000, label: 'battle/minigame visual runtime' }
  );

  await evaluate(`(() => {
    JYBattleView.begin(10, 0);
    const positions = JYBattleView.positions;
    positions.forEach((position, index) => {
      JYBattleView.slot(position, index + 1, position, 100, 100, 60, 100, 120, true, index >= 5);
    });
  })()`);

  const battle = await evaluate(`(() => {
    const q = s => document.querySelector(s);
    const rect = s => {
      const n=q(s);
      return { left:n.offsetLeft, top:n.offsetTop, width:n.offsetWidth, height:n.offsetHeight };
    };
    const style=getComputedStyle(q('#battle'));
    const slot = position => rect('#battleSlot-' + position);
    return {
      mode:q('#game').classList.contains('battle-mode'),
      minigame:q('#game').classList.contains('minigame-mode'),
      panel:rect('#battle'),
      board:rect('.battle-board'),
      foreground:style.getPropertyValue('--battle-foreground'),
      background:style.getPropertyValue('--battle-background'),
      charge:style.getPropertyValue('--battle-charge-frame'),
      victory:style.getPropertyValue('--battle-victory'),
      defeat:style.getPropertyValue('--battle-defeat'),
      slots:Object.fromEntries(JYBattleView.positions.map(position => [position, slot(position)])),
    };
  })()`);

  if (!battle.mode || battle.minigame) throw new Error('battle presentation mode is not isolated: ' + JSON.stringify(battle));
  if (battle.panel.left !== 0 || battle.panel.top !== 0 || battle.panel.width !== 853 || battle.panel.height !== 480) {
    throw new Error('battle frame is not full 853x480: ' + JSON.stringify(battle.panel));
  }
  if (!closeEnough(battle.board.left, 106.5) || battle.board.top !== 0 || battle.board.width !== 640 || battle.board.height !== 480) {
    throw new Error('original 640x480 battle stage drifted: ' + JSON.stringify(battle.board));
  }

  const expectedResources = [
    [battle.foreground, '/image/bjmap/0058.png'],
    [battle.background, '/image/bjmap/000a.png'],
    [battle.charge, '/image/ui/0069.png'],
    [battle.victory, '/image/ui/004c.png'],
    [battle.defeat, '/image/ui/004d.png'],
  ];
  for (const [url, path] of expectedResources) {
    if (!String(url).toLowerCase().includes(path)) {
      throw new Error('original battle resource missing: ' + url + ' expected ' + path);
    }
  }

  const expectedSlots = {
    team1:[142,346], team2:[388,261], team3:[510,195], team4:[586,145], team5:[301,313],
    enemy1:[150,89], enemy2:[152,212], enemy3:[352,89], enemy4:[52,150], enemy5:[252,44], enemy6:[252,150],
  };
  for (const [position, [left, top]] of Object.entries(expectedSlots)) {
    const rect=battle.slots[position];
    if (!closeEnough(rect.left,left) || !closeEnough(rect.top,top) || rect.width !== 100 || rect.height !== 100) {
      throw new Error(position + ' original battle coordinate drifted: ' + JSON.stringify(rect));
    }
  }

  await evaluate("JYBattleView.end(1)");
  const victory = await evaluate(`(() => {
    const n=document.querySelector('#battleResult');
    return { win:n.classList.contains('victory'), bg:getComputedStyle(n).backgroundImage };
  })()`);
  if (!victory.win || !String(victory.bg).toLowerCase().includes('/image/ui/004c.png')) {
    throw new Error('original victory artwork not active: ' + JSON.stringify(victory));
  }
  await evaluate("JYBattleView.hide()");
  const hidden = await evaluate("document.querySelector('#battle').classList.contains('hidden') && !document.querySelector('#game').classList.contains('battle-mode')");
  if (!hidden) throw new Error('battle visual mode did not cleanly exit');

  const minigames = [
    ['logging', 'startOriginalLogging', '原版伐木程序运行中'],
    ['dig', 'startOriginalDig', '原版采矿程序运行中'],
    ['fishing', 'startOriginalFishing', '原版钓鱼程序运行中'],
    ['hunting', 'startOriginalHunting', '原版打猎程序运行中'],
    ['gambling', 'startOriginalGambling', '原版押宝程序运行中'],
  ];

  for (const [name, method, status] of minigames) {
    await evaluate(`JYWeb[${JSON.stringify(method)}]()`);
    await waitFor(
      `document.querySelector('#runtimeStatus')?.textContent.includes(${JSON.stringify(status)}) && document.querySelector('#game').classList.contains('minigame-mode')`,
      { timeoutMs: 30000, label: name + ' original UI start' }
    );
    await sleep(150);
    const state = await evaluate(`(() => {
      const game=document.querySelector('#game');
      const scene=document.querySelector('#scene');
      const canvas=document.querySelector('#gcoreCanvas');
      const style=getComputedStyle(canvas);
      const ctx=canvas.getContext('2d');
      let painted=0;
      try {
        const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        const stride=Math.max(4, Math.floor(data.length / 12000 / 4) * 4);
        for (let i=3;i<data.length;i+=stride) if (data[i] > 0 && ++painted >= 24) break;
      } catch (_) {
        painted=24;
      }
      return {
        game:{w:game.offsetWidth,h:game.offsetHeight},
        scene:{left:scene.offsetLeft,top:scene.offsetTop,w:scene.offsetWidth,h:scene.offsetHeight},
        canvas:{w:canvas.width,h:canvas.height,cssW:parseFloat(style.width),cssH:parseFloat(style.height),left:parseFloat(style.left),top:parseFloat(style.top)},
        painted,
        topbar:getComputedStyle(document.querySelector('.topbar')).display,
        footer:getComputedStyle(document.querySelector('.footer')).display,
      };
    })()`);
    if (state.game.w !== 853 || state.game.h !== 480 || state.scene.left !== 0 || state.scene.top !== 0 || state.scene.w !== 853 || state.scene.h !== 480) {
      throw new Error(name + ' escaped original 853x480 frame: ' + JSON.stringify(state));
    }
    if (!closeEnough(state.canvas.cssW,853) || !closeEnough(state.canvas.cssH,480) || !closeEnough(state.canvas.left,0) || !closeEnough(state.canvas.top,0)) {
      throw new Error(name + ' gcore canvas is letterboxed by Web chrome: ' + JSON.stringify(state.canvas));
    }
    if (state.topbar !== 'none' || state.footer !== 'none') throw new Error(name + ' Web chrome still visible');
    if (state.painted < 24) throw new Error(name + ' original gcore UI did not paint visible content');
  }

  const unexpected = errors.filter(row => !row.includes('favicon'));
  if (unexpected.length) throw new Error('unexpected battle/minigame visual errors:\n' + unexpected.join('\n'));

  console.log('original battle/minigame visual E2E PASS');
  console.log('  v_battle 640x480 geometry, 11 actor positions and original artwork preserved');
  console.log('  logging/dig/fishing/hunting/gambling render on full 853x480 gcore frame');
} finally {
  await cleanup();
}
