import fs from 'node:fs';
import vm from 'node:vm';

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
const store = API.create(storage);

if (API.SLOT_IDS.join(',') !== 'slot1,slot2,slot3,autosave') throw new Error('slot list mismatch');

for (const slot of API.SLOT_IDS) {
  const payload = store.write(slot, {
    upstream: 'fixed-upstream',
    savedAt: '2026-09-20T10:00:00.000Z',
    meta: { characterName: slot, level: 9, gameDay: 12, mapId: 0x10060002 },
    luaState: 'return {[' + (slot === 'autosave' ? '4' : '1') + ']=true}',
  });
  if (payload.schemaVersion !== 2 || payload.slot !== slot) throw new Error(slot + ': write schema mismatch');
  const loaded = store.read(slot);
  if (!loaded.ok || loaded.payload.meta.characterName !== slot) throw new Error(slot + ': read roundtrip failed');
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

// Legacy v1 single-slot migration lands in slot1 and keeps its Lua state.
const legacyStorage = new MemoryStorage();
legacyStorage.setItem(API.LEGACY_SINGLE_KEY, JSON.stringify({
  version: 1,
  upstream: 'legacy-upstream',
  savedAt: '2026-01-01T00:00:00.000Z',
  luaState: 'return {[123]=456}',
}));
const legacyStore = API.create(legacyStorage);
const migration = legacyStore.migrateLegacySingleSlot();
if (!migration.migrated) throw new Error('legacy single-slot save did not migrate');
const migrated = legacyStore.read('slot1');
if (!migrated.ok || migrated.payload.schemaVersion !== 2) throw new Error('migrated schema mismatch');
if (migrated.payload.luaState !== 'return {[123]=456}') throw new Error('legacy Lua state changed during migration');
if (migrated.payload.meta.migratedFrom !== 1) throw new Error('legacy migration metadata missing');

// Existing slot1 always wins over the prototype key.
legacyStore.write('slot1', { luaState: 'return {current=true}', meta: { characterName: 'current' } });
const secondMigration = legacyStore.migrateLegacySingleSlot();
if (secondMigration.migrated || secondMigration.reason !== 'slot1-exists') throw new Error('legacy migration overwrote slot1');

console.log('save-store PASS: 3 manual + autosave slots, v1 migration, corruption/future-version isolation');
