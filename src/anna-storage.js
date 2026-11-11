'use strict';
const {randomUUID}=require('node:crypto');
class StorageError extends Error{}
function makeReverseRPC(write=frame=>process.stdout.write(JSON.stringify(frame)+'\n')){
 const waiting=new Map();
 function response(frame){
  if(!frame||frame.id===undefined||!waiting.has(String(frame.id)))return false;
  const entry=waiting.get(String(frame.id));waiting.delete(String(frame.id));clearTimeout(entry.timeout);
  if(frame.error)entry.reject(new StorageError('Anna storage request failed'));
  else entry.resolve(frame.result||{});
  return true;
 }
 function call(ctx,method,params,timeoutMs=6000){
  if(!ctx||!ctx.invoke_id||!ctx.storage_token)return Promise.reject(new StorageError('Anna secure storage unavailable; protocol v2 required'));
  return new Promise((resolve,reject)=>{
   const id='ha-rpc-'+randomUUID();
   const timeout=setTimeout(()=>{waiting.delete(id);reject(new StorageError('Anna storage request timed out'))},timeoutMs);
   waiting.set(id,{resolve,reject,timeout});
   try{write({jsonrpc:'2.0',id,method,params:{...params,context:{invoke_id:ctx.invoke_id}}})}
   catch{clearTimeout(timeout);waiting.delete(id);reject(new StorageError('Anna RPC unavailable'))}
  });
 }
 function storage(ctx){
  return {
   get:(key)=>call(ctx,'storage/get',{scope:'tool',key}),
   set:(key,value,opts={})=>call(ctx,'storage/set',{scope:'tool',key,value,
      ...(opts.etag?{if_match:opts.etag}:{}),...(opts.ttl_seconds?{ttl_seconds:opts.ttl_seconds}:{})}),
   list:(prefix,limit=50)=>call(ctx,'storage/list',{scope:'tool',prefix,limit}),
   delete:(key)=>call(ctx,'storage/delete',{scope:'tool',key}),
  };
 }
 return {response,call,storage};
}
module.exports={makeReverseRPC,StorageError};
