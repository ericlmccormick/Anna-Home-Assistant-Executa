'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
test('review fixture responds to HA sensor and harmless demo light APIs only',async()=>{
 const {makeDemoServer}=await import('../review/demo-ha-server.mjs');
 const token=randomBytes(20).toString('hex');
 const {server,getCallCount}=makeDemoServer({token});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const get=(path,auth=true)=>fetch(base+path,{headers:auth?{Authorization:'Bearer '+token}:{}});
  assert.equal((await get('/api/config',false)).status,401);
  assert.equal((await (await get('/api/config')).json()).location_name,'Anna Home Assistant Demo');
  const states=await (await get('/api/states')).json();
  assert.equal(states.length,3);
  const action=await fetch(base+'/api/services/light/turn_on',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({entity_id:'light.demo_lamp'})});
  assert.equal(action.status,200);
  assert.equal((await (await get('/api/states/light.demo_lamp')).json()).state,'on');
  assert.equal(getCallCount(),1);
  const forbidden=await fetch(base+'/api/services/lock/unlock',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
  assert.equal(forbidden.status,404);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
