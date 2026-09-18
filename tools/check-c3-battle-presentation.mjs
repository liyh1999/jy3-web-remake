import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const runtime = read('lua/battle_web.lua');
const app = read('src/app.js');
const view = read('src/battle.js');
const resources = read('src/resources.js');

function must(source, pattern, message) {
  const ok = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  if (!ok) throw new Error(message);
}

for (const callback of [
  'battleDialogue',
  'battleSlotStatus',
  'battleAction',
  'battleSkillEffect',
  'battleAudio',
  'battleAudioStop'
]) {
  must(app, callback, `JYWeb presentation callback missing: ${callback}`);
}

must(runtime, '"battleDialogue"', 'Lua runtime does not project original battle talk nodes');
must(runtime, '"battleSlotStatus"', 'Lua runtime does not project original battle statuses');
must(runtime, 'status_names', 'authoritative abnormal-state mapping is missing');
for (const name of ['中毒','麻痹','晕眩','内伤','受伤','减速','混乱','致盲','剧毒','强伤']) {
  must(runtime, name, `missing abnormal-state label: ${name}`);
}

must(runtime, 'web:battleAction(position, action_id, "actor")', 'original frameActionID actor bridge missing');
must(runtime, 'web:battleAction(position, effect_id, "skill")', 'original flash frameActionID bridge missing');
must(runtime, 'web:battleSkillEffect(skill_name', 'skill-name/effect presentation bridge missing');
must(runtime, 'root.getChildByName("图表").getChildByName("文字").text = skill_name', 'original skill-name field is not synchronized');

must(runtime, 'Play = G.Play', 'battle runtime does not preserve original audio implementation');
must(runtime, 'Stop = G.Stop', 'battle runtime does not preserve original audio stop implementation');
must(runtime, 'raw.Play(resource_id, channel, loop, volume)', 'battle G.Play does not delegate to resource audio');
must(runtime, 'raw.Stop(channel)', 'battle G.Stop does not delegate to resource audio');
must(runtime, '"battleAudio"', 'battle audio telemetry/presentation bridge missing');
must(resources, "source.kind !== 'audio'", 'resource layer audio-kind routing missing');
must(resources, 'promise.catch', 'autoplay rejection must remain non-blocking');

for (const fn of ['dialogue','slotStatus','action','skillEffect','audio','audioStop']) {
  must(view, `function ${fn}(`, `battle view presentation function missing: ${fn}`);
}
must(view, '.battle-slot-talk', 'battle dialogue bubble projection missing');
must(view, '.battle-slot-status', 'battle per-slot status projection missing');
must(view, "classList.add('down')", 'battle defeat/escape posture feedback missing');
must(view, 'battle-skill-flash', 'battle skill-name effect missing');

if (/localStorage|sessionStorage/.test(view)) {
  throw new Error('battle presentation must not persist gameplay state');
}
if (/add_point|add_role|set_point|set_role|magic_power/.test(view)) {
  throw new Error('battle presentation JS must not mutate authoritative Lua combat state');
}

console.log('C3-3 battle presentation bridge PASS: talk, status, actions, skill effects, audio delegation, no gameplay mutation');
