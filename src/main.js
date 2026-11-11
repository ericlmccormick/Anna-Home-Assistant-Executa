#!/usr/bin/env node
'use strict';
// Anna Executa JSON-RPC 2.0 over stdio. Zero third-party dependencies.
const readline = require('node:readline');
const manifest = require('./manifest.json');
const approval=require('./approval');
const {makeReverseRPC}=require('./anna-storage');
const {normalizePolicy,modeFor,isSensor,categoryForDomain} = require('./security-policy');
const ID = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const PART = /^[a-z][a-z0-9_]*$/;
const ALLOWED_SERVICES = Object.freeze({
  light: ['turn_on','turn_off','toggle'],
  switch: ['turn_on','turn_off','toggle'],
  fan: ['turn_on','turn_off','toggle','set_percentage'],
  climate: ['set_temperature','set_hvac_mode'],
  scene: ['turn_on'],
  automation: ['trigger'],
  script: ['turn_on'],
  cover: ['open_cover','close_cover','stop_cover'],
  lock: ['lock','unlock'],
  alarm_control_panel: ['alarm_arm_home','alarm_arm_away','alarm_disarm']
});

class InputError extends Error {}
class UpstreamError extends Error {}
const fail = (message,data) => ({success:false,error:message,...(data?{data}:{})});
const ok = (data) => ({success:true,data});
function requiredString(value, name, max=200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InputError(`${name} must be a nonempty string (max ${max} characters)`);
  return value.trim();
}
function parseBool(value) { return value === true || (typeof value === 'string' && /^(true|1|yes)$/i.test(value)); }
function isPrivateIPv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every(p=>/^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255)) return false;
  const [a,b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function safeBase(raw, allowLocalHTTP) {
  const text = requiredString(raw,'HA_URL',500);
  let url;
  try {url = new URL(text);} catch {throw new InputError('HA_URL must be an absolute URL');}
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new InputError('HA_URL must contain only scheme, hostname and optional port (no credentials/path/query)');
  }
  const host=url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host === 'localhost.' || host.startsWith('127.') || host.startsWith('169.254.') || host.startsWith('0.') || host === '0.0.0.0' || host === '[::1]' || host.endsWith('.localhost')) {
    throw new InputError('Loopback and wildcard hosts are not allowed');
  }
  if (url.protocol === 'http:') {
    const mdns = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+local$/i.test(host);
    if (!allowLocalHTTP || !(isPrivateIPv4(host) || mdns)) {
      throw new InputError('HTTP requires HA_ALLOW_LOCAL_HTTP=true and an RFC1918 IPv4 or .local hostname');
    }
  }
  return url.origin;
}
function config(context={}) {
  const c = context.credentials || {};
  // Environment variables only when running outside an Agent, for manual testing.
  const dev = !process.env.ANNA_RUNTIME_PROFILE;
  const val = k => c[k] ?? (dev ? process.env[k] : undefined);
  const token = requiredString(val('HA_TOKEN'),'HA_TOKEN',4096);
  const url = safeBase(val('HA_URL'),parseBool(val('HA_ALLOW_LOCAL_HTTP')));
  let policy;
  try { policy=normalizePolicy(val('HA_POLICY_JSON')); }
  catch(e) { throw new InputError(e.message); }
  return {url,token,policy,
    approvalPin:val('HA_APPROVAL_PIN'),totpSecret:val('HA_TOTP_SECRET'),
    phoneNotifyService:val('HA_PHONE_NOTIFY_SERVICE'),approvalLink:val('HA_APPROVAL_LINK'),
    pin_configured:approval.validCode(val('HA_APPROVAL_PIN')),
    totp_configured:typeof val('HA_TOTP_SECRET')==='string' && val('HA_TOTP_SECRET').length>=16
  };
}
function entityId(s) {const id=requiredString(s,'entity_id',200); if(!ID.test(id))throw new InputError('Invalid Home Assistant entity_id');return id;}
function part(s,name) {const v=requiredString(s,name,80);if(!PART.test(v))throw new InputError(`Invalid ${name}`);return v;}
function obj(value, name, max=8192) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`${name} must be an object`);
  if (JSON.stringify(value).length > max) throw new InputError(`${name} exceeds ${max} characters`);
  return value;
}
async function request(cfg,path,method='GET',body,fetcher=globalThis.fetch) {
  let response;
  try {
    response = await fetcher(cfg.url+path,{
      method,redirect:'manual',signal:AbortSignal.timeout(12000),
      headers:{Authorization:`Bearer ${cfg.token}`,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
  } catch {throw new UpstreamError('Home Assistant unavailable; check URL, TLS certificate and Agent network access');}
  if(response.status >= 300 && response.status < 400) throw new UpstreamError('Home Assistant redirected the request; redirects are disabled to protect the access token');
  if(response.status === 401 || response.status === 403) throw new UpstreamError(`Home Assistant rejected authentication (${response.status})`);
  if(!response.ok) throw new UpstreamError(`Home Assistant returned HTTP ${response.status}`);
  const raw=await response.text();
  if(raw.length>4_000_000) throw new UpstreamError('Home Assistant response exceeded size limit');
  if(!raw)return {};
  try {return JSON.parse(raw);}catch {return {text:raw.slice(0,4000)};}
}
function authorize(cfg,category) {
  const mode=modeFor(cfg.policy,category);
  if(mode==='disabled')throw new InputError(`PERMISSION_DISABLED: ${category} is disabled in Home Assistant connector settings`);
  if(mode==='verify'||mode==='pin')throw new InputError(`VERIFICATION_REQUIRED: ${category} requires user verification through Home Assistant Control Center`);
}
function validService(args){
  const domain=part(args.domain,'domain'),service=part(args.service,'service');
  const category=categoryForDomain(domain);
  if(!category || !ALLOWED_SERVICES[domain]?.includes(service))throw new InputError('Service is not on the allowed list');
  const id=entityId(args.entity_id);
  if(!id.startsWith(domain+'.'))throw new InputError('entity_id must belong to the requested domain');
  const data=obj(args.data,'data');
  if(['entity_id','target','area_id','device_id'].some(k=>Object.hasOwn(data,k)))throw new InputError('Service data cannot override entity targets');
  return {category,action:{kind:'service',domain,service,entity_id:id,data}};
}
function validEvent(args){
  return {category:'events',action:{kind:'event',event_type:part(args.event_type,'event_type'),event_data:obj(args.event_data,'event_data')}};
}
async function executeAction(cfg,action,fetcher){
  if(action.kind==='service'){
    const {category}=validService(action); // revalidate stored action
    if(categoryForDomain(action.domain)!==category)throw new InputError('Category mismatch');
    const value=await request(cfg,`/api/services/${action.domain}/${action.service}`,'POST',{...action.data,entity_id:action.entity_id},fetcher);
    return {executed:true,kind:'service',domain:action.domain,service:action.service,entity_id:action.entity_id,result_count:Array.isArray(value)?value.length:null};
  }
  if(action.kind==='event'){
    const {action:e}=validEvent(action);
    const r=await request(cfg,`/api/events/${e.event_type}`,'POST',e.event_data,fetcher);
    return {executed:true,kind:'event',event_type:e.event_type,message:r?.message||'Event submitted'};
  }
  throw new InputError('Unknown pending action type');
}
async function phoneNotice(cfg,receipt,fetcher){
  const svc=cfg.phoneNotifyService;
  if(!svc)return false;
  if(!/^mobile_app_[a-z0-9_]{1,80}$/.test(svc))return false;
  const summary=receipt.action?.kind==='service'?`${receipt.action.domain}.${receipt.action.service} on ${receipt.action.entity_id}`:`Custom event: ${receipt.action?.event_type}`;
  const data={title:'Anna Home Assistant: verification required',message:`Pending: ${summary}. Open the Home Assistant Control Center in Anna to verify. Expires in 2 minutes.`};
  if(cfg.approvalLink){
    try{const u=new URL(cfg.approvalLink);if(u.protocol==='https:'&&u.hostname==='anna.partners')data.data={actions:[{action:'URI',title:'Review in Anna',uri:u.href}]} }catch{}
  }
  try{await request(cfg,`/api/services/notify/${svc}`,'POST',data,fetcher);return true}catch{return false}
}
async function invoke(tool, args={}, context={}, fetcher=globalThis.fetch, store=null) {
  if (!args || typeof args!=='object' || Array.isArray(args)) throw new InputError('arguments must be an object');
  let cfg;
  try {
    cfg=config(context);
    switch(tool) {
      case 'get_permissions': {
        return ok({policy:cfg.policy,pin_configured:cfg.pin_configured,totp_configured:cfg.totp_configured,passkey_available:!!store,phone_notifications:!!cfg.phoneNotifyService,source:'anna_executa_credentials'});
      }
      case 'list_pending': {
        const entries=await approval.listPending(store);
        return ok({pending:entries});
      }
      case 'begin_passkey_enrollment': {
        const res=await approval.beginEnroll(store,cfg,requiredString(args.admin_pin,'admin_pin',16));
        return ok(res);
      }
      case 'finish_passkey_enrollment': {
        const res=await approval.finishEnroll(store,requiredString(args.enrollment_id,'enrollment_id'),obj(args.response,'response',16000));
        return ok(res);
      }
      case 'begin_passkey_approval': {
        const res=await approval.beginPasskey(store,requiredString(args.request_id,'request_id'));
        return ok(res);
      }
      case 'approve_action': {
        const id=requiredString(args.request_id,'request_id',80);
        const method=requiredString(args.method,'method',20);
        if(method==='passkey') await approval.verifyPasskey(store,id,obj(args.response,'response',16000));
        else if(method==='pin'||method==='totp') await approval.verifyCode(store,cfg,method,requiredString(args.code,'code',16));
        else throw new InputError('Choose pin, totp, or passkey');
        const result=await approval.consumeApproved(store,id,a=>{
          const category=a.kind==='service'?validService(a).category:validEvent(a).category;
          if(modeFor(cfg.policy,category)!=='verify')throw new InputError('Approval cancelled: effective permission policy changed');
          return executeAction(cfg,a,fetcher);
        });
        return ok({...result,request_id:id,verified_by:method});
      }
      case 'test_connection': {
        const c=await request(cfg,'/api/config','GET',undefined,fetcher);
        return ok({connected:true,name:String(c.location_name||'Home Assistant').slice(0,100),version:c.version||null});
      }
      case 'get_state': {
        const id=entityId(args.entity_id);
        authorize(cfg,isSensor(id)?'sensor_read':'other_read');
        const state=await request(cfg,`/api/states/${encodeURIComponent(id)}`,'GET',undefined,fetcher);
        return ok({entity_id:state.entity_id,state:state.state,attributes:state.attributes||{},last_changed:state.last_changed,last_updated:state.last_updated});
      }
      case 'list_states': {
        const domain=args.domain===undefined?'':part(args.domain,'domain');
        const limit=args.limit===undefined?50:args.limit;
        if(!Number.isInteger(limit)||limit<1||limit>100) throw new InputError('limit must be 1–100');
        if(domain && domain!=='sensor' && domain!=='binary_sensor')authorize(cfg,'other_read');
        const includeOther=!domain && modeFor(cfg.policy,'other_read')==='enabled';
        const states=await request(cfg,'/api/states','GET',undefined,fetcher);
        if(!Array.isArray(states))throw new UpstreamError('Unexpected Home Assistant states response');
        const items=states.filter(s=>s&&typeof s.entity_id==='string'&&(!domain||s.entity_id.startsWith(domain+'.'))&&(includeOther||isSensor(s.entity_id)||(domain && domain!=='sensor'&&domain!=='binary_sensor')));
        return ok({count:items.length,returned:Math.min(items.length,limit),entities:items.slice(0,limit).map(s=>({entity_id:s.entity_id,name:s.attributes?.friendly_name||s.entity_id,state:s.state,unit:s.attributes?.unit_of_measurement||null,last_changed:s.last_changed||null}))});
      }
      case 'converse': {
        authorize(cfg,'assist');
        const text=requiredString(args.text,'text',4000);
        const body={text,language:'en'};
        if(args.agent_id!==undefined)body.agent_id=requiredString(args.agent_id,'agent_id',180);
        if(args.conversation_id!==undefined)body.conversation_id=requiredString(args.conversation_id,'conversation_id',180);
        const data=await request(cfg,'/api/conversation/process','POST',body,fetcher);
        return ok({text:String(data.response?.speech?.plain?.speech||''),conversation_id:data.conversation_id||'',response_type:data.response?.response_type||''});
      }
      case 'call_service': {
        const {category,action}=validService(args);
        const mode=modeFor(cfg.policy,category);
        if(mode==='disabled')throw new InputError('PERMISSION_DISABLED: '+category);
        if(mode==='pin'||mode==='verify'){
          const receipt=await approval.createPending(store,action);
          await phoneNotice(cfg,receipt,fetcher);
          return fail('VERIFICATION_REQUIRED: approve in Home Assistant Control Center',receipt);
        }
        return ok(await executeAction(cfg,action,fetcher));
      }
      case 'fire_event': {
        const {category,action}=validEvent(args);
        const mode=modeFor(cfg.policy,category);
        if(mode==='disabled')throw new InputError('PERMISSION_DISABLED: '+category);
        if(mode==='pin'||mode==='verify'){
          const receipt=await approval.createPending(store,action);
          await phoneNotice(cfg,receipt,fetcher);
          return fail('VERIFICATION_REQUIRED: approve in Home Assistant Control Center',receipt);
        }
        return ok(await executeAction(cfg,action,fetcher));
      }
      default: throw Object.assign(new Error(`Unknown tool: ${tool}`),{code:-32601});
    }
  } catch(e) {
    if(e instanceof InputError || e instanceof UpstreamError || e instanceof approval.ApprovalError)return fail(e.message);
    if(e.code===-32601)throw e;
    return fail('Unexpected integration error; inspect Home Assistant logs');
  }
}
function respond(id,payload){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...payload})+'\n');}
async function handle(req, fetcher=globalThis.fetch, transport=null) {
  if(!req || req.jsonrpc!=='2.0' || typeof req.method!=='string')return {error:{code:-32600,message:'Invalid request'}};
  if(req.method==='describe')return {result:manifest};
  if(req.method==='health')return {result:{status:'ready'}};
  if(req.method==='initialize')return {result:{protocolVersion:'2.0',server_info:{name:'home-assistant-connector',version:manifest.version},capabilities:{storage:{}}}};
  if(req.method==='notifications/initialized')return {result:{}};
  if(req.method!=='invoke')return {error:{code:-32601,message:'Method not found'}};
  const p=req.params||{};
  if(typeof p.tool!=='string')return {error:{code:-32602,message:'Tool name required'}};
  try {return {result:await invoke(p.tool,p.arguments||{},p.context||{},fetcher,transport?.storage(p.context||{})||null)};}
  catch(e){return {error:{code:e.code||-32603,message:e.code===-32601?'Unknown tool':'Internal error'}};}
}
function run() {
  const transport=makeReverseRPC();
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',async line=>{
    if(!line.trim())return;
    let req;try{req=JSON.parse(line);}catch{return respond(null,{error:{code:-32700,message:'Parse error'}});}
    if(req?.method===undefined && transport.response(req))return;
    const output=await handle(req,globalThis.fetch,transport);if(req?.id!==undefined)respond(req.id,output);
  });
}
if(require.main===module)run();
module.exports={handle,invoke,config,safeBase,isPrivateIPv4,request,run,ALLOWED_SERVICES,authorize,validService,executeAction};