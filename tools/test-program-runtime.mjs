import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file=path.join(os.tmpdir(),'jy3-program-runtime-test.lua');
const harness=String.raw`
local Runtime=assert(loadfile('lua/program_runtime.lua'))()
local scheduled={}
local log={}
local R
R=Runtime.new({
  label='test',
  schedule=function(ms) scheduled[#scheduled+1]=ms end,
  max_steps=200,
})

local function dispatcher()
  while true do
    R:case(1,'hit')
    R:case(2,'done')
    local result=R:wait_case()
    log[#log+1]='case:'..tostring(result)
    if result==2 then return end
  end
end

local function worker()
  R:wait_time(25)
  R:trig_event('hit')
  R:wait_time(40)
  R:trig_event('done')
end

local function waiter()
  R:wait1('finish')
  log[#log+1]='finish'
end

assert(R:start_program('dispatcher',dispatcher))
assert(R:start_program('worker',worker))
assert(R:start_program('waiter',waiter))
assert(R:has_program('dispatcher') and R:has_program('worker') and R:has_program('waiter'))
assert(scheduled[1]==25,'first timer delay missing')

while R:pending()>0 do R:pump(1) end
assert(log[1]=='case:1' and log[2]=='case:2','case/wait_case ordering failed')
assert(not R:has_program('dispatcher') and not R:has_program('worker'),'completed programs leaked')
assert(R:has_program('waiter'),'event waiter ended too early')

R:trig_event('finish')
while R:pending()>0 do R:pump(1) end
assert(log[3]=='finish' and not R:has_program('waiter'),'wait1/trig_event failed')

local function never() R:wait1('never') end
assert(R:start_program('remove-me',never))
assert(R:remove_program('remove-me'))
R:trig_event('never')
assert(R:pending()==0,'removed program was requeued')

R:trig_event('pre')
local pre=''
local function consume_pre() R:wait1('pre'); pre='ok' end
assert(R:start_program('consume-pre',consume_pre))
assert(pre=='ok' and not R:has_program('consume-pre'),'queued signal was not consumed synchronously')

R:reset()
assert(R:pending()==0 and not R:has_program('x'),'reset failed')
print('program runtime PASS: timer/event/case/remove/signal semantics')
`;
fs.writeFileSync(file,harness,'utf8');
const run=spawnSync('lua5.3',[file],{encoding:'utf8'});
if(run.status!==0){console.error(run.stdout);console.error(run.stderr);process.exit(run.status||1);}
process.stdout.write(run.stdout);
