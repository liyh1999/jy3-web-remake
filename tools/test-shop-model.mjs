import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = {
  JYUpstream: null,
  addEventListener() {},
};
globalThis.document = {};
vm.runInThisContext(fs.readFileSync('src/shop.js', 'utf8'), { filename: 'src/shop.js' });

const { clampQuantity, calculateTotal } = globalThis.window.JYShopModel;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(clampQuantity(-3, 99) === 0, 'negative quantity was not clamped');
assert(clampQuantity(150, 99) === 99, 'buy quantity must cap at 99');
assert(clampQuantity(8, 3) === 3, 'sell quantity must cap at owned count');
assert(clampQuantity('2', 3) === 2, 'numeric input conversion failed');
assert(calculateTotal([12, 30, 7], [2, 3, 0]) === 114, 'cart total mismatch');
console.log('shop model PASS: quantity clamps + raw cart total');
