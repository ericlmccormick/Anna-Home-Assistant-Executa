'use strict';
const {randomBytes,randomUUID,createHmac,timingSafeEqual}=require('node:crypto');
const {normalizePolicy}=require('./security-policy');
const REQUEST_TTL_MS=120_000;
const PASSKEY_ORIGIN='https://anna.partners',PASSKEY_RPID='anna.partners';
const b64=x=>Buffer.from(x).toString('base64url');
function validCode(s){return typeof s==='string'&&/^[0-9]{6,12}$/.test(s);}
function constantEquals(a,b){const x=createHmac('sha256','anna-ha-code-v1').update(String(a)).digest(),y=createHmac('sha256','anna-ha-code-v1').update(String(b)).digest();return timingSafeEqual(x,y);}
function totp(secret,step= Math.floor(Date.now()/30000)){
 const clean=String(secret||'').toUpperCase().replace(/[\s-]/g,'').replace(/=+$/,'');
 if(!/^[A-Z2-7]{16,128}$/.test(clean))throw new Error('TOTP setup is missing or invalid');
 let bits=0,bcount=0,bytes=[];
 for(const c of clean){bits=(bits<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);bcount+=5;if(bcount>=8){bcount-=8;bytes.push((bits>>bcount)&255)}}
 const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(step));
 const digest=createHmac('sha1',Buffer.from(bytes)).update(buf).digest(),p=digest[19]&15;
 return (String(((digest.readUInt32BE(p)&0x7fffffff)%1000000))).padStart(6,'0');
}
function verifyTotp(secret,code,now=Date.now()){
 if(!/^\d{6}$/.test(String(code)))return null;
 const counter=Math.floor(now/30000);
 for(let c=counter-1;c<=counter+1;c++)if(c>=0&&constantEquals(totp(secret,c),code))return c;
 return null;
}
class ApprovalError extends Error{constructor(message){super(message);this.name='ApprovalError'}}
function assertStore(store){if(!store||typeof store.get!=='function'||typeof store.set!=='function')throw new ApprovalError('Secure approval storage unavailable (Anna v2 required)')}
async function read(store,key){assertStore(store);const r=await store.get(key);return r?.exists?{value:r.value,etag:r.etag}:null}
async function write(store,key,value,{etag,ttl=180}={}){assertStore(store);return store.set(key,value,{etag,ttl_seconds:ttl})}
function actionDetail(action){
 if(action.kind==='service')return {kind:'service',domain:action.domain,service:action.service,entity_id:action.entity_id,data:action.data};
 if(action.kind==='event')return {kind:'event',event_type:action.event_type,event_data:action.event_data};
 if(action.kind==='read_state')return {kind:'read_state',entity_id:action.entity_id};
 if(action.kind==='list_states')return {kind:'list_states',domain:action.domain,limit:action.limit,authorized_all:action.authorized_all===true};
 if(action.kind==='converse')return {kind:'converse',body:action.body};
 throw new ApprovalError('Unsupported action kind');
}
async function createPending(store,action){
 const existing=await listPending(store);
 if(existing.length>=8)throw new ApprovalError('Too many pending approvals; finish or wait for existing requests to expire');
 const id=randomUUID();
 const request={id,action:actionDetail(action),created_at:Date.now(),expires_at:Date.now()+REQUEST_TTL_MS,status:'pending'};
 await write(store,'pending/'+id,request,{ttl:180});
 return {status:'verification_required',request_id:id,expires_at:new Date(request.expires_at).toISOString(),action:request.action,verify_in:'Home Assistant Control Center'};
}
async function listPending(store){
 assertStore(store);
 const index=await store.list('pending/',50);
 const entries=[];
 for(const row of (index.items||[])){
  const rec=await read(store,row.key);
  if(rec?.value?.status==='pending'&&rec.value.expires_at>Date.now())entries.push({request_id:rec.value.id,expires_at:new Date(rec.value.expires_at).toISOString(),action:rec.value.action});
 }
 return entries;
}
async function verifyCode(store,cfg,method,code){
 const lock=await read(store,'security/failed');
 if(lock?.value?.blocked_until>Date.now())throw new ApprovalError('Approval attempts locked temporarily; try later');
 let verified=false,otpCounter=null;
 if(method==='pin')verified=validCode(code)&&validCode(cfg.approvalPin)&&constantEquals(code,cfg.approvalPin);
 else if(method==='totp'&&cfg.totpSecret){
  otpCounter=verifyTotp(cfg.totpSecret,code);
  if(otpCounter!==null){
    const used=await read(store,'security/totp_last');
    verified=!(used?.value?.counter>=otpCounter);
  }
 } else throw new ApprovalError('Selected authentication method is not configured');
 if(!verified){
  const count=(lock?.value?.fails||0)+1;
  await write(store,'security/failed',{fails:count,blocked_until:count>=5?Date.now()+300_000:0},{etag:lock?.etag,ttl:600});
  throw new ApprovalError('Invalid verification; repeated failures cause a 5-minute lockout');
 }
 if(method==='totp')await write(store,'security/totp_last',{counter:otpCounter},{ttl:60*60*24*90});
 await write(store,'security/failed',{fails:0,blocked_until:0},{etag:lock?.etag,ttl:600});
 return true;
}
let libPromise;
async function webauthn(){
 if(!libPromise)libPromise=import('@simplewebauthn/server').catch(()=>{throw new ApprovalError('Passkey verifier dependency is unavailable')});
 return libPromise;
}
async function beginEnroll(store,cfg,adminCode){
 await verifyCode(store,cfg,'pin',adminCode);
 const {generateRegistrationOptions}=await webauthn();
 const existing=await read(store,'security/passkeys');
 const options=await generateRegistrationOptions({rpName:'Home Assistant for Anna',rpID:PASSKEY_RPID,
 userName:'anna-home-assistant-user',userID:randomBytes(32),attestationType:'none',
 supportedAlgorithmIDs:[-7,-257],authenticatorSelection:{residentKey:'preferred',userVerification:'required'},
 excludeCredentials:(existing?.value?.items||[]).map(x=>({id:x.id,transports:x.transports||[]}))});
 const id=randomUUID();
 await write(store,'security/enroll/'+id,{challenge:options.challenge,created_at:Date.now()},{ttl:150});
 return {enrollment_id:id,options};
}
async function finishEnroll(store,enrollmentId,response){
 const record=await read(store,'security/enroll/'+enrollmentId);
 if(!record||Date.now()-record.value.created_at>120_000)throw new ApprovalError('Passkey enrollment challenge expired');
 const {verifyRegistrationResponse}=await webauthn();
 let verified;try{verified=await verifyRegistrationResponse({response,expectedChallenge:record.value.challenge,
 expectedOrigin:PASSKEY_ORIGIN,expectedRPID:PASSKEY_RPID,requireUserVerification:true});}
 catch{throw new ApprovalError('Passkey registration could not be verified for anna.partners')}
 if(!verified.verified||!verified.registrationInfo?.credential)throw new ApprovalError('Invalid passkey registration');
 const c=verified.registrationInfo.credential;
 const existing=await read(store,'security/passkeys'),items=existing?.value?.items||[];
 if(items.length>=5)throw new ApprovalError('Maximum five passkeys per user');
 if(items.some(x=>x.id===c.id))throw new ApprovalError('Passkey already registered');
 items.push({id:c.id,publicKey:b64(c.publicKey),counter:c.counter,transports:c.transports||[]});
 await write(store,'security/passkeys',{items},{etag:existing?.etag,ttl:365*24*60*60});
 await write(store,'security/enroll/'+enrollmentId,{used:true},{etag:record.etag,ttl:30});
 return {registered:true,count:items.length};
}
async function beginPasskey(store,requestId){
 const pending=await read(store,'pending/'+requestId);
 if(!pending||pending.value.status!=='pending'||pending.value.expires_at<Date.now())throw new ApprovalError('Approval request expired');
 const stored=await read(store,'security/passkeys'),items=stored?.value?.items||[];
 if(!items.length)throw new ApprovalError('Register a passkey first');
 const {generateAuthenticationOptions}=await webauthn();
 const options=await generateAuthenticationOptions({rpID:PASSKEY_RPID,userVerification:'required',
 allowCredentials:items.map(x=>({id:x.id,transports:x.transports}))});
 await write(store,'security/passkey_challenge/'+requestId,{challenge:options.challenge,expires_at:Date.now()+90_000},{ttl:100});
 return {request_id:requestId,options};
}
async function verifyPasskey(store,requestId,response){
 const challenge=await read(store,'security/passkey_challenge/'+requestId);
 if(!challenge||challenge.value.expires_at<Date.now())throw new ApprovalError('Passkey challenge expired');
 const saved=await read(store,'security/passkeys'),items=saved?.value?.items||[];
 const c=items.find(x=>x.id===response?.id);
 if(!c)throw new ApprovalError('Unknown passkey');
 const {verifyAuthenticationResponse}=await webauthn();
 let v;try{v=await verifyAuthenticationResponse({response,expectedChallenge:challenge.value.challenge,
 expectedOrigin:PASSKEY_ORIGIN,expectedRPID:PASSKEY_RPID,requireUserVerification:true,
 credential:{id:c.id,publicKey:Buffer.from(c.publicKey,'base64url'),counter:c.counter,transports:c.transports}})}
 catch{throw new ApprovalError('Passkey verification failed')}
 if(!v.verified)throw new ApprovalError('Passkey verification failed');
 c.counter=v.authenticationInfo.newCounter;
 await write(store,'security/passkeys',{items},{etag:saved.etag,ttl:365*24*60*60});
 await write(store,'security/passkey_challenge/'+requestId,{used:true,expires_at:0},{etag:challenge.etag,ttl:30});
}
async function consumeApproved(store,requestId,execute){
 const rec=await read(store,'pending/'+requestId);
 if(!rec||rec.value.status!=='pending'||rec.value.expires_at<Date.now())throw new ApprovalError('Approval request missing, expired or already processed');
 await write(store,'pending/'+requestId,{...rec.value,status:'executing'},{etag:rec.etag,ttl:180});
 // No retry after a failed Home Assistant API call; replay prevention is more important.
 return execute(rec.value.action);
}
module.exports={REQUEST_TTL_MS,ApprovalError,totp,verifyTotp,validCode,createPending,listPending,verifyCode,beginEnroll,finishEnroll,beginPasskey,verifyPasskey,consumeApproved,read,write};
