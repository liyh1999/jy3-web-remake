(() => {
  const positions = ['team1','team2','team3','team4','team5','enemy1','enemy2','enemy3','enemy4','enemy5','enemy6'];
  const slotState = new Map();

  const $ = id => document.getElementById(id);
  const pct = (value, max) => {
    const n = Number(value) || 0;
    const m = Math.max(1, Number(max) || 1);
    return Math.max(0, Math.min(100, n / m * 100));
  };

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
        <div class="battle-slot-head">
          <strong class="battle-slot-name">${position}</strong>
          <span class="battle-slot-id"></span>
        </div>
        <div class="battle-meter hp"><i></i></div>
        <div class="battle-meter mp"><i></i></div>
        <div class="battle-charge"><i></i></div>
        <div class="battle-slot-numbers"><span class="hp-text">0 / 0</span><span class="mp-text">0 / 0</span></div>
      `;
      (index >= 5 ? enemies : allies).appendChild(node);
    });
  }

  function begin(background, mode) {
    ensureSlots();
    slotState.clear();
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

  function end(result) {
    const win = Number(result) === 1;
    if ($('battleResult')) $('battleResult').textContent = win ? '胜利' : Number(result) === 2 ? '失败' : '战斗结束';
    if ($('battleLog')) $('battleLog').textContent = win ? '战斗胜利，正在结算原版经验与熟练度。' : '战斗结束，正在返回原剧情。';
  }

  function hide() {
    $('battle')?.classList.add('hidden');
  }

  window.JYBattleView = Object.freeze({ begin, slot, status, effect, end, hide, positions: Object.freeze([...positions]) });
})();
