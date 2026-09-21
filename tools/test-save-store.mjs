import fs from 'node:fs';
import vm from 'node:vm';

const snapshots = JSON.parse(fs.readFileSync('tools/regression-snapshots.json', 'utf8'));
const saveSnapshot = snapshots.save;
const source = fs.readFileSync('src/save-store.js', 'utf8');
const context = { globalThis: {}, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'src/save-store.js' });

const API = context.JYSaveStore;
if (!API) throw new Error('JYSaveStore missing');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const storage = new MemoryStorage();
const currentVersion = {
  runtimeVersion: '0.1.0',
  protocolVersion: 1,
  upstream: 'fixed-upstream',
};
const store = API.create(storage, currentVersion);

if (API.SLOT_IDS.join(',') !== saveSnapshot.slots.join(',')) throw new Error('save slot snapshot mismatch');

for (const slot of API.SLOT_IDS) {
  const payload = store.write(slot, {
    savedAt: '2026-09-20T10:00:00.000Z',
    meta: { characterName: slot, level: 9, gameDay: 12, mapId: 0x10060002 },
    luaState: 'return {[' + (slot === 'autosave' ? '4' : '1') + ']=true}',
  });
  if (payload.schemaVersion !== saveSnapshot.schemaVersion || payload.slot !== slot) throw new Error(slot + ': write schema snapshot mismatch');
  if (payload.runtimeVersion !== currentVersion.runtimeVersion) throw new Error(slot + ': runtime version missing from save');
  if (payload.protocolVersion !== currentVersion.protocolVersion) throw new Error(slot + ': protocol version missing from save');
  if (payload.upstream !== currentVersion.upstream) throw new Error(slot + ': upstream version missing from save');
  const loaded = store.read(slot);
  if (!loaded.ok || loaded.payload.meta.characterName !== slot) throw new Error(slot + ': read roundtrip failed');
  if (loaded.compatibility?.compatible !== true || loaded.compatibility?.code !== 'ok') throw new Error(slot + ': current save compatibility mismatch');
}

const listed = store.list();
if (listed.length !== 4 || listed.some(row => !row.ok)) throw new Error('slot listing failed');

// Current-schema corruption must not throw through the app-facing API.
storage.setItem(store.key('slot2'), '{not-json');
const corrupt = store.read('slot2');
if (corrupt.ok || corrupt.empty || !corrupt.error) throw new Error('corrupt save was not isolated');

// Future schemas must fail safely instead of being interpreted as current.
storage.setItem(store.key('slot3'), JSON.stringify({ schemaVersion: 999, luaState: 'return {}' }));
const future = store.read('slot3');
if (future.ok || !future.error.includes('999')) throw new Error('future schema was not rejected');

// Same schema but newer/different runtime protocol must parse safely and report a clear incompatibility.
storage.setItem(store.key('slot3'), JSON.stringify({
  schemaVersion: saveSnapshot.schemaVersion,
  runtimeVersion: '9.0.0',
  protocolVersion: 2,
  upstream: currentVersion.upstream,
  savedAt: '2026-09-21T00:00:00.000Z',
  meta: {},
  luaState: 'return {}',
}));
const newerProtocol = store.read('slot3');
if (!newerProtocol.ok || newerProtocol.compatibility?.compatible !== false) throw new Error('newer protocol incompatibility was not reported');
if (newerProtocol.compatibility?.code !== 'protocol-newer' || !newerProtocol.compatibility?.message.includes('不兼容')) {
  throw new Error('newer protocol incompatibility reason is unclear');
}

storage.setItem(store.key('slot3'), JSON.stringify({
  schemaVersion: saveSnapshot.schemaVersion,
  runtimeVersion: currentVersion.runtimeVersion,
  protocolVersion: currentVersion.protocolVersion,
  upstream: 'different-upstream',
  savedAt: '2026-09-21T00:00:00.000Z',
  meta: {},
  luaState: 'return {}',
}));
const wrongUpstream = store.read('slot3');
if (!wrongUpstream.ok || wrongUpstream.compatibility?.compatible !== false) throw new Error('upstream incompatibility was not reported');
if (wrongUpstream.compatibility?.code !== 'upstream-mismatch' || !wrongUpstream.compatibility?.message.includes('不一致')) {
  throw new Error('upstream incompatibility reason is unclear');
}

// Legacy v1 single-slot migration lands in slot1 and keeps its Lua state.
const legacyStorage = new MemoryStorage();
legacyStorage.setItem(API.LEGACY_SINGLE_KEY, JSON.stringify({
  version: 1,
  upstream: 'legacy-upstream',
  savedAt: '2026-01-01T00:00:00.000Z',
  luaState: 'return {[123]=456}',
}));
const legacyStore = API.create(legacyStorage, currentVersion);
const migration = legacyStore.migrateLegacySingleSlot();
if (!migration.migrated) throw new Error('legacy single-slot save did not migrate');
const migrated = legacyStore.read('slot1');
if (!migrated.ok || migrated.payload.schemaVersion !== saveSnapshot.schemaVersion) throw new Error('migrated schema snapshot mismatch');
if (migrated.payload.luaState !== 'return {[123]=456}') throw new Error('legacy Lua state changed during migration');
if (migrated.payload.meta.migratedFrom !== saveSnapshot.legacySchemaVersion) throw new Error('legacy migration snapshot changed');
if (migrated.compatibility?.compatible !== true || migrated.compatibility?.legacy !== true) throw new Error('legacy unversioned save was not kept compatible');

// Existing slot1 always wins over the prototype key.
legacyStore.write('slot1', { luaState: 'return {current=true}', meta: { characterName: 'current' } });
const secondMigration = legacyStore.migrateLegacySingleSlot();
if (secondMigration.migrated || secondMigration.reason !== 'slot1-exists') throw new Error('legacy migration overwrote slot1');

console.log('save-store PASS: slots + version metadata + legacy migration + explicit protocol/upstream compatibility');
