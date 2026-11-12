'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../src/approval');
const {invoke,handle}=require('../src/main');
const {makeReverseRPC}=require('../src/anna-storage');
function memoryStore(){
 const map=new Map(),exp=new Map();
 return {map,async get(key){if(!map.has(key))return {exists:false,etag:null};
 const x=map.get(key);return {exists:true,value:structuredClone(x.value),etag:x.etag}},
 async set(key,value,opt={}){const prev=map.get(key);if(opt.etag && (!prev||opt.etag!==prev.etag))throw new Error('CAS conflict');
 const etag=String((Number(prev?.etag||0)+1));map.set(key,{value:structuredClone(value),etag});return {etag};},
 async list(prefix){return {items:[...map.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key}))}},
 async delete(key){map.delete(key);return {deleted:true}}};
}
const credentials={HA_URL:'https://ha.example.net',HA_TOKEN:'test-token'};
const fetcher=async(_url,opt)=>({ok:true,status:200,text:async()=>JSON.stringify([]),opts:opt});
test('RFC6238 SHA-1 6 digit vector and adjacent window',()=>{
 assert.equal(A.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',1),'287082');
 assert.equal(A.verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ','287082',59000),1);
 assert.equal(A.verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ','999999',59000),null);
});
test('initialize advertises protocol v2 persistent storage',async()=>{
 const r=await handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2.0'}});
 assert.equal(r.result.protocolVersion,'2.0');assert.ok(r.result.capabilities.storage);
});
test('approval challenge is exact, expires, and can only execute once',async()=>{
 const db=memoryStore();
 const rec=await A.createPending(db,{kind:'service',domain:'lock',service:'unlock',entity_id:'lock.front_door',data:{}});
 assert.equal(rec.status,'verification_required');
 const p=await A.listPending(db);assert.equal(p.length,1);
 let count=0;
 const first=await A.consumeApproved(db,rec.request_id,async act=>{count++;assert.equal(act.entity_id,'lock.front_door');return {executed:true}});
 assert.equal(first.executed,true);assert.equal(count,1);
 await assert.rejects(()=>A.consumeApproved(db,rec.request_id,async()=>{count++}),/already processed/);
 assert.equal(count,1);
});
test('approval PIN check, lockout, and no PIN in storage',async()=>{
 const db=memoryStore(),cfg={approvalPin:'123456',totpSecret:null};
 await A.verifyCode(db,cfg,'pin','123456');
 for(let i=0;i<5;i++)await assert.rejects(()=>A.verifyCode(db,cfg,'pin','000000'),/Invalid verification/);
 await assert.rejects(()=>A.verifyCode(db,cfg,'pin','123456'),/locked/);
 for(const entry of db.map.values())assert.doesNotMatch(JSON.stringify(entry),/123456/);
});
test('approval authenticator code cannot be used twice in the same time step',async()=>{
 const db=memoryStore();const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 const cfg={approvalPin:null,totpSecret:secret};
 const count=Math.floor(Date.now()/30000),code=A.totp(secret,count);
 await A.verifyCode(db,cfg,'totp',code);
 await assert.rejects(()=>A.verifyCode(db,cfg,'totp',code),/Invalid verification/);
});
test('Verify-mode service request never executes without storage',async()=>{
 let called=false;const ctx={credentials:{...credentials,HA_POLICY_JSON:'{"locks":"verify"}'}};
 const r=await invoke('call_service',{domain:'lock',service:'unlock',entity_id:'lock.front_door'},ctx,async()=>{called=true;return fetcher()});
 assert.equal(r.success,false);assert.equal(called,false);
});
test('Verify-mode service request queues, optional phone alert is not an approval',async()=>{
 const store=memoryStore(),calls=[];
 const ctx={credentials:{...credentials,HA_POLICY_JSON:'{"locks":"verify"}',HA_PHONE_NOTIFY_SERVICE:'mobile_app_my_phone'}};
 const r=await invoke('call_service',{domain:'lock',service:'unlock',entity_id:'lock.front_door'},ctx,async(url,opt)=>{
 calls.push({url,opt});return {ok:true,status:200,text:async()=>JSON.stringify({message:'done'})};
 },store);
 assert.equal(r.success,false);assert.equal(r.data.status,'verification_required');
 assert.equal(calls.length,1);assert.match(calls[0].url,/\/api\/services\/notify\/mobile_app_my_phone/);
 assert.equal((await A.listPending(store)).length,1);
});
test('UI can complete a PIN-verified request with action bound to queue',async()=>{
 const db=memoryStore();
 const ctx={credentials:{...credentials,HA_APPROVAL_PIN:'246810',HA_POLICY_JSON:'{"locks":"verify"}'}};
 const p=await invoke('call_service',{domain:'lock',service:'unlock',entity_id:'lock.front_door'},ctx,fetcher,db);
 assert.equal(p.success,false);
 let path;
 const got=await invoke('approve_action',{request_id:p.data.request_id,method:'pin',code:'246810'},ctx,async(url,opt)=>{path=url;return fetcher(url,opt)},db);
 assert.equal(got.success,true);assert.match(path,/\/api\/services\/lock\/unlock/);
 const replay=await invoke('approve_action',{request_id:p.data.request_id,method:'pin',code:'246810'},ctx,fetcher,db);
 assert.equal(replay.success,false);
});
test('No secrets from get_permissions',async()=>{
 const c={credentials:{...credentials,HA_APPROVAL_PIN:'552211',HA_TOTP_SECRET:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'}};
 const r=await invoke('get_permissions',{},c,fetcher);
 assert.equal(r.success,true);
 assert.doesNotMatch(JSON.stringify(r),/552211|GEZDGNBVGY3TQOJQ/);
});
test('reverse RPC uses verified invoke context and separates response frames',async()=>{
 const outbound=[],rpc=makeReverseRPC(frame=>outbound.push(frame));
 const c={invoke_id:'host-minted-invoke-id',storage_token:'test-only'};
 const pending=rpc.storage(c).get('pending/test');
 assert.equal(outbound.length,1);
 assert.equal(outbound[0].params.context.invoke_id,c.invoke_id);
 assert.equal(outbound[0].params.scope,'tool');
 assert.equal(rpc.response({jsonrpc:'2.0',id:outbound[0].id,result:{exists:false}}),true);
 assert.equal((await pending).exists,false);
 await assert.rejects(()=>rpc.storage({}).get('x'),/unavailable/);
});
test('passkey challenges reject missing auth state and invalid registration',async()=>{
 const db=memoryStore();
 await assert.rejects(()=>A.beginPasskey(db,'missing'),/expired/);
 await assert.rejects(()=>A.beginEnroll(db,{approvalPin:'654321'},'111111'),/Invalid verification/);
});

test('passkey registration generates cryptographic challenge with required UV',async()=>{
 const db=memoryStore();
 const options=await A.beginEnroll(db,{approvalPin:'654321'},'654321');
 assert.ok(options.enrollment_id);assert.ok(options.options.challenge.length>=22);
 assert.equal(options.options.authenticatorSelection.userVerification,'required');
 await assert.rejects(()=>A.finishEnroll(db,options.enrollment_id,{id:'invalid',type:'public-key',response:{}}),/could not be verified/);
 const saved=await db.get('security/passkeys');
 assert.equal(saved.exists,false);
});
test('unverified action queue has a bounded pending limit',async()=>{
 const db=memoryStore();
 for(let i=0;i<8;i++)await A.createPending(db,{kind:'service',domain:'light',service:'turn_on',entity_id:'light.test'+i,data:{}});
 await assert.rejects(()=>A.createPending(db,{kind:'service',domain:'light',service:'turn_on',entity_id:'light.last',data:{}}),/Too many pending/);
});

test('an approval is rejected if the user disables a category after queuing it',async()=>{
 const store=memoryStore();
 const enabled={credentials:{...credentials,HA_APPROVAL_PIN:'246810',HA_POLICY_JSON:'{"locks":"verify"}'}};
 const req=await invoke('call_service',{domain:'lock',service:'unlock',entity_id:'lock.front_door'},enabled,fetcher,store);
 assert.equal(req.success,false);
 let called=false;
 const disabled={credentials:{...credentials,HA_APPROVAL_PIN:'246810'}};
 const result=await invoke('approve_action',{request_id:req.data.request_id,method:'pin',code:'246810'},
   disabled,async()=>{called=true;return fetcher()},store);
 assert.equal(result.success,false);assert.match(result.error,/policy changed/);assert.equal(called,false);
});

test('Verify mode also gates other entity reads and returns the exact approved state',async()=>{
 const store=memoryStore(),ctx={credentials:{...credentials,HA_APPROVAL_PIN:'246810',HA_POLICY_JSON:'{"other_read":"verify"}'}};
 const queued=await invoke('get_state',{entity_id:'lock.front_door',compact:true},ctx,fetcher,store);
 assert.equal(queued.success,false);assert.equal(queued.data.action.kind,'read_state');
 const r=await invoke('approve_action',{request_id:queued.data.request_id,method:'pin',code:'246810'},ctx,
  async(_url)=>({ok:true,status:200,text:async()=>JSON.stringify({entity_id:'lock.front_door',state:'locked',attributes:{battery:95}})}),store);
 assert.equal(r.success,true);
 assert.equal(r.data.entity_id,'lock.front_door');
 assert.equal(r.data.state,'locked');
 assert.equal(r.data.attributes,undefined);
});
test('Verify mode approves HA Assist only after code confirmation',async()=>{
 const store=memoryStore(),ctx={credentials:{...credentials,HA_APPROVAL_PIN:'246810',HA_POLICY_JSON:'{"assist":"verify"}'}};
 const queued=await invoke('converse',{text:'Turn on a light'},ctx,fetcher,store);
 assert.equal(queued.success,false);assert.equal(queued.data.action.body.text,'Turn on a light');
 const r=await invoke('approve_action',{request_id:queued.data.request_id,method:'pin',code:'246810'},ctx,
  async(_url,opt)=>({ok:true,status:200,text:async()=>JSON.stringify({response:{speech:{plain:{speech:'Done'}}},conversation_id:'test'})}),store);
 assert.equal(r.success,true);assert.equal(r.data.text,'Done');
});
test('Verify entity list authorizes all domains once while default listing stays sensor only',async()=>{
 const store=memoryStore(),ctx={credentials:{...credentials,HA_APPROVAL_PIN:'246810',HA_POLICY_JSON:'{"other_read":"verify"}'}};
 const states=[{entity_id:'sensor.x',state:'24'},{entity_id:'lock.a',state:'locked'}];
 const mock=async()=>({ok:true,status:200,text:async()=>JSON.stringify(states)});
 const queued=await invoke('list_states',{compact:true},ctx,mock,store);
 assert.equal(queued.success,false);assert.equal(queued.data.action.authorized_all,true);
 const approved=await invoke('approve_action',{request_id:queued.data.request_id,method:'pin',code:'246810'},ctx,mock,store);
 assert.equal(approved.success,true);assert.equal(approved.data.count,2);
 assert.deepEqual(approved.data.entities,states);
});
