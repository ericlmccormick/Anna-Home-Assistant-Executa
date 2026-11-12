// Development-only fake Home Assistant server for Anna Cloud Agent review.
// Use only behind a trusted HTTPS reverse proxy/tunnel. No real home devices.
// Requires a unique DEMO_HA_TOKEN. Binds to 127.0.0.1 by default.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
export function makeDemoServer({token}={}){
 if(!token||typeof token!=='string'||token.length<24)throw new Error('Set a unique DEMO_HA_TOKEN of at least 24 characters');
 const states=new Map([
  ['sensor.demo_temperature',{entity_id:'sensor.demo_temperature',state:'22.5',attributes:{friendly_name:'Demo Room Temperature',unit_of_measurement:'°C'}}],
  ['binary_sensor.demo_motion',{entity_id:'binary_sensor.demo_motion',state:'off',attributes:{friendly_name:'Demo Motion Sensor'}}],
  ['light.demo_lamp',{entity_id:'light.demo_lamp',state:'off',attributes:{friendly_name:'Demo Lamp',brightness:0}}]
 ]);
 let calls=0;
 const respond=(res,status,object)=>{
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   res.end(JSON.stringify(object));
 };
 const server=createServer(async(req,res)=>{
  if(req.headers.authorization!=='Bearer '+token)return respond(res,401,{message:'Unauthorized'});
  const pathname=new URL(req.url,'http://demo.local').pathname;
  if(req.method==='GET'&&pathname==='/api/config')return respond(res,200,{location_name:'Anna Home Assistant Demo',version:'2026.11-demo'});
  if(req.method==='GET'&&pathname==='/api/states')return respond(res,200,Array.from(states.values()));
  if(req.method==='GET'&&pathname.startsWith('/api/states/')){
   const id=decodeURIComponent(pathname.slice('/api/states/'.length));
   return states.has(id)?respond(res,200,states.get(id)):respond(res,404,{message:'Entity not found'});
  }
  if(req.method==='POST'&&pathname.startsWith('/api/services/light/')){
   const svc=pathname.slice('/api/services/light/'.length);
   if(!['turn_on','turn_off','toggle'].includes(svc))return respond(res,400,{message:'Unsupported demo service'});
   let data='';for await(const chunk of req){data+=chunk;if(data.length>8192)return respond(res,413,{message:'Body too large'})}
   let input;try{input=JSON.parse(data)}catch{return respond(res,400,{message:'Invalid JSON'})}
   if(input.entity_id!=='light.demo_lamp')return respond(res,400,{message:'Demo light only'});
   const state=states.get('light.demo_lamp');
   const next=svc==='toggle'?(state.state==='off'?'on':'off'):(svc==='turn_on'?'on':'off');
   states.set('light.demo_lamp',{...state,state:next,attributes:{...state.attributes,brightness:next==='on'?255:0}});
   calls++;
   return respond(res,200,[states.get('light.demo_lamp')]);
  }
  return respond(res,404,{message:'Not implemented by demo server'});
 });
 return {server,states,getCallCount:()=>calls};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const token=process.env.DEMO_HA_TOKEN;
 if(!token||token.length<24){console.error('Set DEMO_HA_TOKEN to a unique 24+ character value.');process.exit(1)}
 const port=Number(process.env.DEMO_HA_PORT||8124);
 const {server}=makeDemoServer({token});
 server.listen(port,'127.0.0.1',()=>console.log('Demo HA running at http://127.0.0.1:'+port+' (local loopback only). HTTPS proxy required for Cloud Agent.'));
}
