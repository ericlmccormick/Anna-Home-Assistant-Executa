'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {handle,invoke,safeBase,isPrivateIPv4}=require('../src/main');
const creds={credentials:{HA_URL:'https://ha.example.net:8123',HA_TOKEN:'fake-secret-test-only'}};
const control={credentials:{...creds.credentials,HA_POLICY_JSON:JSON.stringify({lights:'enabled',events:'enabled'})}};
const assist={credentials:{...creds.credentials,HA_POLICY_JSON:JSON.stringify({assist:'enabled'})}};
const extendedRead={credentials:{...creds.credentials,HA_POLICY_JSON:JSON.stringify({other_read:'enabled'})}};
function mock(value,status=200){return async (_url,opts)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(value),opts});}

test('describe returns Anna-compatible manifest and credentials',async()=>{
  const r=await handle({jsonrpc:'2.0',id:1,method:'describe'});
  assert.equal(r.result.version,'0.1.0');
  assert.ok(r.result.tools.some(t=>t.name==='get_state'));
  assert.ok(r.result.credentials.some(c=>c.name==='HA_TOKEN'&&c.sensitive));
});
test('health ready',async()=>assert.deepEqual((await handle({jsonrpc:'2.0',method:'health'})).result,{status:'ready'}));
test('requires credentials',async()=>assert.match((await invoke('test_connection',{},{})).error,/HA_TOKEN/));
test('base URL rejects credential leakage and redirections',()=>{
  assert.throws(()=>safeBase('https://me:secret@host',false));
  assert.throws(()=>safeBase('https://ha.example.net/api',false));
  assert.throws(()=>safeBase('https://ha.example.net/?token=secret',false));
  assert.throws(()=>safeBase('http://ha.example.net',true));
  assert.throws(()=>safeBase('http://192.168.1.2:8123',false));
  assert.throws(()=>safeBase('https://127.0.0.2:8123',false));
  assert.equal(safeBase('http://192.168.1.2:8123',true),'http://192.168.1.2:8123');
});
test('private IPv4 validation rejects invalid hosts',()=>{
  assert.ok(isPrivateIPv4('10.1.2.3'));
  assert.ok(isPrivateIPv4('172.16.0.1'));
  assert.ok(isPrivateIPv4('192.168.1.2'));
  assert.equal(isPrivateIPv4('172.32.0.1'),false);
  assert.equal(isPrivateIPv4('192.168.1.999'),false);
  assert.equal(isPrivateIPv4('192.168.01.2'),false);
});
test('test_connection returns minimal fields',async()=>{
  const r=await invoke('test_connection',{},creds,mock({location_name:'Test Home',version:'2026.11'}));
  assert.deepEqual(r.data,{connected:true,name:'Test Home',version:'2026.11'});
});
test('get_state hits only requested entity',async()=>{
  let url,method;
  const r=await invoke('get_state',{entity_id:'sensor.living_room'},creds,async (u,o)=>{
    url=u;method=o.method;return mock({entity_id:'sensor.living_room',state:'21',attributes:{unit_of_measurement:'°C'}})();
  });
  assert.equal(url,'https://ha.example.net:8123/api/states/sensor.living_room');
  assert.equal(method,'GET');assert.equal(r.data.state,'21');
});
test('list_states filters and limits',async()=>{
  const all=[{entity_id:'light.a',state:'on'},{entity_id:'sensor.x',state:'15'},{entity_id:'light.b',state:'off'}];
  const r=await invoke('list_states',{domain:'light',limit:1},extendedRead,mock(all));
  assert.equal(r.data.count,2);assert.equal(r.data.returned,1);
  assert.equal(r.data.entities[0].entity_id,'light.a');
});
test('converse posts text and retains conversation id',async()=>{
  let posted;
  const r=await invoke('converse',{text:'Turn lights on',conversation_id:'abc'},assist,async (_u,o)=>{
    posted=JSON.parse(o.body);return mock({response:{speech:{plain:{speech:'Done'}}},conversation_id:'xyz'})();
  });
  assert.deepEqual(posted,{text:'Turn lights on',language:'en',conversation_id:'abc'});
  assert.equal(r.data.text,'Done');assert.equal(r.data.conversation_id,'xyz');
});
test('mutations disabled by default',async()=>{
  assert.match((await invoke('call_service',{domain:'light',service:'turn_on',entity_id:'light.a'},creds)).error,/DISABLED/);
  assert.match((await invoke('fire_event',{event_type:'abc'},creds)).error,/DISABLED/);
});
test('safe service succeeds only if explicitly enabled',async()=>{
  let posted;
  const r=await invoke('call_service',{domain:'light',service:'turn_on',entity_id:'light.a',data:{brightness:42}},control,async (_u,o)=>{
    posted=JSON.parse(o.body);return mock([])();
  });
  assert.equal(r.data.executed,true);assert.deepEqual(posted,{brightness:42,entity_id:'light.a'});
});
test('dangerous services blocked even when control enabled',async()=>{
  for(const [domain,service,id] of [['lock','unlock','lock.door'],['alarm_control_panel','alarm_disarm','alarm.house'],['cover','open_cover','cover.garage']]) {
    const r=await invoke('call_service',{domain,service,entity_id:id},control);
    assert.match(r.error,/DISABLED|allowed list|must belong/);
  }
});
test('entity_id must match service domain',async()=>{
  const r=await invoke('call_service',{domain:'light',service:'turn_on',entity_id:'switch.other'},control);
  assert.match(r.error,/belong/);
});
test('reject data target override',async()=>{
  const r=await invoke('call_service',{domain:'light',service:'turn_on',entity_id:'light.a',data:{entity_id:'lock.front'}},control);
  assert.match(r.error,/target/);
  const area=await invoke('call_service',{domain:'light',service:'turn_on',entity_id:'light.a',data:{area_id:'whole_house'}},control);
  assert.match(area.error,/targets/);
});
test('no token leaks on redirect',async()=>{
  const r=await invoke('get_state',{entity_id:'sensor.a'},creds,mock({},302));
  assert.equal(r.success,false);assert.match(r.error,/redirected/);assert.doesNotMatch(r.error,/fake-secret/);
});
test('event uses enabled control',async()=>{
  const r=await invoke('fire_event',{event_type:'anna_request',event_data:{count:1}},control,mock({message:'Event fired'}));
  assert.equal(r.data.executed,true);
});
test('stdio process returns two requests without exiting between them',async()=>{
  const child=spawn(process.execPath,['src/main.js'],{cwd:require('node:path').join(__dirname,'..')});
  let out='';child.stdout.on('data',b=>out+=b);
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'describe'})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'health'})+'\n');
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(child.exitCode,null);
  child.stdin.end();await new Promise(resolve=>child.on('close',resolve));
  const frames=out.trim().split('\n').map(JSON.parse);
  assert.equal(frames.length,2);assert.equal(frames[0].id,1);assert.equal(frames[1].id,2);
});


