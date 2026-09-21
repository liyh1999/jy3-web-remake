import { launchBrowserHarness } from './browser-e2e-core.mjs';

const browser = await launchBrowserHarness({
  port: Number(process.env.JY3_DIALOGUE_E2E_PORT || 8097),
  debugPort: Number(process.env.JY3_DIALOGUE_E2E_DEBUG_PORT || 9233),
  dist: process.env.JY3_DIALOGUE_E2E_DIST === '1',
});

const { evaluate, waitFor, cleanup, errors } = browser;

try {
  await waitFor(
    "window.JYWeb && window.JYResources && document.querySelector('#startBtn') && !document.querySelector('#startBtn').disabled",
    { timeoutMs: 30000, label: 'dialogue visual runtime' }
  );

  await evaluate("window.JYWeb.enterVillage()");
  await waitFor("document.querySelector('#scene')?.classList.contains('village-scene')", { label: 'village scene' });

  const village = await evaluate("(() => { const scene=document.querySelector('#scene'); const stage=window.JYRenderer?.snapshot?.(); const bg=stage?.children?.find(node=>node.name==='__background'); return { titleCards:scene.querySelectorAll('.title-copy').length, backgroundId:Number(bg?.img||0), canvas:Boolean(document.querySelector('#gcoreCanvas')), gameTitle:document.querySelector('#game').classList.contains('title-mode') }; })()");
  if (village.titleCards !== 0) throw new Error('Web explanatory village card is still visible');
  if (village.backgroundId !== 0x56050029 || !village.canvas) throw new Error('village is not using original gcore background: ' + JSON.stringify(village));
  if (village.gameTitle) throw new Error('game remained in title-mode after entering village');

  await evaluate("window.JYWeb.showTalk('黄蓉','测试原版对话框与人物头像',43,0x5608002b,1,()=>{})");
  await waitFor("!document.querySelector('#dialogue').classList.contains('hidden') && document.querySelector('#dialogueFrame')?.complete && document.querySelector('#dialogueFrame')?.naturalWidth>0 && document.querySelector('#dialoguePortrait')?.complete && document.querySelector('#dialoguePortrait')?.naturalWidth>0", { timeoutMs: 30000, label: 'dialogue artwork loaded' });

  const talk = await evaluate("(() => { const q=s=>document.querySelector(s); const pos=s=>{const n=q(s); return {left:n.offsetLeft,top:n.offsetTop,width:n.offsetWidth,height:n.offsetHeight};}; return { frame:q('#dialogueFrame').src, portrait:q('#dialoguePortrait').src, framePos:pos('#dialogueFrame'), portraitPos:pos('#dialoguePortrait'), speaker:q('#speaker').textContent, text:q('#dialogueText').textContent, role:q('#dialogue').dataset.roleId, mod:q('#dialogue').dataset.mod, continueVisible:!q('#continueBtn').classList.contains('hidden') }; })()");
  if (!talk.frame.includes('/image/UI/0047.png')) throw new Error('dialogue frame does not use original UI/0047: ' + talk.frame);
  if (!talk.portrait.includes('/image/head/002b.png')) throw new Error('dialogue portrait does not use original role head: ' + talk.portrait);
  if (Math.abs(talk.framePos.left-212)>1 || Math.abs(talk.framePos.top-320)>1 || Math.abs(talk.framePos.width-432)>1 || Math.abs(talk.framePos.height-140)>1) {
    throw new Error('dialogue frame coordinates drifted: ' + JSON.stringify(talk.framePos));
  }
  if (talk.speaker !== '黄蓉' || !talk.text.includes('测试原版对话框') || talk.role !== '43' || talk.mod !== '1' || !talk.continueVisible) {
    throw new Error('dialogue metadata/rendering mismatch: ' + JSON.stringify(talk));
  }

  await evaluate("document.querySelector('#continueBtn').click(); window.JYWeb.showMenu('', ['1,选项甲','2,选项乙'], 43, 0x5608002b, 1, 0, ()=>{})");
  await waitFor("document.querySelectorAll('#options button').length===2 && document.querySelector('#dialogue').classList.contains('menu-mode')", { label: 'original menu visual mode' });
  const menu = await evaluate("(() => ({ choices:[...document.querySelectorAll('#options button')].map(n=>n.textContent), columns:getComputedStyle(document.querySelector('#options')).gridTemplateColumns, hint:getComputedStyle(document.querySelector('#dialogueContinueHint')).display }))()");
  if (menu.choices.join('|') !== '选项甲|选项乙') throw new Error('menu choices changed: ' + JSON.stringify(menu.choices));
  if (menu.columns.split(' ').length !== 1) throw new Error('dialogue menu is not a single original-style column: ' + menu.columns);
  if (menu.hint !== 'none') throw new Error('continue hint remained visible during menu');

  const unexpected = errors.filter(row => !row.includes('favicon'));
  if (unexpected.length) throw new Error('unexpected browser dialogue errors:\n' + unexpected.join('\n'));

  console.log('original village/dialogue visual E2E PASS');
  console.log('  village explanatory Web card removed');
  console.log('  original UI/0047 frame + role portrait + one-column menu layout active');
} finally {
  await cleanup();
}
