import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {
  JYUpstream: null,
  addEventListener() {},
};
globalThis.document = {};
vm.runInThisContext(fs.readFileSync('src/shop.js', 'utf8'), { filename: 'src/shop.js' });

const { clampQuantity, calculateTotal } = globalThis.window.JYShopModel;
const snapshots = JSON.parse(fs.readFileSync('tools/regression-snapshots.json', 'utf8'));
const shop = snapshots.shop;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(clampQuantity(-3, shop.maxBuyQuantity) === 0, 'negative quantity was not clamped');
assert(clampQuantity(150, shop.maxBuyQuantity) === shop.maxBuyQuantity, 'buy quantity snapshot changed');
assert(clampQuantity(8, 3) === 3, 'sell quantity must cap at owned count');
assert(clampQuantity('2', 3) === 2, 'numeric input conversion failed');
assert(calculateTotal(shop.sample.prices, shop.sample.quantities) === shop.sample.total, 'cart total snapshot mismatch');
console.log('shop model PASS: quantity clamps + raw cart total');