test('sensor and binary_sensor readable by default, other states blocked',async()=>{
  const sensor=await invoke('get_state',{entity_id:'binary_sensor.motion'},creds,mock({entity_id:'binary_sensor.motion',state:'on',attributes:{}}));
  assert.equal(sensor.success,true);
  const locked=await invoke('get_state',{entity_id:'lock.front_door'},creds,mock({}));
  assert.equal(locked.success,false);assert.match(locked.error,/PERMISSION_DISABLED/);
});
test('unfiltered list hides non-sensor states until explicit opt-in',async()=>{
  const all=[{entity_id:'sensor.x',state:'1'},{entity_id:'lock.a',state:'locked'},{entity_id:'binary_sensor.motion',state:'off'}];
  const r=await invoke('list_states',{},creds,mock(all));
  assert.equal(r.data.count,2);
  assert.deepEqual(r.data.entities.map(x=>x.entity_id),['sensor.x','binary_sensor.motion']);
});
test('PIN mode fails closed instead of executing a command',async()=>{
  let called=false;
  const pinCtx={credentials:{...creds.credentials,HA_POLICY_JSON:JSON.stringify({locks:'pin'})}};
  const r=await invoke('call_service',{domain:'lock',service:'unlock',entity_id:'lock.front_door'},pinCtx,async()=>{called=true;return mock([])();});
  assert.equal(r.success,false);
  assert.match(r.error,/secure approval storage unavailable|Anna v2 required/);
  assert.equal(called,false);
});
test('explicit enable permits locks while disabled is the default',async()=>{
  const enabled={credentials:{...creds.credentials,HA_POLICY_JSON:JSON.stringify({locks:'enabled'})}};
  const r=await invoke('call_service',{domain:'lock',service:'unlock',entity_id:'lock.front_door'},enabled,mock([]));
  assert.equal(r.success,true);
});
test('unsafe policy JSON is rejected fail closed',async()=>{
  const ctx={credentials:{...creds.credentials,HA_POLICY_JSON:JSON.stringify({lights:'enabled',unknown:'enabled'})}};
  const r=await invoke('call_service',{domain:'light',service:'turn_on',entity_id:'light.a'},ctx,mock([]));
  assert.equal(r.success,false);assert.match(r.error,/Unknown permission/);
});
