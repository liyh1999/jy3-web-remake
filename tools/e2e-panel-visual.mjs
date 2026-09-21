import { launchBrowserHarness } from './browser-e2e-core.mjs';

const browser = await launchBrowserHarness({
  port: Number(process.env.JY3_PANELS_E2E_PORT || 8098),
  debugPort: Number(process.env.JY3_PANELS_E2E_DEBUG_PORT || 9234),
  dist: process.env.JY3_PANELS_E2E_DIST === '1',
});

const { evaluate, waitFor, cleanup, errors } = browser;

try {
  await waitFor(
    "window.JYWeb && window.JYPersonBridge && window.JYInventoryBridge && window.JYShop && document.querySelector('#personBtn') && !document.querySelector('#personBtn').disabled && !document.querySelector('#inventoryBtn').disabled",
    { timeoutMs: 30000, label: 'original panel runtime' }
  );

  await evaluate(`(() => {
    JYPersonBridge.begin('令狐冲','浪子','华山派','大弟子','岳不群',0x56080001);
    JYPersonBridge.vital('生命',321,500);
    JYPersonBridge.vital('内力',222,400);
    JYPersonBridge.quality('臂力',61);
    JYPersonBridge.slot('武器',0,'未装备',0,'193');
    JYPersonBridge.finish();
    const p=document.querySelector('#personPanel');
    p.classList.remove('hidden');
  })()`);
  const person = await evaluate(`(() => {
    const panel=document.querySelector('#personPanel');
    const w=document.querySelector('.person-window');
    const s=getComputedStyle(panel);
    return {fg:s.getPropertyValue('--person-book-foreground'),bg:s.getPropertyValue('--person-book-background'),attr:s.getPropertyValue('--person-attribute-panel'),left:w.offsetLeft,top:w.offsetTop,width:w.offsetWidth,height:w.offsetHeight};
  })()`);
  if (!person.fg.includes('/image/bjmap/0058.png') || !person.bg.includes('/image/UI/0020.png') || !person.attr.includes('/image/UI/0024.png')) throw new Error('person original resources missing: '+JSON.stringify(person));
  if (person.left!==0 || person.top!==0 || person.width!==853 || person.height!==480) throw new Error('person panel escaped logical frame: '+JSON.stringify(person));

  await evaluate(`(() => {
    document.querySelector('#personPanel').classList.add('hidden');
    JYInventoryBridge.begin(1234);
    JYInventoryBridge.slot('武器',0,'未装备',0,'193');
    JYInventoryBridge.push(1,'测试物品',2,1,'装备','测试说明',0,false,'查看');
    JYInventoryBridge.finish();
    document.querySelector('#inventoryPanel').classList.remove('hidden');
  })()`);
  const inventory = await evaluate(`(() => {
    const panel=document.querySelector('#inventoryPanel');
    const w=document.querySelector('.inventory-window');
    const s=getComputedStyle(panel);
    return {main:s.getPropertyValue('--inventory-main'),figure:s.getPropertyValue('--inventory-figure'),detail:s.getPropertyValue('--inventory-detail'),left:w.offsetLeft,top:w.offsetTop,width:w.offsetWidth,height:w.offsetHeight};
  })()`);
  if (!inventory.main.includes('/image/UI/0076.png') || !inventory.figure.includes('/image/UI/0033.png') || !inventory.detail.includes('/image/bjmap/9002.png')) throw new Error('inventory original resources missing: '+JSON.stringify(inventory));
  if (inventory.left!==0 || inventory.top!==0 || inventory.width!==853 || inventory.height!==480) throw new Error('inventory panel escaped logical frame: '+JSON.stringify(inventory));

  await evaluate(`(() => {
    document.querySelector('#inventoryPanel').classList.add('hidden');
    JYShop.open(['小还丹','金疮药'],[12,30],[0,0],'buy',999,()=>{});
  })()`);
  await waitFor("!document.querySelector('#shopPanel').classList.contains('hidden') && document.querySelectorAll('.shop-row').length===2", { label: 'original shop panel' });
  const shop = await evaluate(`(() => {
    const panel=document.querySelector('#shopPanel');
    const w=document.querySelector('.shop-window');
    const s=getComputedStyle(panel);
    return {parent:panel.parentElement?.id,bg:s.getPropertyValue('--shop-background'),left:w.offsetLeft,top:w.offsetTop,width:w.offsetWidth,height:w.offsetHeight};
  })()`);
  if (shop.parent!=='game') throw new Error('shop is not mounted inside logical game frame: '+JSON.stringify(shop));
  if (!shop.bg.includes('/image/UI/0036.png')) throw new Error('shop original background missing: '+JSON.stringify(shop));
  if (Math.abs(shop.left-215)>1 || Math.abs(shop.top-72)>1 || Math.abs(shop.width-423)>1 || Math.abs(shop.height-336)>1) throw new Error('shop v_shop coordinates drifted: '+JSON.stringify(shop));

  const unexpected = errors.filter(row => !row.includes('favicon'));
  if (unexpected.length) throw new Error('unexpected panel visual errors:\n'+unexpected.join('\n'));

  console.log('original person/inventory/shop visual E2E PASS');
  console.log('  v_book / v_item / v_shop artwork and logical-frame coordinates active');
} finally {
  await cleanup();
}
