import fs from 'node:fs';
import path from 'node:path';

const base = path.join('vendor', 'upstream', 'JY3', 'script', '04_program');

const checks = [
  {
    file: 'p_person.lua',
    label: 'world-map daily mini-games',
    needles: [
      "G.case(1015, '地图打猎')",
      "G.case(1016, '地图砍柴')",
      "G.case(1017, '地图钓鱼')",
      "G.call('hunting')",
      "G.call('logging')",
      "G.call('fishing')",
    ],
  },
  {
    file: 'p_newgame.lua',
    label: 'Niujia Village gambler NPC',
    needles: [
      "t['途径牛家村-乞丐乙']=function()",
      "G.call('gambling')",
    ],
  },
  {
    file: 'p_story-town or city.lua',
    label: 'ferry underwater mining entry',
    needles: [
      "t['城镇-渡口']=function()",
      "G.call('dig')",
    ],
  },
];

for (const check of checks) {
  const file = path.join(base, check.file);
  if (!fs.existsSync(file)) throw new Error('missing cached mini-game entry source: ' + check.file);
  const source = fs.readFileSync(file, 'utf8');
  for (const needle of check.needles) {
    if (!source.includes(needle)) {
      throw new Error(`${check.file}: missing original mini-game entry contract: ${needle}`);
    }
  }
  console.log(`mini-game entry PASS: ${check.label} (${check.file})`);
}

console.log('original map/NPC mini-game entry audit PASS');
console.log('  map: hunting/logging/fishing');
console.log('  NPC: gambling');
console.log('  town/ferry: dig');
