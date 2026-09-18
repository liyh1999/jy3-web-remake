import fs from 'node:fs';
import vm from 'node:vm';

function node(type = 'container') {
  return {
    type,
    handle: node.next++,
    name: '',
    children: [],
    parent: null,
    addChild(child) { child.parent = this; this.children.push(child); return child; },
    removeFromParent() {
      if (!this.parent) return this;
      this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
      return this;
    },
  };
}
node.next = 1;

const stage = node('stage');
const listeners = {};
const luaCalls = [];
const scene = {
  style: {},
  querySelectorAll: () => [],
};
const status = { textContent: '' };
const actions = { classList: { add() {} } };
const hud = { classList: { remove() {} } };
const hudPortrait = {
  style: {},
  dataset: {},
  classList: { toggle(name, enabled) { this[name] = Boolean(enabled); } },
  textContent: '侠',
};

globalThis.window = {
  JYRenderer: {
    HALF_WIDTH: 426.5,
    HALF_HEIGHT: 240,
    ensureCanvas() {},
    setBackground(id) { this.background = id; stage.children = []; },
    stage: () => stage,
    container: () => node('container'),
    quad: () => node('quad'),
    textQuad: () => node('text'),
    render() {},
  },
  JYResources: {
    url(id) { return id === 0x56080001 ? './image/head/0001.png' : null; },
  },
  JYInput: {
    subscribe(kind, callback) { listeners[kind] = callback; return () => {}; },
  },
  fengari: {
    load(chunk) {
      return () => {
        luaCalls.push(chunk);
        return true;
      };
    },
  },
};

globalThis.document = {
  querySelector(selector) {
    if (selector === '#scene') return scene;
    if (selector === '#runtimeStatus') return status;
    if (selector === '#villageActions') return actions;
    if (selector === '#hud') return hud;
    if (selector === '#hudPortrait') return hudPortrait;
    return null;
  },
};

vm.runInThisContext(fs.readFileSync('src/map-scene.js', 'utf8'), { filename: 'src/map-scene.js' });
const host = window.JYMapHost;

host.beginMap(0x10060003, '牛家村', 0x56050001, 1, 0, 0, 0, 0x56080001);
const eventHandle = host.addHotspot(8, 0x10070061, '牛家村穆念慈', 0x56080082, 200, 280, '牛家村-穆念慈', 0, 0, 0, 0);
const mapHandle = host.addHotspot(1, 0x10070025, '大地图', 0x56070001, 32, 47, '', 0x10060001, 0, 0, 0);
const lockedHandle = host.addHotspot(25, 0x10070019, '神龙教', 0x56061010, 590, 32, '', 0x1006000a, 1, 1, 0);
host.endMap();

const event = host.hotspots().find(row => row.handle === eventHandle);
if (!event) throw new Error('event hotspot missing');
if (event.originalX !== 200 || event.originalY !== 280) throw new Error('original map coordinates were not preserved');
const logical = host.logicalFromOriginal(200, 280);
if (logical.x !== -226.5 || logical.y !== -40) throw new Error(`unexpected logical projection ${logical.x},${logical.y}`);
if (window.JYRenderer.background !== 0x56050001) throw new Error('map background was not routed through renderer');
if (hudPortrait.dataset.resourceId !== '0x56080001') throw new Error('map HUD did not record original portrait resource id');
if (!hudPortrait.style.backgroundImage.includes('image/head/0001.png')) throw new Error('map HUD did not render original portrait URL');
if (!hudPortrait.classList['has-image']) throw new Error('map HUD portrait did not enter image mode');

listeners.click({ handle: eventHandle });
if (!luaCalls.at(-1)?.includes('__jy_activate_city(268894305)')) throw new Error('event hotspot did not dispatch original city id');
listeners.click({ handle: mapHandle });
if (!luaCalls.at(-1)?.includes('__jy_activate_city(268894245)')) throw new Error('linked-map hotspot did not dispatch original city id');

listeners.rollOver({ handle: lockedHandle });
if (!status.textContent.includes('神龙教') || !status.textContent.includes('未解锁')) throw new Error('locked hotspot hover status missing');
listeners.click({ handle: lockedHandle });
if (!luaCalls.at(-1)?.includes('__jy_activate_city(268894233)')) throw new Error('locked hotspot was not delegated to Lua rule handling');

const html = fs.readFileSync('index.html', 'utf8');
if (/data-event\s*=/.test(html)) throw new Error('temporary HTML event buttons returned; village must use map hotspots');
if (!html.includes('id="villageActions"')) throw new Error('compatibility villageActions mount point missing');

console.log('map scene PASS: original coordinates, city-id activation, locked hover, no fixed NPC buttons');
