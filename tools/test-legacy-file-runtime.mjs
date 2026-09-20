import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const app = fs.readFileSync('src/app.js', 'utf8');
for (const needle of [
  "const LEGACY_FILE_KEY = 'jy3-web-remake:legacy-file:'",
  "part === '..'",
  "/^jy3-web:\\/\\/(?:save|write)\\//",
  "legacyFileExists(path)",
  "legacyFileRead(path)",
  "legacyFileWrite(path, data)",
]) {
  if (!app.includes(needle)) throw new Error('missing browser legacy-file sandbox contract: ' + needle);
}

const file = path.join(os.tmpdir(), 'jy3-legacy-file-runtime.lua');
const harness = String.raw`
local files = {}
local web = {}
function web:legacyFilePath(scope, value)
    return 'jy3-web://' .. tostring(scope) .. '/' .. tostring(value)
end
function web:legacyFileExists(path) return files[tostring(path)] ~= nil end
function web:legacyFileRead(path) return files[tostring(path)] end
function web:legacyFileWrite(path, data)
    files[tostring(path)] = tostring(data or '')
    return true
end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {}, undefined = {},
        new = function() return {} end,
    }
end

assert(loadfile('lua/gf_web.lua'))()

local save = G.GetSavePath('R4.grp')
local log = G.WritePath('log/achieve.txt')
assert(save == 'jy3-web://save/R4.grp', 'GetSavePath namespace mismatch')
assert(log == 'jy3-web://write/log/achieve.txt', 'WritePath namespace mismatch')
assert(G.IsFileExist(save) == false, 'fresh virtual save unexpectedly exists')

local raw = 'abc\0中文\255'
local packed = G.zip(raw)
assert(packed ~= raw and #packed > #raw, 'zip adapter must wrap original payload')
assert(G.unzip(packed) == raw, 'zip/unzip payload roundtrip mismatch')
assert(G.unzip('legacy-unwrapped') == 'legacy-unwrapped', 'unzip fallback should preserve unwrapped input')

assert(G.WriteFile(save, packed) == true, 'WriteFile browser bridge failed')
assert(G.IsFileExist(save) == true, 'written virtual save not found')
assert(G.LoadFile(save) == packed, 'LoadFile browser bridge did not preserve bytes/string payload')
assert(G.unzip(G.LoadFile(save)) == raw, 'stored zipped payload did not roundtrip')

print('browser legacy file runtime PASS')
print('  GetSavePath/WritePath stay inside virtual save namespaces')
print('  IsFileExist/LoadFile/WriteFile use browser-owned storage bridge')
print('  zip/unzip use reversible Web save envelope')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
