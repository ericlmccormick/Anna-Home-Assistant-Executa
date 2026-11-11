#!/usr/bin/env node
'use strict';
// Anna Executa JSON-RPC 2.0 over stdio. Zero third-party dependencies.
const readline = require('node:readline');
const manifest = require('./manifest.json');
const ID = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const PART = /^[a-z][a-z0-9_]*$/;
const ALLOWED_SERVICES = Object.freeze({
  light: ['turn_on','turn_off','toggle'],
  switch: ['turn_on','turn_off','toggle'],
  fan: ['turn_on','turn_off','toggle','set_percentage'],
  climate: ['set_temperature','set_hvac_mode'],
  scene: ['turn_on'],
  automation: ['trigger'],
  script: ['turn_on']
});

class InputError extends Error {}
class UpstreamError extends Error {}
const fail = (message) => ({success:false,error:message});
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
  return {url, token, control:parseBool(val('HA_ENABLE_CONTROL'))};
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
function requireControl(cfg) {if(!cfg.control) throw new InputError('Device control disabled. Set HA_ENABLE_CONTROL=true in this Executa’s credentials to enable it.');}
async function invoke(tool, args={}, context={}, fetcher=globalThis.fetch) {
  if (!args || typeof args!=='object' || Array.isArray(args)) throw new InputError('arguments must be an object');
  let cfg;
  try {
    cfg=config(context);
    switch(tool) {
      case 'test_connection': {
        const c=await request(cfg,'/api/config','GET',undefined,fetcher);
        return ok({connected:true,name:String(c.location_name||'Home Assistant').slice(0,100),version:c.version||null});
      }
      case 'get_state': {
        const id=entityId(args.entity_id);
        const state=await request(cfg,`/api/states/${encodeURIComponent(id)}`,'GET',undefined,fetcher);
        return ok({entity_id:state.entity_id,state:state.state,attributes:state.attributes||{},last_changed:state.last_changed,last_updated:state.last_updated});
      }
      case 'list_states': {
        const domain=args.domain===undefined?'':part(args.domain,'domain');
        const limit=args.limit===undefined?50:args.limit;
        if(!Number.isInteger(limit)||limit<1||limit>100) throw new InputError('limit must be 1–100');
        const states=await request(cfg,'/api/states','GET',undefined,fetcher);
        if(!Array.isArray(states))throw new UpstreamError('Unexpected Home Assistant states response');
        const items=states.filter(s=>s&&typeof s.entity_id==='string'&&(!domain||s.entity_id.startsWith(domain+'.')));
        return ok({count:items.length,returned:Math.min(items.length,limit),entities:items.slice(0,limit).map(s=>({entity_id:s.entity_id,name:s.attributes?.friendly_name||s.entity_id,state:s.state,unit:s.attributes?.unit_of_measurement||null,last_changed:s.last_changed||null}))});
      }
      case 'converse': {
        const text=requiredString(args.text,'text',4000);
        const body={text,language:'en'};
        if(args.agent_id!==undefined)body.agent_id=requiredString(args.agent_id,'agent_id',180);
        if(args.conversation_id!==undefined)body.conversation_id=requiredString(args.conversation_id,'conversation_id',180);
        const data=await request(cfg,'/api/conversation/process','POST',body,fetcher);
        return ok({text:String(data.response?.speech?.plain?.speech||''),conversation_id:data.conversation_id||'',response_type:data.response?.response_type||''});
      }
      case 'call_service': {
        requireControl(cfg);
        const domain=part(args.domain,'domain'),service=part(args.service,'service');
        if(!ALLOWED_SERVICES[domain]?.includes(service))throw new InputError('Service is not on the initial safety allowlist');
        const id=entityId(args.entity_id);
        if(!id.startsWith(domain+'.'))throw new InputError('entity_id must belong to the requested domain');
        const data=obj(args.data,'data');
        if(['entity_id','target','area_id','device_id'].some(k=>Object.hasOwn(data,k)))throw new InputError('Put the exact target in entity_id; data cannot override targets');
        const result=await request(cfg,`/api/services/${domain}/${service}`,'POST',{...data,entity_id:id},fetcher);
        return ok({executed:true,domain,service,entity_id:id,result_count:Array.isArray(result)?result.length:null});
      }
      case 'fire_event': {
        requireControl(cfg);
        const type=part(args.event_type,'event_type');
        const data=obj(args.event_data,'event_data');
        const result=await request(cfg,`/api/events/${type}`,'POST',data,fetcher);
        return ok({fired:true,event_type:type,message:result?.message||'Event submitted'});
      }
      default: throw Object.assign(new Error(`Unknown tool: ${tool}`),{code:-32601});
    }
  } catch(e) {
    if(e instanceof InputError || e instanceof UpstreamError)return fail(e.message);
    if(e.code===-32601)throw e;
    return fail('Unexpected integration error; inspect Home Assistant logs');
  }
}
function respond(id,payload){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...payload})+'\n');}
async function handle(req, fetcher=globalThis.fetch) {
  if(!req || req.jsonrpc!=='2.0' || typeof req.method!=='string')return {error:{code:-32600,message:'Invalid request'}};
  if(req.method==='describe')return {result:manifest};
  if(req.method==='health')return {result:{status:'ready'}};
  if(req.method!=='invoke')return {error:{code:-32601,message:'Method not found'}};
  const p=req.params||{};
  if(typeof p.tool!=='string')return {error:{code:-32602,message:'Tool name required'}};
  try {return {result:await invoke(p.tool,p.arguments||{},p.context||{},fetcher)};}
  catch(e){return {error:{code:e.code||-32603,message:e.code===-32601?'Unknown tool':'Internal error'}};}
}
function run() {
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',async line=>{
    if(!line.trim())return;
    let req;try{req=JSON.parse(line);}catch{return respond(null,{error:{code:-32700,message:'Parse error'}});}
    const output=await handle(req);if(req?.id!==undefined)respond(req.id,output);
  });
}
if(require.main===module)run();
module.exports={handle,invoke,config,safeBase,isPrivateIPv4,request,run,ALLOWED_SERVICES};