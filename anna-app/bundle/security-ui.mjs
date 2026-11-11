/* Browser-only approval UI. Codes and passkey assertions are sent directly from the
   Anna iframe to the Executa through tools.invoke; never into chat or App storage. */
const $=id=>document.getElementById(id);
function fromB64(v){const b=atob(String(v).replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(v.length/4)*4,'='));return Uint8Array.from(b,c=>c.charCodeAt(0))}
function toB64(bytes){const b=new Uint8Array(bytes);let s='';for(const byte of b)s+=String.fromCharCode(byte);return btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function serialize(cred,registration=false){
 const r=cred.response;
 return {id:cred.id,rawId:toB64(cred.rawId),type:'public-key',clientExtensionResults:cred.getClientExtensionResults?.()||{},
 response:registration?{clientDataJSON:toB64(r.clientDataJSON),attestationObject:toB64(r.attestationObject),
 transports:r.getTransports?.()||[]}:{
  clientDataJSON:toB64(r.clientDataJSON),authenticatorData:toB64(r.authenticatorData),
  signature:toB64(r.signature),userHandle:r.userHandle?toB64(r.userHandle):null
 }};
}
function webauthnAvailable(){return !!(window.isSecureContext&&navigator.credentials&&window.PublicKeyCredential)}
function base32(bytes){
 const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let out="",buffer=0,bits=0;
 for(const v of bytes){buffer=(buffer<<8)|v;bits+=8;while(bits>=5){out+=alphabet[(buffer>>>(bits-5))&31];bits-=5}}
 if(bits)out+=alphabet[(buffer<<(5-bits))&31];return out;
}
function el(tag,className,txt){const e=document.createElement(tag);if(className)e.className=className;if(txt!==undefined)e.textContent=txt;return e}
export function setupSecurity({invoke,notice}){
 const status=$("security-status"),list=$("security-pending");
 function msg(s){status.textContent=s;notice(s)}
 async function reload(){
  list.replaceChildren();msg("Loading pending requests…");
  try{
   const [permissions,res]=await Promise.all([invoke('get_permissions'),invoke('list_pending')]);
   $("security-methods").textContent="PIN: "+(permissions.pin_configured?"configured":"not configured")+
    " · Authenticator: "+(permissions.totp_configured?"configured":"not configured")+
    " · Passkeys: "+(webauthnAvailable()?"browser supports WebAuthn":"browser not supported")+
    " · Phone notifications: "+(permissions.phone_notifications?"configured":"not configured");
   const pending=res.pending||[];
   if(!pending.length){list.append(el("p","small","No pending actions. Requests expire after 2 minutes."));msg("Approval queue is empty.");return}
   for(const p of pending){
    const row=el("div","pending-row");
    const a=p.action||{};
    row.append(el("strong","",
      a.kind==="service"?a.domain+"."+a.service+" → "+a.entity_id:
      a.kind==="event"?"Event: "+a.event_type:
      a.kind==="read_state"?"Read: "+a.entity_id:
      a.kind==="list_states"?"Read entity list: "+(a.domain||"all domains"):
      a.kind==="converse"?"Assist: "+String(a.body?.text||"").slice(0,200):
      "Unknown request"));
    row.append(el("p","small","Request expires "+new Date(p.expires_at).toLocaleTimeString()));
    const button=el("button","button primary","Review and verify");
    button.type="button";button.addEventListener("click",()=>approve(p.request_id,button));
    row.append(button);list.append(row);
   }
   msg(pending.length+" action(s) awaiting verification.");
  }catch(e){msg("Cannot load approvals: "+e.message);}
 }
 async function approve(id,button){
  button.disabled=true;const method=$("verification-method").value;
  try{
   let result;
   if(method==="passkey"){
    if(!webauthnAvailable())throw new Error("Passkeys are unavailable in this embedded browser. Choose an authenticator code or PIN.");
    const data=await invoke("begin_passkey_approval",{request_id:id});
    const options=data.options;
    const publicKey={...options,challenge:fromB64(options.challenge),
      allowCredentials:(options.allowCredentials||[]).map(c=>({...c,id:fromB64(c.id)}))};
    const cred=await navigator.credentials.get({publicKey});
    if(!cred)throw new Error("Authenticator was cancelled");
    result=await invoke("approve_action",{request_id:id,method:"passkey",response:serialize(cred)});
   }else{
    const input=$("verification-code");
    const code=input.value.trim();input.value=""; // don't retain secrets after submit
    if(!/^[0-9]{6,12}$/.test(code))throw new Error("Enter your 6-digit authenticator code or 6–12 digit PIN");
    result=await invoke("approve_action",{request_id:id,method,code});
   }
   msg(result.executed?"Verified and executed "+(result.entity_id||result.event_type):"Verified, but the action was not executed");
   await reload();
  }catch(e){msg("Approval not completed: "+e.message)}finally{button.disabled=false}
 }
 async function enroll(){
  if(!webauthnAvailable()){msg("Passkeys unavailable in this Anna browser. Anna must permit WebAuthn in its App iframe.");return}
  const pinField=$("enroll-pin");const adminPin=pinField.value;pinField.value="";
  if(!/^[0-9]{6,12}$/.test(adminPin)){msg("Enter your existing native Executa approval PIN to authorize registration.");return}
  const button=$("enroll-passkey");button.disabled=true;
  try{
    const begin=await invoke("begin_passkey_enrollment",{admin_pin:adminPin});
    const o=begin.options;
    const publicKey={...o,challenge:fromB64(o.challenge),user:{...o.user,id:fromB64(o.user.id)},
      excludeCredentials:(o.excludeCredentials||[]).map(c=>({...c,id:fromB64(c.id)}))};
    const cred=await navigator.credentials.create({publicKey});
    if(!cred)throw new Error("Registration cancelled");
    const response=serialize(cred,true);
    const finish=await invoke("finish_passkey_enrollment",{enrollment_id:begin.enrollment_id,response});
    msg(finish.registered?"Passkey registered. It can now authorize exact pending actions.":"Passkey registration did not complete.");
    await reload();
  }catch(e){msg("Passkey setup failed: "+e.message)}finally{button.disabled=false}
 }
 function generateTotp(){
  const bytes=crypto.getRandomValues(new Uint8Array(20));
  const secret=base32(bytes);
  const uri="otpauth://totp/Home%20Assistant%20for%20Anna?secret="+secret+"&issuer=Home%20Assistant%20for%20Anna&algorithm=SHA1&digits=6&period=30";
  const output=$("totp-seed");output.textContent="Secret (copy to HA_TOTP_SECRET in Anna Executa credentials): "+secret+"\n\nAuthenticator app setup URI:\n"+uri;
  msg("Secret generated locally and displayed once. Configure it in an authenticator app AND the native Executa credential field. Clear this page afterward.");
 }
 $("security-refresh").addEventListener("click",reload);
 $("enroll-passkey").addEventListener("click",enroll);
 $("generate-totp").addEventListener("click",generateTotp);
 $("clear-totp").addEventListener("click",()=>{$("totp-seed").textContent="";msg("Secret removed from this view.")});
 reload();
}
