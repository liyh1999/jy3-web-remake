(() => {
  const $ = (selector) => document.querySelector(selector);
  const model = {
    name: '', nickname: '', school: '', rank: '', master: '', portrait: 0,
    vitals: [], qualities: [], slots: [], skills: [], team: []
  };
  let installed = false;
  let activeTeamMember = null;

  function runLua(source, name = '@web/person') {
    return fengari.load(source, name)();
  }

  function resourceUrl(id) {
    return Number(id) ? window.JYResources?.url(Number(id)) : null;
  }

  function renderHeader() {
    const portrait = $('#personPortrait');
    const url = resourceUrl(model.portrait);
    if (portrait) {
      portrait.innerHTML = '';
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = model.name;
        portrait.appendChild(img);
      } else {
        portrait.textContent = '侠';
      }
    }
    if ($('#personName')) $('#personName').textContent = model.name || '无名侠客';
    if ($('#personNickname')) $('#personNickname').textContent = model.nickname || '无绰号';
    if ($('#personSchool')) $('#personSchool').textContent = model.school || '无门派';
    if ($('#personRank')) $('#personRank').textContent = model.rank || '—';
    if ($('#personMaster')) $('#personMaster').textContent = model.master || '—';
  }

  function renderRows(rootSelector, rows, className) {
    const root = $(rootSelector);
    if (!root) return;
    root.innerHTML = '';
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = className;
      const label = document.createElement('span');
      label.textContent = row.label;
      const value = document.createElement('b');
      value.textContent = row.max > 0 ? `${row.value} / ${row.max}` : String(row.value);
      item.append(label, value);
      root.appendChild(item);
    }
  }

  function renderSlots() {
    const root = $('#personSlots');
    if (!root) return;
    root.innerHTML = '';
    for (const slot of model.slots) {
      const item = document.createElement('div');
      item.className = `person-slot${slot.id ? ' equipped' : ''}`;
      const icon = document.createElement('div');
      icon.className = 'person-slot-icon';
      const url = resourceUrl(slot.icon);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        icon.appendChild(img);
      } else {
        icon.textContent = slot.id ? '装' : '—';
      }
      const text = document.createElement('div');
      const label = document.createElement('span');
      label.textContent = slot.label;
      const name = document.createElement('b');
      name.textContent = slot.name || '未装备';
      text.append(label, name);
      item.append(icon, text);
      root.appendChild(item);
    }
  }

  function progressText(exp, full) {
    if (full > 0) return `${exp} / ${full}`;
    return String(exp);
  }

  function renderSkills() {
    const root = $('#personSkills');
    if (!root) return;
    root.innerHTML = '';
    if (!model.skills.length) {
      root.innerHTML = '<div class="person-empty">尚未习得武功</div>';
      return;
    }
    for (const skill of model.skills) {
      const row = document.createElement('div');
      row.className = 'person-skill';
      const icon = document.createElement('div');
      icon.className = 'person-skill-icon';
      const url = resourceUrl(skill.icon);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        icon.appendChild(img);
      } else {
        icon.textContent = '武';
      }
      const main = document.createElement('div');
      main.className = 'person-skill-main';
      const title = document.createElement('b');
      title.textContent = skill.name;
      const meta = document.createElement('span');
      const cultivation = skill.cultivation > 0 ? ` · 修为 ${skill.cultivation}` : '';
      meta.textContent = `${skill.categoryName} · ${skill.level}级${cultivation}`;
      const exp = document.createElement('small');
      exp.textContent = `熟练度 ${progressText(skill.exp, skill.full)}`;
      main.append(title, meta, exp);
      row.append(icon, main);
      root.appendChild(row);
    }
  }

  function renderTeam() {
    const root = $('#personTeam');
    const count = $('#personTeamCount');
    if (!root) return;
    root.innerHTML = '';
    if (count) count.textContent = `${model.team.length} / 12`;
    if (!model.team.length) {
      root.innerHTML = '<div class="person-empty">当前没有队友</div>';
      return;
    }
    for (const member of model.team) {
      const card = document.createElement('article');
      card.className = 'person-team-card';

      const portrait = document.createElement('div');
      portrait.className = 'person-team-portrait';
      const url = resourceUrl(member.portrait);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = member.name;
        portrait.appendChild(img);
      } else {
        portrait.textContent = String(member.slot);
      }

      const body = document.createElement('div');
      body.className = 'person-team-body';
      const head = document.createElement('div');
      head.className = 'person-team-head';
      const name = document.createElement('b');
      name.textContent = `${member.slot}. ${member.name}`;
      const affection = document.createElement('span');
      affection.textContent = `好感 ${member.affection}`;
      head.append(name, affection);

      const status = document.createElement('div');
      status.className = 'person-team-status';
      status.textContent = `生命 ${member.hp}/${member.maxHp} · 内力 ${member.mp}/${member.maxMp} · 经验 ${member.exp}`;

      const skills = document.createElement('div');
      skills.className = 'person-team-skills';
      if (!member.skills.length) {
        skills.textContent = '无武功';
      } else {
        for (const skill of member.skills) {
          const chip = document.createElement('span');
          chip.className = 'person-team-skill';
          chip.title = `熟练度 ${progressText(skill.exp, skill.full)}`;
          chip.textContent = `${skill.name} ${skill.level}级`;
          skills.appendChild(chip);
        }
      }

      body.append(head, status, skills);
      card.append(portrait, body);
      root.appendChild(card);
    }
  }

  function render() {
    renderHeader();
    renderRows('#personVitals', model.vitals, 'person-stat');
    renderRows('#personQualities', model.qualities, 'person-stat compact');
    renderSlots();
    renderSkills();
    renderTeam();
  }

  window.JYPersonBridge = {
    begin(name, nickname, school, rank, master, portrait) {
      model.name = String(name || '');
      model.nickname = String(nickname || '');
      model.school = String(school || '');
      model.rank = String(rank || '');
      model.master = String(master || '');
      model.portrait = Number(portrait) || 0;
      model.vitals = [];
      model.qualities = [];
      model.slots = [];
      model.skills = [];
      model.team = [];
      activeTeamMember = null;
    },
    vital(label, value, max) {
      model.vitals.push({ label: String(label || ''), value: Number(value) || 0, max: Number(max) || 0 });
    },
    quality(label, value) {
      model.qualities.push({ label: String(label || ''), value: Number(value) || 0, max: 0 });
    },
    slot(label, id, name, icon, point) {
      model.slots.push({
        label: String(label || ''), id: Number(id) || 0, name: String(name || '未装备'),
        icon: Number(icon) || 0, point: String(point || '')
      });
    },
    skill(id, name, category, categoryName, level, cultivation, exp, full, icon) {
      model.skills.push({
        id: Number(id) || 0,
        name: String(name || ''),
        category: Number(category) || 0,
        categoryName: String(categoryName || ''),
        level: Number(level) || 0,
        cultivation: Number(cultivation) || 0,
        exp: Number(exp) || 0,
        full: Number(full) || 0,
        icon: Number(icon) || 0
      });
    },
    teamBegin(slot, roleNo, roleId, name, portrait, hp, maxHp, mp, maxMp, affection, exp) {
      activeTeamMember = {
        slot: Number(slot) || 0,
        roleNo: Number(roleNo) || 0,
        roleId: Number(roleId) || 0,
        name: String(name || ''),
        portrait: Number(portrait) || 0,
        hp: Number(hp) || 0,
        maxHp: Number(maxHp) || 0,
        mp: Number(mp) || 0,
        maxMp: Number(maxMp) || 0,
        affection: Number(affection) || 0,
        exp: Number(exp) || 0,
        skills: []
      };
      model.team.push(activeTeamMember);
    },
    teamSkill(slot, id, name, category, categoryName, level, exp, full) {
      if (!activeTeamMember) return;
      activeTeamMember.skills.push({
        slot: Number(slot) || 0,
        id: Number(id) || 0,
        name: String(name || ''),
        category: Number(category) || 0,
        categoryName: String(categoryName || ''),
        level: Number(level) || 0,
        exp: Number(exp) || 0,
        full: Number(full) || 0
      });
    },
    teamEnd() { activeTeamMember = null; },
    finish() { render(); }
  };

  function refresh() {
    try {
      runLua('return __jy_person_refresh()', '@web/person-refresh');
    } catch (error) {
      console.error(error);
      const status = $('#runtimeStatus');
      if (status) status.textContent = `人物面板读取失败：${error.message || error}`;
    }
  }

  function open() {
    const panel = $('#personPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    refresh();
  }

  function close() {
    $('#personPanel')?.classList.add('hidden');
  }

  async function install() {
    if (installed || !window.fengari || !window.JYWeb) return false;
    try {
      const gfReady = runLua('local ok=pcall(require,"gf"); return ok', '@web/person-probe');
      if (!gfReady) return false;
      const response = await fetch('./lua/person_web.lua');
      if (!response.ok) throw new Error(`person_web.lua HTTP ${response.status}`);
      runLua(await response.text(), '@person_web.lua');
      installed = true;
      const button = $('#personBtn');
      if (button) button.disabled = false;
      return true;
    } catch (error) {
      console.debug('person adapter waiting for runtime', error);
      return false;
    }
  }

  $('#personBtn')?.addEventListener('click', open);
  $('#personClose')?.addEventListener('click', close);
  $('#personBackdrop')?.addEventListener('click', close);

  const timer = setInterval(async () => {
    if (await install()) clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 30000);
})();
