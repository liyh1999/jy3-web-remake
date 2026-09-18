(() => {
  const positions = ['team1','team2','team3','team4','team5','enemy1','enemy2','enemy3','enemy4','enemy5','enemy6'];
  const slotState = new Map();
  const skillState = new Map();
  const itemState = new Map();
  let controlsState = { autoEnabled: true, canInput: false, targetPending: false, canEscape: false };

  const $ = id => document.getElementById(id);
  const pct = (value, max) => {
    const n = Number(value) || 0;
    const m = Math.max(1, Number(max) || 1);
    return Math.max(0, Math.min(100, n / m * 100));
  };

  const battleAnimationPositions = [...positions, 'all1', 'all2', 'all3', 'all'];
  const animationKey = (kind, position) => `battle:${kind}:${position}`;

  function stopBattleAnimations() {
    for (const position of battleAnimationPositions) {
      window.JYFramePlayer?.stop?.(animationKey('actor', position), 'battle-reset');
      window.JYFramePlayer?.stop?.(animationKey('skill', position), 'battle-reset');
      window.JYFramePlayer?.stop?.(animationKey('overlay', position), 'battle-reset');
    }
  }

  function sequenceImage(position, kind) {
    if (kind === 'actor') {
      return $(`battleSlot-${position}`)?.querySelector('.battle-slot-sprite') || null;
    }
    const layer = $('battleEffectLayer');
    if (!layer) return null;
    const key = animationKey(kind, position);
    let image = layer.querySelector(`img[data-animation-key="${key}"]`);
    if (!image) {
      image = document.createElement('img');
      image.className = `battle-sequence battle-sequence-${kind}`;
      image.dataset.animationKey = key;
      image.dataset.position = String(position || '');
      image.alt = '';
      layer.appendChild(image);
    }
    return image;
  }

  function playSequence(position, actionId, kind, baseResourceId) {
    const player = window.JYFramePlayer;
    const base = Number(baseResourceId) >>> 0;
    if (!player?.play || !base) return false;
    const image = sequenceImage(position, kind);
    if (!image) return false;

    const id = Number(actionId) || 0;
    const actorLoop = kind === 'actor' && id < 1000;
    const key = animationKey(kind, position);
    image.dataset.actionId = String(id);
    image.dataset.baseResourceId = `0x${base.toString(16).padStart(8, '0')}`;
    image.classList.add('active');

    player.play(key, {
      baseResourceId: base,
      actionId: id,
      loop: actorLoop,
      onFrame(frame, meta) {
        const url = frame.url || window.JYResources?.url?.(frame.id);
        if (url) image.src = url;
        image.dataset.frameId = `0x${(Number(frame.id) >>> 0).toString(16).padStart(8, '0')}`;
        image.dataset.frameIndex = String(meta.index);
        image.dataset.cycle = String(meta.cycle);
      },
      onFrameEnd() {
        if (kind === 'actor' && !actorLoop) {
          window.JYWeb?.originalBattleFrameEnd?.(position, id, kind);
        }
      },
      onComplete() {
        image.classList.remove('active');
      },
      onError(error) {
        image.dataset.animationError = String(error?.message || error || 'load failed');
        image.classList.remove('active');
      },
    });
    return true;
  }

  function ensureSlots() {
    const allies = $('battleAllies');
    const enemies = $('battleEnemies');
    if (!allies || !enemies || allies.children.length || enemies.children.length) return;
    positions.forEach((position, index) => {
      const node = document.createElement('article');
      node.id = `battleSlot-${position}`;
      node.className = `battle-slot ${index >= 5 ? 'enemy' : 'ally'} hidden`;
      node.dataset.position = position;
      node.innerHTML = `
        <img class="battle-slot-sprite" alt="">
        <div class="battle-slot-head">
          <img class="battle-slot-portrait" alt="">
          <strong class="battle-slot-name">${position}</strong>
          <span class="battle-slot-id"></span>
        </div>
        <div class="battle-meter hp"><i></i></div>
        <div class="battle-meter mp"><i></i></div>
        <div class="battle-charge"><i></i></div>
        <div class="battle-slot-numbers"><span class="hp-text">0 / 0</span><span class="mp-text">0 / 0</span></div>
        <div class="battle-slot-status"></div>
        <div class="battle-slot-talk hidden"></div>
      `;
      if (index >= 5) {
        node.addEventListener('click', () => {
          if (!controlsState.targetPending || !slotState.get(position)?.visible || slotState.get(position)?.hp <= 0) return;
          window.JYWeb?.chooseOriginalBattleTarget?.(position);
        });
      }
      (index >= 5 ? enemies : allies).appendChild(node);
    });
  }

  function ensureSkills() {
    const host = $('battleSkills');
    if (!host || host.children.length) return;
    for (let slot = 1; slot <= 8; slot += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'battle-skill';
      button.dataset.slot = String(slot);
      button.innerHTML = `<kbd>${slot}</kbd><span>空</span><small></small>`;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        window.JYWeb?.chooseOriginalBattleSkill?.(slot);
      });
      host.appendChild(button);
    }
  }

  function ensureItems() {
    const host = $('battleItems');
    if (!host || host.children.length) return;
    ['q','w','e','r'].forEach((key, index) => {
      const slot = index + 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'battle-item';
      button.dataset.slot = String(slot);
      button.innerHTML = `<kbd>${key.toUpperCase()}</kbd><span>空</span><small></small>`;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        window.JYWeb?.chooseOriginalBattleItem?.(slot);
      });
      host.appendChild(button);
    });
  }

  function begin(background, mode) {
    ensureSlots();
    ensureSkills();
    ensureItems();
    bindControls();
    stopBattleAnimations();
    slotState.clear();
    skillState.clear();
    itemState.clear();
    const panel = $('battle');
    panel?.classList.remove('hidden');
    if ($('battleTitle')) $('battleTitle').textContent = Number(mode) === 1 ? '单挑战斗' : '战斗';
    if ($('battleMeta')) $('battleMeta').textContent = `地图 ${Number(background) || 0} · 模式 ${Number(mode) || 0}`;
    if ($('battleResult')) $('battleResult').textContent = '';
    if ($('battleLog')) $('battleLog').textContent = '原 p_battle.lua 已接管战斗流程。';
    if ($('battleEffectLayer')) $('battleEffectLayer').innerHTML = '';
    if ($('battleAbnormal')) $('battleAbnormal').textContent = '无';
    if ($('battleSkillName')) $('battleSkillName').textContent = '等待集气';
    if ($('battleTime')) $('battleTime').textContent = '00:00:00';
    if ($('battleRageText')) $('battleRageText').textContent = '0 / 100';
    if ($('battleRageBar')) $('battleRageBar').style.width = '0%';
    positions.forEach(position => {
      const node = $(`battleSlot-${position}`);
      node?.classList.remove('acting','skill-flash','down');
      const sprite = node?.querySelector('.battle-slot-sprite');
      if (sprite) {
        sprite.removeAttribute('src');
        sprite.classList.remove('active');
        sprite.dataset.actionId = '';
        sprite.dataset.frameId = '';
      }
      const portrait = node?.querySelector('.battle-slot-portrait');
      if (portrait) {
        portrait.removeAttribute('src');
        portrait.classList.add('missing');
        portrait.dataset.resourceId = '';
      }
      if (node) {
        node.dataset.standResourceId = '';
        node.dataset.battleMaster = '';
        node.dataset.idleAction = '';
      }
      const statusNode = node?.querySelector('.battle-slot-status');
      if (statusNode) statusNode.textContent = '';
      const talkNode = node?.querySelector('.battle-slot-talk');
      if (talkNode) {
        talkNode.textContent = '';
        talkNode.classList.add('hidden');
      }
    });
  }

  function slot(position, id, name, hp, maxHp, mp, maxMp, charge, visible, enemy) {
    ensureSlots();
    const node = $(`battleSlot-${position}`);
    if (!node) return;
    const data = {
      position,
      id: Number(id) || 0,
      name: String(name || ''),
      hp: Number(hp) || 0,
      maxHp: Math.max(1, Number(maxHp) || 1),
      mp: Number(mp) || 0,
      maxMp: Math.max(1, Number(maxMp) || 1),
      charge: Number(charge) || 0,
      visible: Boolean(visible),
      enemy: Boolean(enemy)
    };
    slotState.set(position, data);

    node.classList.toggle('hidden', !data.visible);
    node.classList.toggle('dead', data.visible && data.hp <= 0);
    node.classList.toggle('ready', data.charge >= 150);
    node.querySelector('.battle-slot-name').textContent = data.name || position;
    node.querySelector('.battle-slot-id').textContent = data.id ? `#${data.id}` : '主角';
    node.querySelector('.battle-meter.hp i').style.width = `${pct(data.hp, data.maxHp)}%`;
    node.querySelector('.battle-meter.mp i').style.width = `${pct(data.mp, data.maxMp)}%`;
    node.querySelector('.battle-charge i').style.width = `${Math.max(0, Math.min(100, data.charge / 330 * 100))}%`;
    node.querySelector('.hp-text').textContent = `${Math.max(0, Math.floor(data.hp))} / ${Math.floor(data.maxHp)}`;
    node.querySelector('.mp-text').textContent = `${Math.max(0, Math.floor(data.mp))} / ${Math.floor(data.maxMp)}`;

    if (position === 'team1') {
      if ($('playerHpBar')) $('playerHpBar').style.width = `${pct(data.hp, data.maxHp)}%`;
      if ($('playerHpText')) $('playerHpText').textContent = `${Math.max(0, Math.floor(data.hp))} / ${Math.floor(data.maxHp)}`;
    } else if (position === 'enemy1') {
      if ($('enemyName')) $('enemyName').textContent = data.name || '敌人';
      if ($('enemyHpBar')) $('enemyHpBar').style.width = `${pct(data.hp, data.maxHp)}%`;
      if ($('enemyHpText')) $('enemyHpText').textContent = `${Math.max(0, Math.floor(data.hp))} / ${Math.floor(data.maxHp)}`;
    }
    node.classList.toggle('targetable', controlsState.targetPending && data.enemy && data.visible && data.hp > 0);
  }

  function appearance(position, portraitId, standId, battleMaster, idleAction) {
    ensureSlots();
    const node = $(`battleSlot-${position}`);
    if (!node) return;
    const portrait = node.querySelector('.battle-slot-portrait');
    const id = Number(portraitId) >>> 0;
    const url = id ? window.JYResources?.url?.(id) : null;
    if (portrait) {
      portrait.src = url || '';
      portrait.classList.toggle('missing', !url);
      portrait.alt = url ? `${node.querySelector('.battle-slot-name')?.textContent || position}头像` : '';
      portrait.dataset.resourceId = id ? `0x${id.toString(16).padStart(8, '0')}` : '';
    }
    node.dataset.standResourceId = (Number(standId) >>> 0)
      ? `0x${(Number(standId) >>> 0).toString(16).padStart(8, '0')}`
      : '';
    node.dataset.battleMaster = (Number(battleMaster) >>> 0)
      ? `0x${(Number(battleMaster) >>> 0).toString(16).padStart(8, '0')}`
      : '';
    node.dataset.idleAction = String(Number(idleAction) || 0);
  }

  function status(time, rage, maxRage, skillName, abnormal, result) {
    if ($('battleTime')) $('battleTime').textContent = String(time || '00:00:00');
    if ($('battleSkillName')) $('battleSkillName').textContent = String(skillName || '等待集气');
    if ($('battleAbnormal')) $('battleAbnormal').textContent = String(abnormal || '无').replace(/\[[^\]]+\]/g, '');
    if ($('battleRageText')) $('battleRageText').textContent = `${Math.floor(Number(rage) || 0)} / ${Math.max(1, Math.floor(Number(maxRage) || 100))}`;
    if ($('battleRageBar')) $('battleRageBar').style.width = `${pct(rage, maxRage)}%`;
    if (Number(result) === 1 && $('battleResult')) $('battleResult').textContent = '胜利';
    if (Number(result) === 2 && $('battleResult')) $('battleResult').textContent = '失败';
  }

  function effect(actor, target, damage) {
    const total = Math.max(0, Math.floor(Number(damage) || 0));
    const targetPos = positions[Math.max(0, Math.min(positions.length - 1, (Number(target) || 1) - 1))];
    const node = $(`battleSlot-${targetPos}`);
    if (node) {
      node.classList.remove('impact');
      void node.offsetWidth;
      node.classList.add('impact');
    }
    if (total > 0) {
      const layer = $('battleEffectLayer');
      if (layer) {
        const text = document.createElement('span');
        text.className = 'battle-float';
        text.textContent = `-${total}`;
        text.dataset.target = targetPos;
        layer.appendChild(text);
        setTimeout(() => text.remove(), 700);
      }
      if ($('battleLog')) $('battleLog').textContent = `${Number(actor) === 1 ? '主角' : '角色'} 出手，造成 ${total} 点伤害。`;
    }
  }

  function dialogue(position, text, visible) {
    const node = $(`battleSlot-${position}`);
    const bubble = node?.querySelector('.battle-slot-talk');
    if (!bubble) return;
    const message = String(text || '').replace(/\[[^\]]+\]/g, '').trim();
    bubble.textContent = message;
    bubble.classList.toggle('hidden', !Boolean(visible) || !message);
  }

  function slotStatus(position, text, iconMask) {
    const node = $(`battleSlot-${position}`);
    const statusNode = node?.querySelector('.battle-slot-status');
    if (!statusNode) return;
    const clean = String(text || '').replace(/\[[^\]]+\]/g, '').trim();
    statusNode.textContent = clean;
    statusNode.dataset.iconMask = String(Number(iconMask) || 0);
    statusNode.classList.toggle('active', Boolean(clean) || Number(iconMask) > 0);
  }

  function action(position, actionId, kind, baseResourceId) {
    const node = $(`battleSlot-${position}`);
    const id = Number(actionId) || 0;
    const type = String(kind || 'actor');
    if (node) {
      if (id === 9002 || id === 9001) node.classList.add('down');
      if (type === 'actor') {
        node.classList.remove('acting');
        void node.offsetWidth;
        node.classList.add('acting');
        setTimeout(() => node.classList.remove('acting'), 360);
      } else if (type === 'skill') {
        node.classList.remove('skill-flash');
        void node.offsetWidth;
        node.classList.add('skill-flash');
        setTimeout(() => node.classList.remove('skill-flash'), 420);
      }
      node.dataset.actionId = String(id);
    }
    playSequence(position, id, type, baseResourceId);
  }

  function skillEffect(name, actorPosition, target, skillCode) {
    const skillName = String(name || '').trim();
    if (skillName && $('battleSkillName')) $('battleSkillName').textContent = skillName;
    const layer = $('battleEffectLayer');
    if (layer && skillName) {
      const tag = document.createElement('span');
      tag.className = 'battle-skill-flash';
      tag.textContent = skillName;
      tag.dataset.actor = String(actorPosition || '');
      tag.dataset.target = String(target ?? '');
      tag.dataset.skill = String(Number(skillCode) || 0);
      layer.appendChild(tag);
      setTimeout(() => tag.remove(), 650);
    }
  }

  function audio(resourceId, channel, loop, volume, routed) {
    const meta = $('battleMeta');
    if (!meta) return;
    const id = Number(resourceId) >>> 0;
    const hex = `0x${id.toString(16).padStart(8,'0')}`;
    meta.dataset.audio = hex;
    meta.dataset.audioChannel = String(Number(channel) || 1);
    meta.dataset.audioLoop = Boolean(loop) ? '1' : '0';
    meta.dataset.audioVolume = String(Number(volume) || 1);
    meta.dataset.audioRouted = Boolean(routed) ? '1' : '0';
  }

  function audioStop(channel) {
    const meta = $('battleMeta');
    if (!meta) return;
    meta.dataset.audioStopped = String(Number(channel) || 1);
  }
  function rangeLabel(range) {
    return ({0:'自身',1:'辅助',2:'单体',3:'横排',4:'纵列',5:'全体'})[Number(range)] || `范围${Number(range) || 0}`;
  }

  function skillOption(slot, skillId, name, range, enabled, hotkey) {
    ensureSkills();
    const n = Number(slot) || 0;
    const data = { slot:n, skillId:Number(skillId)||0, name:String(name||''), range:Number(range)||0, enabled:Boolean(enabled), hotkey:String(hotkey||n) };
    skillState.set(n, data);
    const button = $('battleSkills')?.querySelector(`button[data-slot="${n}"]`);
    if (!button) return;
    button.disabled = !data.enabled;
    button.classList.toggle('empty', !data.skillId);
    button.querySelector('kbd').textContent = data.hotkey;
    button.querySelector('span').textContent = data.name || '空';
    button.querySelector('small').textContent = data.skillId ? rangeLabel(data.range) : '';
  }

  function itemOption(slot, itemId, name, count, enabled, hotkey) {
    ensureItems();
    const n = Number(slot) || 0;
    const data = { slot:n, itemId:Number(itemId)||0, name:String(name||''), count:Number(count)||0, enabled:Boolean(enabled), hotkey:String(hotkey||'') };
    itemState.set(n, data);
    const button = $('battleItems')?.querySelector(`button[data-slot="${n}"]`);
    if (!button) return;
    button.disabled = !data.enabled;
    button.classList.toggle('empty', !data.itemId);
    button.querySelector('kbd').textContent = data.hotkey.toUpperCase();
    button.querySelector('span').textContent = data.name || '空';
    button.querySelector('small').textContent = data.itemId ? `×${data.count}` : '';
  }

  function controls(autoEnabled, canInput, targetPending, canEscape) {
    controlsState = {
      autoEnabled: Boolean(autoEnabled),
      canInput: Boolean(canInput),
      targetPending: Boolean(targetPending),
      canEscape: Boolean(canEscape)
    };
    const auto = $('battleAutoBtn');
    if (auto) {
      auto.textContent = `自动：${controlsState.autoEnabled ? '开' : '关'}`;
      auto.classList.toggle('active', controlsState.autoEnabled);
    }
    const escape = $('battleEscapeBtn');
    if (escape) escape.disabled = !controlsState.canEscape;
    const hint = $('battleTargetHint');
    if (hint && !controlsState.targetPending) {
      hint.textContent = controlsState.autoEnabled ? '自动战斗中' : controlsState.canInput ? '选择武功（1–8）' : '等待行动';
    }
    positions.slice(5).forEach(position => {
      const node = $(`battleSlot-${position}`);
      const data = slotState.get(position);
      node?.classList.toggle('targetable', controlsState.targetPending && Boolean(data?.visible) && Number(data?.hp) > 0);
    });
  }

  function targetPrompt(range) {
    controlsState.targetPending = Number(range) > 0;
    const hint = $('battleTargetHint');
    if (!hint) return;
    if (!controlsState.targetPending) {
      hint.textContent = controlsState.autoEnabled ? '自动战斗中' : '等待行动';
      return;
    }
    hint.textContent = `请选择敌方目标 · ${rangeLabel(range)}`;
  }

  function bindControls() {
    const auto = $('battleAutoBtn');
    if (auto && !auto.dataset.bound) {
      auto.dataset.bound = '1';
      auto.addEventListener('click', () => window.JYWeb?.setOriginalBattleAuto?.(!controlsState.autoEnabled));
    }
    const escape = $('battleEscapeBtn');
    if (escape && !escape.dataset.bound) {
      escape.dataset.bound = '1';
      escape.addEventListener('click', () => window.JYWeb?.originalBattleEscape?.());
    }
  }

  function end(result) {
    const win = Number(result) === 1;
    if ($('battleResult')) $('battleResult').textContent = win ? '胜利' : Number(result) === 2 ? '失败' : '战斗结束';
    if ($('battleLog')) $('battleLog').textContent = win ? '战斗胜利，正在结算原版经验与熟练度。' : '战斗结束，正在返回原剧情。';
  }

  function hide() {
    stopBattleAnimations();
    $('battleEffectLayer')?.querySelectorAll?.('.battle-sequence')?.forEach?.(node => node.remove());
    $('battle')?.classList.add('hidden');
  }

  document.addEventListener('keydown', event => {
    if ($('battle')?.classList.contains('hidden')) return;
    if (/^[1-8]$/.test(event.key)) {
      const slot = Number(event.key);
      if (skillState.get(slot)?.enabled) {
        event.preventDefault();
        window.JYWeb?.chooseOriginalBattleSkill?.(slot);
      }
    } else if (/^[qwer]$/i.test(event.key)) {
      const slot = ({q:1,w:2,e:3,r:4})[event.key.toLowerCase()];
      if (itemState.get(slot)?.enabled) {
        event.preventDefault();
        window.JYWeb?.chooseOriginalBattleItem?.(slot);
      }
    } else if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      window.JYWeb?.setOriginalBattleAuto?.(!controlsState.autoEnabled);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      window.JYWeb?.originalBattleEscape?.();
    }
  });

  window.JYBattleView = Object.freeze({
    begin, slot, appearance, status, effect, dialogue, slotStatus, action, skillEffect, audio, audioStop,
    skillOption, itemOption, controls, targetPrompt, end, hide,
    positions: Object.freeze([...positions])
  });
})();
