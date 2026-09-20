(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const SAVE_KEY = 'jy3-web-remake:save:v1';
  const LEGACY_FILE_KEY = 'jy3-web-remake:legacy-file:';
  const ui = {
    status: $('#runtimeStatus'), start: $('#startBtn'), village: $('#villageBtn'), original: $('#originalBtn'), logging: $('#loggingBtn'), dig: $('#digBtn'), fishing: $('#fishingBtn'), hunting: $('#huntingBtn'), gambling: $('#gamblingBtn'),
    save: $('#saveBtn'), load: $('#loadBtn'),
    scene: $('#scene'), hud: $('#hud'), stats: $('#statGrid'), money: $('#money'),
    dialogue: $('#dialogue'), speaker: $('#speaker'), text: $('#dialogueText'),
    options: $('#options'), cont: $('#continueBtn'), actions: $('#villageActions'),
    battle: $('#battle'), battleTitle: $('#battleTitle'), enemyName: $('#enemyName'),
    playerBar: $('#playerHpBar'), enemyBar: $('#enemyHpBar'), playerText: $('#playerHpText'),
    enemyText: $('#enemyHpText'), battleLog: $('#battleLog'), attack: $('#attackBtn')
  };

  const labels = {15:'侠义',16:'臂力',17:'根骨',18:'悟性',19:'福缘',20:'灵敏',21:'定力',22:'拳掌',23:'指法',24:'剑术',25:'刀法',26:'奇门',32:'用毒',33:'医疗',34:'暗器'};
  const state = { points:{}, money:0, items:{}, team:[], lastBattle:0 };
  let modalCallback = null;
  let battleCallback = null;
  let battleState = null;
  let originalProgramLoaded = false;
  let pendingSavePayload = '';
  let originalBattleCallback = null;
  let originalBattleStarting = false;
  let originalMinigameCallback = null;
  let battlePumpTimer = null;
  const programPumpTimers = new Map();
  let programReadyTimer = null;
  const storyProgramPumpTimers = new Map();
  let storyProgramReadyTimer = null;

  function emitTeamChanged() {
    const detail = { team: [...state.team] };
    setTimeout(() => window.dispatchEvent(new CustomEvent('jy3:team-changed', { detail })), 0);
  }

  function emitSkillChanged() {
    setTimeout(() => window.dispatchEvent(new CustomEvent('jy3:skill-changed')), 0);
  }

  function emitGrowthChanged() {
    setTimeout(() => window.dispatchEvent(new CustomEvent('jy3:growth-changed')), 0);
  }

  function emitRelationshipChanged() {
    setTimeout(() => window.dispatchEvent(new CustomEvent('jy3:relationship-changed')), 0);
  }

  function replaceSceneMarkup(markup) {
    const existingCanvas = ui.scene.querySelector('#gcoreCanvas');
    if (existingCanvas) existingCanvas.remove();
    ui.scene.innerHTML = markup;
    if (existingCanvas) ui.scene.prepend(existingCanvas);
    const canvas = window.JYRenderer?.ensureCanvas?.();
    window.JYRenderer?.resizeCanvas?.();
    return canvas;
  }
  function setScene(kind) {
    ui.scene.className = `scene ${kind === 'village' ? 'village-scene' : 'title-scene'}`;
    if (kind === 'village') {
      const villageBackground = window.JYResources?.url(0x56050001);
      ui.scene.style.backgroundImage = villageBackground
        ? `linear-gradient(90deg, rgba(18,16,12,.40), rgba(18,16,12,.08)), url("${villageBackground}")`
        : '';
      ui.scene.style.backgroundSize = 'cover';
      ui.scene.style.backgroundPosition = 'center';
      replaceSceneMarkup(`<div class="title-copy" style="left:28%;top:20%;width:58%"><div class="seal">村</div><h1 style="font-size:42px">牛家村</h1><p>背景已通过原资源 ID <code>0x56050001</code> 解析；NPC 按钮直接触发原版 <code>p_niujiacun.lua</code>。</p></div>`);
      ui.actions.classList.remove('hidden');
      ui.hud.classList.remove('hidden');
    } else {
      ui.scene.style.backgroundImage = '';
      ui.scene.style.backgroundSize = '';
      ui.scene.style.backgroundPosition = '';
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

  function resetJsState() {
    state.points = {};
    state.money = 0;
    state.items = {};
    state.team = [];
    state.lastBattle = 0;
    renderStats();
  }

  function resetLuaState() {
    fengari.load('return __jy_reset_runtime()', '@web/reset-runtime')();
  }

  function normalizeLegacyRelativePath(value) {
    const raw = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length || parts.some(part => part === '.' || part === '..' || part.includes('\0'))) {
      throw new Error('非法存档路径');
    }
    return parts.join('/');
  }

  function legacyVirtualPath(scope, value) {
    const kind = scope === 'write' ? 'write' : 'save';
    return `jy3-web://${kind}/${normalizeLegacyRelativePath(value)}`;
  }

  function legacyStorageKey(virtualPath) {
    const value = String(virtualPath || '');
    if (!/^jy3-web:\/\/(?:save|write)\//.test(value)) throw new Error('拒绝访问非存档路径');
    const relative = value.replace(/^jy3-web:\/\/(?:save|write)\//, '');
    normalizeLegacyRelativePath(relative);
    return LEGACY_FILE_KEY + value;
  }

  function refreshLoadButton() {
    if (!ui.load) return;
    ui.load.disabled = !localStorage.getItem(SAVE_KEY);
  }

  function saveGame() {
    try {
      const luaState = fengari.load('return __jy_export_state()', '@web/export-save')();
      const tracked = fengari.load('return __jy_tracked_save_objects()', '@web/save-count')();
      const payload = {
        version: 1,
        upstream: window.JYUpstream?.UPSTREAM_REV || '',
        savedAt: new Date().toISOString(),
        luaState
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      refreshLoadButton();
      ui.status.textContent = `已存档 · ${tracked} 个原 Lua 对象`;
    } catch (e) {
      console.error(e);
      ui.status.textContent = `存档失败：${e.message || e}`;
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        ui.status.textContent = '没有可读取的本地存档';
        return;
      }
      const payload = JSON.parse(raw);
      if (!payload?.luaState) throw new Error('存档内容不完整');

      closeDialogue();
      ui.battle.classList.add('hidden');
      resetJsState();
      resetLuaState();
      pendingSavePayload = payload.luaState;
      const ok = fengari.load('local js=require"js"; return __jy_import_state(js.global.JYWeb:getSavePayload())', '@web/import-save')();
      pendingSavePayload = '';
      if (!ok) throw new Error('Lua 状态导入失败');

      window.JYWeb.enterVillage();
      ui.status.textContent = `已读档 · ${payload.savedAt ? new Date(payload.savedAt).toLocaleString() : '本地存档'}`;
    } catch (e) {
      pendingSavePayload = '';
      console.error(e);
      ui.status.textContent = `读档失败：${e.message || e}`;
    }
  }

  function prepareMinigameSurface() {
    closeDialogue();
    ui.battle.classList.add('hidden');
    setScene('village');
    ui.scene.querySelector('.title-copy')?.remove();
    ui.actions.classList.add('hidden');
    ui.hud.classList.add('hidden');
    const canvas = window.JYRenderer?.ensureCanvas?.();
    window.JYRenderer?.resizeCanvas?.();
    if (!canvas?.isConnected) throw new Error('gcore canvas 未挂载到页面');
    fengari.load("return __jy_minigame_reset()", '@web/reset-minigame-before-start')();
    return canvas;
  }
  window.JYWeb = {
    reset: resetJsState,
    getSavePayload() { return pendingSavePayload; },
    legacyFilePath(scope, value) { return legacyVirtualPath(scope, value); },
    legacyFileExists(path) {
      try { return localStorage.getItem(legacyStorageKey(path)) !== null; }
      catch (_) { return false; }
    },
    legacyFileRead(path) {
      try { return localStorage.getItem(legacyStorageKey(path)); }
      catch (_) { return null; }
    },
    legacyFileWrite(path, data) {
      try {
        localStorage.setItem(legacyStorageKey(path), String(data ?? ''));
        return true;
      } catch (_) {
        return false;
      }
    },
    async startOriginalLogging(onProgress) {
      const progress = onProgress || ((message) => { ui.status.textContent = message; });
      prepareMinigameSurface();
      const loaded = await window.JYUpstream.prepareLoggingUI(progress);
      progress('伐木资源加载完成，正在启动原版程序…');
      const ok = fengari.load(
        "return __jy_minigame_start('logging')",
        '@web/start-original-logging'
      )();
      if (!ok) throw new Error('原 logging 程序启动失败');
      ui.status.textContent = '原版伐木程序运行中 · 点击画面中的开始';
      return loaded;
    },
    async startOriginalDig(onProgress) {
      const progress = onProgress || ((message) => { ui.status.textContent = message; });
      prepareMinigameSurface();
      const loaded = await window.JYUpstream.prepareDigUI(progress);
      progress('采矿资源加载完成，正在启动原版程序…');
      const ok = fengari.load(
        "return __jy_minigame_start('dig')",
        '@web/start-original-dig'
      )();
      if (!ok) throw new Error('原 dig 程序启动失败');
      ui.status.textContent = '原版采矿程序运行中 · 点击画面中的开始';
      return loaded;
    },
    async startOriginalFishing(onProgress) {
      const progress = onProgress || ((message) => { ui.status.textContent = message; });
      prepareMinigameSurface();
      const loaded = await window.JYUpstream.prepareFishingUI(progress);
      progress('钓鱼资源加载完成，正在启动原版程序…');
      const ok = fengari.load(
        "return __jy_minigame_start('fishing')",
        '@web/start-original-fishing'
      )();
      if (!ok) throw new Error('原 fishing 程序启动失败');
      ui.status.textContent = '原版钓鱼程序运行中 · 点击画面中的开始提竿';
      return loaded;
    },
    async startOriginalHunting(onProgress) {
      const progress = onProgress || ((message) => { ui.status.textContent = message; });
      prepareMinigameSurface();
      const loaded = await window.JYUpstream.prepareHuntingUI(progress);
      progress('打猎资源加载完成，正在启动原版程序…');
      const ok = fengari.load(
        "return __jy_minigame_start('hunting')",
        '@web/start-original-hunting'
      )();
      if (!ok) throw new Error('原 hunting 程序启动失败');
      ui.status.textContent = '原版打猎程序运行中 · 1/2 切换射箭/捕猎，点击猎物行动';
      return loaded;
    },
    async startOriginalGambling(onProgress) {
      const progress = onProgress || ((message) => { ui.status.textContent = message; });
      prepareMinigameSurface();
      const loaded = await window.JYUpstream.prepareGamblingUI(progress);
      progress('押宝资源加载完成，正在启动原版程序…');
      const ok = fengari.load(
        "return __jy_minigame_start('gambling')",
        '@web/start-original-gambling'
      )();
      if (!ok) throw new Error('原 gambling 程序启动失败');
      ui.status.textContent = '原版押宝程序运行中 · 选择单/双/小/大下注后点击中央骰子';
      return loaded;
    },
    startOriginalMinigame(name, resume) {
      const key = String(name || '');
      const starters = {
        logging: () => window.JYWeb.startOriginalLogging((message) => { ui.status.textContent = message; }),
        dig: () => window.JYWeb.startOriginalDig((message) => { ui.status.textContent = message; }),
        fishing: () => window.JYWeb.startOriginalFishing((message) => { ui.status.textContent = message; }),
        hunting: () => window.JYWeb.startOriginalHunting((message) => { ui.status.textContent = message; }),
        gambling: () => window.JYWeb.startOriginalGambling((message) => { ui.status.textContent = message; }),
      };
      const starter = starters[key];
      if (!starter || originalMinigameCallback) {
        if (typeof resume === 'function') setTimeout(() => resume(false), 0);
        return false;
      }
      originalMinigameCallback = typeof resume === 'function' ? resume : null;
      Promise.resolve()
        .then(starter)
        .catch((error) => {
          console.error('story mini-game start failed', error);
          ui.status.textContent = `原版小游戏启动失败：${error?.message || error}`;
          const cb = originalMinigameCallback;
          originalMinigameCallback = null;
          setTimeout(() => {
            try { fengari.load('return __jy_minigame_reset()', '@web/minigame-start-failed-reset')(); } catch (_) {}
            if (cb) cb(false);
          }, 0);
        });
      return true;
    },
    async prepareOriginalDialogue(onProgress) {
      const progress = onProgress || ((message) => { ui.status.textContent = message; });
      const loaded = await window.JYUpstream.prepareDialogueRuntime(progress);
      fengari.load('return __jy_dialogue_enable_original(true)', '@web/enable-original-dialogue')();
      ui.status.textContent = '原版对话/选择运行时已启用';
      return loaded;
    },
    async prepareOriginalStory(onProgress) {
      const progress = onProgress || ((message) => { ui.status.textContent = message; });
      const loaded = await window.JYUpstream.prepareStoryRuntime(progress);
      fengari.load('return __jy_dialogue_enable_original(true)', '@web/enable-original-story-dialogue')();
      ui.status.textContent = '基础世界/任务剧情运行时已启用';
      return loaded;
    },
    disableOriginalDialogue() {
      return fengari.load('return __jy_dialogue_enable_original(false)', '@web/disable-original-dialogue')();
    },
    async showLoggingUi(onProgress) {
      const progress = onProgress || ((message) => { ui.status.textContent = message; });
      const loaded = await window.JYUpstream.prepareLoggingUI(progress);
      const ok = fengari.load(
        "local G=require 'gf'; return G.addUI('v_logging') ~= nil",
        '@web/show-original-logging-ui'
      )();
      if (!ok) throw new Error('原 v_logging.lua 未能实例化');
      ui.status.textContent = '原版伐木 UI 已实例化';
      return loaded;
    },
    hideLoggingUi() {
      return fengari.load(
        "local G=require 'gf'; return G.removeUI('v_logging')",
        '@web/hide-original-logging-ui'
      )();
    },
    async prepareOriginalBattle(onProgress) {
      const loaded = await window.JYUpstream.prepareBattleRuntime(onProgress);
      fengari.load('return __jy_battle_enable_original(true)', '@web/enable-original-battle')();
      return loaded;
    },
    disableOriginalBattle() {
      return fengari.load('return __jy_battle_enable_original(false)', '@web/disable-original-battle')();
    },
    startOriginalBattle(...rawArgs) {
      const resume = typeof rawArgs[rawArgs.length - 1] === 'function' ? rawArgs.pop() : null;
      const args = rawArgs.slice(0, 13);
      while (args.length < 13) args.push(null);
      if (originalBattleStarting || originalBattleCallback) {
        console.warn('original battle already active');
        if (resume) setTimeout(() => resume(0), 0);
        return;
      }
      originalBattleStarting = true;
      originalBattleCallback = resume;
      ui.status.textContent = '按需加载原 p_battle.lua…';
      this.prepareOriginalBattle((message) => { ui.status.textContent = message; })
        .then(() => {
          const luaArgs = args.map(value => {
            if (value === null || value === undefined || value === '') return 'nil';
            const number = Number(value);
            return Number.isFinite(number) ? String(number) : 'nil';
          });
          ui.status.textContent = '原战斗状态机运行中';
          fengari.load(
            `return __jy_battle_browser_start(${luaArgs.join(',')})`,
            '@web/original-battle-start'
          )();
        })
        .catch(error => {
          console.error('original battle start failed', error);
          ui.status.textContent = `原战斗启动失败：${error?.message || error}`;
          const cb = originalBattleCallback;
          originalBattleCallback = null;
          originalBattleStarting = false;
          window.JYBattleView?.hide();
          if (cb) setTimeout(() => cb(0), 0);
        });
    },
    scheduleStoryProgramPump(delay, token) {
      const id = Number(token) || 0;
      const ms = Math.max(0, Number(delay) || 0);
      const run = () => {
        try {
          fengari.load(
            `return __jy_story_program_browser_pump(${id})`,
            '@web/story-program-pump'
          )();
        } catch (error) {
          console.error('story program scheduler failed', error);
          ui.status.textContent = `剧情后台调度错误：${error?.message || error}`;
        }
      };
      if (id > 0) {
        if (storyProgramPumpTimers.has(id)) return;
        const timer = setTimeout(() => {
          storyProgramPumpTimers.delete(id);
          run();
        }, ms);
        storyProgramPumpTimers.set(id, timer);
        return;
      }
      if (storyProgramReadyTimer !== null) return;
      storyProgramReadyTimer = setTimeout(() => {
        storyProgramReadyTimer = null;
        run();
      }, ms);
    },
    cancelStoryProgramPump(token) {
      const id = Number(token) || 0;
      if (id <= 0) return false;
      const timer = storyProgramPumpTimers.get(id);
      if (timer === undefined) return false;
      clearTimeout(timer);
      storyProgramPumpTimers.delete(id);
      return true;
    },
    scheduleProgramPump(delay, token) {
      const id = Number(token) || 0;
      const ms = Math.max(0, Number(delay) || 0);
      const run = () => {
        try {
          fengari.load(
            `return __jy_program_browser_pump(${id})`,
            '@web/minigame-program-pump'
          )();
        } catch (error) {
          console.error('minigame scheduler failed', error);
          ui.status.textContent = `小游戏调度错误：${error?.message || error}`;
        }
      };
      if (id > 0) {
        if (programPumpTimers.has(id)) return;
        const timer = setTimeout(() => {
          programPumpTimers.delete(id);
          run();
        }, ms);
        programPumpTimers.set(id, timer);
        return;
      }
      if (programReadyTimer !== null) return;
      programReadyTimer = setTimeout(() => {
        programReadyTimer = null;
        run();
      }, ms);
    },
    cancelProgramPump(token) {
      const id = Number(token) || 0;
      if (id <= 0) return false;
      const timer = programPumpTimers.get(id);
      if (timer === undefined) return false;
      clearTimeout(timer);
      programPumpTimers.delete(id);
      return true;
    },
    minigameFinished(name) {
      ui.status.textContent = `原版小游戏结束：${String(name || '')}`;
      if (ui.logging) ui.logging.disabled = false;
      if (ui.dig) ui.dig.disabled = false;
      if (ui.fishing) ui.fishing.disabled = false;
      if (ui.hunting) ui.hunting.disabled = false;
      if (ui.gambling) ui.gambling.disabled = false;
      const cb = originalMinigameCallback;
      originalMinigameCallback = null;
      setTimeout(() => {
        try {
          fengari.load('return __jy_minigame_reset()', '@web/minigame-reset')();
        } catch (error) {
          console.error('minigame cleanup failed', error);
        }
        if (cb) cb(true);
      }, 0);
    },
    scheduleBattlePump(delay) {
      if (battlePumpTimer !== null) return;
      const ms = Math.max(0, Math.min(80, Number(delay) || 0));
      battlePumpTimer = setTimeout(() => {
        battlePumpTimer = null;
        try {
          fengari.load('return __jy_battle_browser_pump()', '@web/battle-pump')();
        } catch (error) {
          console.error('battle scheduler failed', error);
          ui.status.textContent = `战斗调度错误：${error?.message || error}`;
          const cb = originalBattleCallback;
          originalBattleCallback = null;
          originalBattleStarting = false;
          window.JYBattleView?.end(2);
          if (cb) setTimeout(() => cb(2), 0);
        }
      }, ms);
    },
    originalBattleFinished(result) {
      const value = Number(result) || 0;
      state.lastBattle = value;
      window.JYBattleView?.end(value);
      const cb = originalBattleCallback;
      originalBattleCallback = null;
      originalBattleStarting = false;
      ui.status.textContent = value === 1 ? '原战斗结算完成：胜利' : value === 2 ? '原战斗结算完成：失败' : '原战斗结束';
      setTimeout(() => {
        window.JYBattleView?.hide();
        if (cb) cb(value);
      }, 420);
    },
    battleBegin(background, mode) { window.JYBattleView?.begin(background, mode); },
    battleSlot(position, id, name, hp, maxHp, mp, maxMp, charge, visible, enemy) {
      window.JYBattleView?.slot(position, id, name, hp, maxHp, mp, maxMp, charge, visible, enemy);
    },
    battleSlotAppearance(position, portraitId, standId, battleMaster, idleAction) {
      window.JYBattleView?.appearance(position, portraitId, standId, battleMaster, idleAction);
    },
    battleStatus(time, rage, maxRage, skillName, abnormal, result) {
      window.JYBattleView?.status(time, rage, maxRage, skillName, abnormal, result);
    },
    battleEffect(actor, target, damage) { window.JYBattleView?.effect(actor, target, damage); },
    battleEnd(result) { window.JYBattleView?.end(result); },
    battleSkillOption(slot, skillId, name, range, enabled, hotkey) {
      window.JYBattleView?.skillOption(slot, skillId, name, range, enabled, hotkey);
    },
    battleItemOption(slot, itemId, name, count, enabled, hotkey) {
      window.JYBattleView?.itemOption(slot, itemId, name, count, enabled, hotkey);
    },
    battleControls(autoEnabled, canInput, targetPending, canEscape) {
      window.JYBattleView?.controls(autoEnabled, canInput, targetPending, canEscape);
    },
    battleTargetPrompt(range) { window.JYBattleView?.targetPrompt(range); },
    battleDialogue(position, text, visible) {
      window.JYBattleView?.dialogue(position, text, visible);
    },
    battleSlotStatus(position, text, iconMask) {
      window.JYBattleView?.slotStatus(position, text, iconMask);
    },
    battleAction(position, actionId, kind, baseResourceId) {
      window.JYBattleView?.action(position, actionId, kind, baseResourceId);
    },
    originalBattleFrameEnd(position, actionId, kind) {
      const safePosition = JSON.stringify(String(position || ''));
      const safeKind = JSON.stringify(String(kind || ''));
      const id = Number(actionId) || 0;
      try {
        return fengari.load(
          `return __jy_battle_browser_frame_end(${safePosition},${id},${safeKind})`,
          '@web/battle-frame-end'
        )();
      } catch (error) {
        console.warn('battle frame-end bridge failed', error);
        return false;
      }
    },
    battleSkillEffect(name, actorPosition, target, skillCode) {
      window.JYBattleView?.skillEffect(name, actorPosition, target, skillCode);
    },
    battleAudio(resourceId, channel, loop, volume, routed) {
      window.JYBattleView?.audio(resourceId, channel, loop, volume, routed);
    },
    battleAudioStop(channel) { window.JYBattleView?.audioStop(channel); },
    setOriginalBattleAuto(enabled) {
      return fengari.load(`return __jy_battle_browser_set_auto(${enabled ? 'true' : 'false'})`, '@web/battle-auto')();
    },
    chooseOriginalBattleSkill(slot) {
      const n = Math.max(1, Math.min(8, Number(slot) || 0));
      return fengari.load(`return __jy_battle_browser_select_skill(${n})`, '@web/battle-skill')();
    },
    chooseOriginalBattleTarget(position) {
      const safe = JSON.stringify(String(position || ''));
      return fengari.load(`return __jy_battle_browser_select_target(${safe})`, '@web/battle-target')();
    },
    chooseOriginalBattleItem(slot) {
      const n = Math.max(1, Math.min(4, Number(slot) || 0));
      return fengari.load(`return __jy_battle_browser_select_item(${n})`, '@web/battle-item')();
    },
    originalBattleEscape() {
      return fengari.load('return __jy_battle_browser_escape()', '@web/battle-escape')();
    },
    setPoint(id, value) { state.points[Number(id)] = Number(value); renderStats(); },
    addPoint(id, delta) { id = Number(id); state.points[id] = (state.points[id] || 0) + Number(delta); renderStats(); },
    getPoint(id) { return state.points[Number(id)] || 0; },
    setMoney(value) { state.money = Number(value) || 0; renderStats(); return state.money; },
    addMoney(delta) { state.money += Number(delta); renderStats(); return state.money; },
    getMoney() { return state.money; },
    setItem(id, count) { state.items[String(id)] = Number(count) || 0; },
    getItem(id) { return state.items[String(id)] || 0; },
    addItem(id, count) { id = String(id); state.items[id] = (state.items[id] || 0) + Number(count); },
    learnMagic(_id) {
      // Compatibility notification only. Learned-skill ownership lives in original Lua o_skill objects.
      emitSkillChanged();
    },
    skillChanged() { emitSkillChanged(); },
    growthChanged() { emitGrowthChanged(); },
    relationshipChanged() { emitRelationshipChanged(); },
    setTeam(ids) {
      const next = [...ids].map(Number).filter(Boolean);
      const changed = next.length !== state.team.length || next.some((id, i) => state.team[i] !== id);
      state.team = next;
      if (changed) emitTeamChanged();
    },
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
        b.onclick = () => {
          const cb = modalCallback;
          modalCallback = null;
          closeDialogue();
          cb(idx + 1);
        };
        ui.options.appendChild(b);
      });
    },
    showShop(names, prices, resume) {
      const products = [...names].map((name, idx) => `${name}　${Number(prices[idx]) || 0} 两`);
      products.push('离开商店');
      this.showMenu('选择要购买的物品（当前 Web 商店一次购买 1 件）', products, (choice) => {
        resume(choice > products.length - 1 ? 0 : choice);
      });
    },
    startBattle(enemy, resume) {
      battleCallback = resume;
      // Display-only shell state. Character HP/MP/EXP/skills remain authoritative in original Lua objects.
      battleState = { displayPlayerHp:100, displayEnemyHp:92, enemyName: enemy || '对手' };
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
      const summary = Object.entries(labels)
        .filter(([k]) => state.points[k] !== undefined)
        .map(([k,v]) => `${v}：${state.points[k]}`).join('　');
      this.showTalk('人物属性', `${summary}\n银两：${state.money}　队友：${state.team.length ? state.team.join('、') : '无'}`, resume);
    }
  };

  function updateBattle() {
    const p = Math.max(0, battleState.displayPlayerHp), e = Math.max(0, battleState.displayEnemyHp);
    ui.playerBar.style.width = `${p}%`;
    ui.enemyBar.style.width = `${Math.min(100,e/92*100)}%`;
    ui.playerText.textContent = `${p} / 100`;
    ui.enemyText.textContent = `${e} / 92`;
  }

  ui.attack.onclick = () => {
    if (!battleState) return;
    const dmg = 13 + Math.floor(Math.random() * 14);
    battleState.displayEnemyHp -= dmg;
    if (battleState.displayEnemyHp <= 0) {
      battleState.displayEnemyHp = 0;
      updateBattle();
      ui.battleLog.textContent = `你造成 ${dmg} 点伤害，取胜。`;
      setTimeout(() => {
        ui.battle.classList.add('hidden');
        const cb = battleCallback;
        battleCallback = null;
        battleState = null;
        cb(1);
      }, 280);
      return;
    }
    const hurt = 7 + Math.floor(Math.random() * 12);
    battleState.displayPlayerHp -= hurt;
    updateBattle();
    if (battleState.displayPlayerHp <= 0) {
      battleState.displayPlayerHp = 0;
      updateBattle();
      ui.battleLog.textContent = `你造成 ${dmg} 点伤害，但随后落败。`;
      setTimeout(() => {
        ui.battle.classList.add('hidden');
        const cb = battleCallback;
        battleCallback = null;
        battleState = null;
        cb(0);
      }, 280);
    } else {
      ui.battleLog.textContent = `你造成 ${dmg} 点伤害；${battleState.enemyName} 反击 ${hurt} 点。`;
    }
  };

  ui.cont.onclick = () => {
    const cb = modalCallback;
    modalCallback = null;
    closeDialogue();
    if (cb) cb(true);
  };

  function runEvent(name) {
    try {
      fengari.load(`return __jy_run(${JSON.stringify(name)})`, 'event-launcher')();
    } catch (e) {
      console.error(e);
      ui.status.textContent = 'Lua 事件错误';
      window.alert(String(e));
    }
  }

  function freshRun(eventName) {
    resetJsState();
    resetLuaState();
    runEvent(eventName);
  }

  async function boot() {
    resetJsState();
    if (!window.fengari) {
      ui.status.textContent = 'Fengari 加载失败（需要网络）';
      return;
    }

    try {
      const [compat, shims, programRuntime, storyProgramCompat, minigameCompat, battleCompat, saveState, demo] = await Promise.all([
        fetch('./lua/gf_web.lua').then(r => { if (!r.ok) throw new Error('gf_web.lua'); return r.text(); }),
        fetch('./lua/runtime_shims.lua').then(r => { if (!r.ok) throw new Error('runtime_shims.lua'); return r.text(); }),
        fetch('./lua/program_runtime.lua').then(r => { if (!r.ok) throw new Error('program_runtime.lua'); return r.text(); }),
        fetch('./lua/story_program_web.lua').then(r => { if (!r.ok) throw new Error('story_program_web.lua'); return r.text(); }),
        fetch('./lua/minigame_web.lua').then(r => { if (!r.ok) throw new Error('minigame_web.lua'); return r.text(); }),
        fetch('./lua/battle_web.lua').then(r => { if (!r.ok) throw new Error('battle_web.lua'); return r.text(); }),
        fetch('./lua/save_state.lua').then(r => { if (!r.ok) throw new Error('save_state.lua'); return r.text(); }),
        fetch('./lua/jy3_demo.lua').then(r => { if (!r.ok) throw new Error('jy3_demo.lua'); return r.text(); })
      ]);

      fengari.load(compat, '@gf_web.lua')();
      fengari.load(shims, '@runtime_shims.lua')();
      fengari.load(
        'package.preload["program_runtime"] = function(...)\n' + programRuntime + '\nend',
        '@program_runtime.preload.lua'
      )();
      fengari.load(storyProgramCompat, '@story_program_web.lua')();
      fengari.load(minigameCompat, '@minigame_web.lua')();
      fengari.load(battleCompat, '@battle_web.lua')();
      fengari.load(saveState, '@save_state.lua')();
      fengari.load(demo, '@jy3_demo.lua')();

      try {
        const loaded = await window.JYUpstream.bootstrapData((message) => { ui.status.textContent = message; });
        originalProgramLoaded = loaded.loadedPrograms === window.JYUpstream.CORE_PROGRAMS.length;
        const story = await window.JYUpstream.prepareStoryRuntime((message) => { ui.status.textContent = message; });
        ui.status.textContent = `原始数据 ${loaded.loadedModules} 组 / 核心程序 ${loaded.loadedPrograms} 个 / 基础剧情 ${story.programs.length} 个已就绪`;
      } catch (dataError) {
        console.warn('upstream data bootstrap failed', dataError);
        originalProgramLoaded = false;
        ui.status.textContent = '原数据加载失败，进入兼容层降级模式';
      }

      ui.start.disabled = false;
      ui.village.disabled = false;
      ui.original.disabled = false;
      if (ui.logging) ui.logging.disabled = false;
      if (ui.dig) ui.dig.disabled = false;
      if (ui.fishing) ui.fishing.disabled = false;
      if (ui.hunting) ui.hunting.disabled = false;
      if (ui.gambling) ui.gambling.disabled = false;
      if (ui.save) ui.save.disabled = false;
      refreshLoadButton();
      ui.start.textContent = originalProgramLoaded ? '开始原版开局' : '开始兼容层验证';
      ui.village.textContent = originalProgramLoaded ? '进入原版牛家村事件测试' : '直接进入牛家村测试';

      ui.start.onclick = () => freshRun('回答问题');
      ui.village.onclick = () => {
        resetJsState();
        resetLuaState();
        window.JYWeb.enterVillage();
      };
      if (ui.logging) ui.logging.onclick = async () => {
        ui.logging.disabled = true;
        try {
          resetJsState();
          resetLuaState();
          await window.JYWeb.startOriginalLogging((message) => { ui.status.textContent = message; });
        } catch (error) {
          console.error('logging mini-game start failed', error);
          ui.status.textContent = `伐木小游戏启动失败：${error?.message || error}`;
          ui.logging.disabled = false;
        }
      };
      if (ui.dig) ui.dig.onclick = async () => {
        ui.dig.disabled = true;
        try {
          resetJsState();
          resetLuaState();
          await window.JYWeb.startOriginalDig((message) => { ui.status.textContent = message; });
        } catch (error) {
          console.error('dig mini-game start failed', error);
          ui.status.textContent = `采矿小游戏启动失败：${error?.message || error}`;
          ui.dig.disabled = false;
        }
      };
      if (ui.fishing) ui.fishing.onclick = async () => {
        ui.fishing.disabled = true;
        try {
          resetJsState();
          resetLuaState();
          await window.JYWeb.startOriginalFishing((message) => { ui.status.textContent = message; });
        } catch (error) {
          console.error('fishing mini-game start failed', error);
          ui.status.textContent = `钓鱼小游戏启动失败：${error?.message || error}`;
          ui.fishing.disabled = false;
        }
      };
      if (ui.hunting) ui.hunting.onclick = async () => {
        ui.hunting.disabled = true;
        try {
          resetJsState();
          resetLuaState();
          await window.JYWeb.startOriginalHunting((message) => { ui.status.textContent = message; });
        } catch (error) {
          console.error('hunting mini-game start failed', error);
          ui.status.textContent = `打猎小游戏启动失败：${error?.message || error}`;
          ui.hunting.disabled = false;
        }
      };
      if (ui.gambling) ui.gambling.onclick = async () => {
        ui.gambling.disabled = true;
        try {
          resetJsState();
          resetLuaState();
          await window.JYWeb.startOriginalGambling((message) => { ui.status.textContent = message; });
        } catch (error) {
          console.error('gambling mini-game start failed', error);
          ui.status.textContent = `押宝小游戏启动失败：${error?.message || error}`;
          ui.gambling.disabled = false;
        }
      };
      if (ui.save) ui.save.onclick = saveGame;
      if (ui.load) ui.load.onclick = loadGame;

      ui.original.onclick = async () => {
        ui.original.disabled = true;
        ui.status.textContent = originalProgramLoaded ? '重置原版开局…' : '加载原 p_newgame.lua…';
        try {
          if (!originalProgramLoaded) {
            await window.JYUpstream.loadProgram('04_program/p_newgame.lua');
          }
          ui.status.textContent = '原 p_newgame.lua 已载入';
          freshRun('回答问题');
        } catch (e) {
          console.error(e);
          ui.status.textContent = '原脚本遇到尚未兼容的 API';
          const missing = (() => {
            try { return fengari.load('return __jy_missing_calls()', '@web/missing-calls')(); }
            catch (_) { return ''; }
          })();
          window.JYWeb.showTalk('兼容层', `原脚本当前停止于：${e.message || e}${missing ? `\n缺失调用：${missing}` : ''}`, () => {});
        } finally {
          ui.original.disabled = false;
        }
      };

      $$('.village-actions button').forEach(b => b.onclick = () => runEvent(b.dataset.event));
    } catch (e) {
      console.error(e);
      ui.status.textContent = '启动失败：请使用本地 HTTP 服务';
    }
  }

  boot();
})();
