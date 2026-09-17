(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const ui = {
    status: $('#runtimeStatus'), start: $('#startBtn'), village: $('#villageBtn'), original: $('#originalBtn'),
    scene: $('#scene'), hud: $('#hud'), stats: $('#statGrid'), money: $('#money'),
    dialogue: $('#dialogue'), speaker: $('#speaker'), text: $('#dialogueText'),
    options: $('#options'), cont: $('#continueBtn'), actions: $('#villageActions'),
    battle: $('#battle'), battleTitle: $('#battleTitle'), enemyName: $('#enemyName'),
    playerBar: $('#playerHpBar'), enemyBar: $('#enemyHpBar'), playerText: $('#playerHpText'),
    enemyText: $('#enemyHpText'), battleLog: $('#battleLog'), attack: $('#attackBtn')
  };

  const labels = {15:'侠义',16:'臂力',17:'根骨',18:'悟性',19:'福缘',20:'灵敏',21:'定力',22:'拳掌',23:'指法',24:'剑术',25:'刀法',26:'奇门',32:'用毒',33:'医疗',34:'暗器'};
  const state = { points:{}, money:2000, items:{}, team:[], skills:[], lastBattle:0 };
  let modalCallback = null;
  let battleCallback = null;
  let battleState = null;

  function setScene(kind) {
    ui.scene.className = `scene ${kind === 'village' ? 'village-scene' : 'title-scene'}`;
    if (kind === 'village') {
      ui.scene.innerHTML = `<div class="mountains"></div><div class="ink ink-a"></div><div class="ink ink-b"></div><div class="title-copy" style="left:28%;top:20%;width:58%"><div class="seal">村</div><h1 style="font-size:42px">牛家村</h1><p>当前画面仍是占位渲染层；Lua 事件通过同一套 <code>G.call</code> 兼容接口驱动。</p></div>`;
      ui.actions.classList.remove('hidden');
      ui.hud.classList.remove('hidden');
    } else {
      ui.actions.classList.add('hidden');
    }
  }

  function renderStats() {
    const keys = Object.keys(labels).map(Number).filter(k => state.points[k] !== undefined);
    ui.stats.innerHTML = keys.slice(0, 8).map(k => `<div>${labels[k]} <b>${state.points[k]}</b></div>`).join('') || '<div>尚未生成属性</div>';
    ui.money.textContent = state.money;
  }

  function closeDialogue() {
    ui.dialogue.classList.add('hidden');
    ui.options.innerHTML = '';
    ui.cont.classList.add('hidden');
  }

  window.JYWeb = {
    reset() {
      state.points = {15:10,16:10,17:10,18:10,19:10,20:10,21:10,22:0,23:0,24:0,25:0,26:0,32:0,33:0,34:0,143:0};
      state.money = 2000; state.items = {}; state.team = []; state.skills = []; state.lastBattle = 0;
      renderStats();
    },
    setPoint(id, value) { state.points[Number(id)] = Number(value); renderStats(); },
    addPoint(id, delta) { id = Number(id); state.points[id] = (state.points[id] || 0) + Number(delta); renderStats(); },
    getPoint(id) { return state.points[Number(id)] || 0; },
    addMoney(delta) { state.money += Number(delta); renderStats(); return state.money; },
    getMoney() { return state.money; },
    addItem(id, count) { id = String(id); state.items[id] = (state.items[id] || 0) + Number(count); },
    learnMagic(id) { if (!state.skills.includes(Number(id))) state.skills.push(Number(id)); },
    join(id) { if (!state.team.includes(Number(id))) state.team.push(Number(id)); },
    teamFull() { return state.team.length >= 5; },
    story(text, resume) { this.showTalk('旁白', text, resume); },
    showTalk(speaker, text, resume) {
      closeDialogue();
      modalCallback = resume;
      ui.speaker.textContent = speaker || '旁白';
      ui.text.textContent = String(text || '').replace(/\[[^\]]+\]/g, '');
      ui.dialogue.classList.remove('hidden');
      ui.cont.classList.remove('hidden');
    },
    showMenu(question, options, resume) {
      closeDialogue();
      modalCallback = resume;
      ui.speaker.textContent = '选择';
      ui.text.textContent = question || '';
      ui.dialogue.classList.remove('hidden');
      [...options].forEach((opt, idx) => {
        const b = document.createElement('button');
        b.textContent = String(opt).replace(/^\d+,/, '');
        b.onclick = () => { const cb = modalCallback; modalCallback = null; closeDialogue(); cb(idx + 1); };
        ui.options.appendChild(b);
      });
    },
    startBattle(enemy, resume) {
      battleCallback = resume;
      battleState = { player:100, enemy:92, enemyName: enemy || '对手' };
      ui.enemyName.textContent = battleState.enemyName;
      ui.battleTitle.textContent = '切磋';
      ui.battleLog.textContent = `${battleState.enemyName} 摆开架势。`;
      ui.battle.classList.remove('hidden');
      updateBattle();
    },
    setLastBattle(result) { state.lastBattle = Number(result); },
    getLastBattle() { return state.lastBattle; },
    enterVillage() { closeDialogue(); ui.battle.classList.add('hidden'); setScene('village'); },
    finishNewGame() { setScene('village'); },
    showStats(resume) {
      const summary = Object.entries(labels).filter(([k]) => state.points[k] !== undefined).map(([k,v]) => `${v}：${state.points[k]}`).join('　');
      this.showTalk('人物属性', `${summary}\n银两：${state.money}　队友：${state.team.length ? state.team.join('、') : '无'}`, resume);
    }
  };

  function updateBattle() {
    const p = Math.max(0, battleState.player), e = Math.max(0, battleState.enemy);
    ui.playerBar.style.width = `${p}%`; ui.enemyBar.style.width = `${Math.min(100,e/92*100)}%`;
    ui.playerText.textContent = `${p} / 100`; ui.enemyText.textContent = `${e} / 92`;
  }

  ui.attack.onclick = () => {
    if (!battleState) return;
    const dmg = 13 + Math.floor(Math.random() * 14); battleState.enemy -= dmg;
    if (battleState.enemy <= 0) {
      battleState.enemy = 0; updateBattle(); ui.battleLog.textContent = `你造成 ${dmg} 点伤害，取胜。`;
      setTimeout(() => { ui.battle.classList.add('hidden'); const cb = battleCallback; battleCallback = null; battleState = null; cb(1); }, 280);
      return;
    }
    const hurt = 7 + Math.floor(Math.random() * 12); battleState.player -= hurt; updateBattle();
    if (battleState.player <= 0) {
      battleState.player = 0; updateBattle(); ui.battleLog.textContent = `你造成 ${dmg} 点伤害，但随后落败。`;
      setTimeout(() => { ui.battle.classList.add('hidden'); const cb = battleCallback; battleCallback = null; battleState = null; cb(0); }, 280);
    } else ui.battleLog.textContent = `你造成 ${dmg} 点伤害；${battleState.enemyName} 反击 ${hurt} 点。`;
  };

  ui.cont.onclick = () => { const cb = modalCallback; modalCallback = null; closeDialogue(); if (cb) cb(true); };

  function runEvent(name) {
    try { fengari.load(`return __jy_run(${JSON.stringify(name)})`, 'event-launcher')(); }
    catch (e) { console.error(e); ui.status.textContent = 'Lua 事件错误'; window.alert(String(e)); }
  }

  async function boot() {
    window.JYWeb.reset();
    if (!window.fengari) { ui.status.textContent = 'Fengari 加载失败（需要网络）'; return; }
    try {
      const [compat, demo] = await Promise.all([
        fetch('./lua/gf_web.lua').then(r => { if(!r.ok) throw new Error('gf_web.lua'); return r.text(); }),
        fetch('./lua/jy3_demo.lua').then(r => { if(!r.ok) throw new Error('jy3_demo.lua'); return r.text(); })
      ]);
      fengari.load(compat, '@gf_web.lua')();
      fengari.load(demo, '@jy3_demo.lua')();
      ui.status.textContent = 'Lua Runtime READY';
      ui.start.disabled = false; ui.village.disabled = false;
      if (ui.original) ui.original.disabled = false;
      ui.start.onclick = () => { window.JYWeb.reset(); runEvent('回答问题'); };
      ui.village.onclick = () => { window.JYWeb.reset(); window.JYWeb.enterVillage(); };
      if (ui.original) ui.original.onclick = async () => {
        const url = 'https://raw.githubusercontent.com/ssz66666/jy3-mirror/master/JY3/script/04_program/p_newgame.lua';
        ui.original.disabled = true; ui.status.textContent = '拉取 GitHub 原 p_newgame.lua…';
        try {
          const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const source = await r.text();
          fengari.load(source, '@github/p_newgame.lua')();
          ui.status.textContent = 'GitHub 原 p_newgame.lua 已载入（实验）';
          window.JYWeb.reset(); runEvent('回答问题');
        } catch (e) {
          console.error(e); ui.status.textContent = '原脚本加载/执行失败，仍可运行内置 POC';
          window.JYWeb.showTalk('兼容层', `原脚本目前遇到未实现 API 或网络限制：${e.message || e}`, () => {});
        } finally { ui.original.disabled = false; }
      };
      $$('.village-actions button').forEach(b => b.onclick = () => runEvent(b.dataset.event));
    } catch (e) {
      console.error(e); ui.status.textContent = '启动失败：请使用本地 HTTP 服务';
    }
  }
  boot();
})();
