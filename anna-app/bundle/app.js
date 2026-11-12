// Load Anna SDK lazily: the onboarding screen still renders when the host or SDK is unavailable.
let AnnaAppRuntime=null;
try { ({AnnaAppRuntime}=await import("/static/anna-apps/_sdk/latest/index.js")); } catch { /* standalone preview: no Anna host */ }
import {PERMISSIONS,DEFAULT,normalize,exportPolicy} from "./policy.mjs";
import {setupSecurity} from "./security-ui.mjs";
const $=id=>document.getElementById(id);
const KEY="ha-control-policy-draft-v1";
let anna=null,toolId=null,policy={...DEFAULT},activePolicy=null;
const notice=(message)=>{$("message").textContent=message;};
const status=(id,label,variant="muted")=>{const e=$(id);e.textContent=label;e.className="status "+variant;};

function render(){
 const list=$("policy-list");list.replaceChildren();
 for(const item of PERMISSIONS){
  const row=document.createElement("div");row.className="policy-row";
  const info=document.createElement("div");info.className="policy-info";
  const name=document.createElement("div");name.className="policy-name";name.textContent=item.label;info.append(name);
  const desc=document.createElement("p");desc.className="policy-desc";desc.textContent=item.detail;info.append(desc);
  if(item.recommend){
   const tip=document.createElement("div");tip.className="policy-tip";tip.textContent="Recommended: require PIN for this category";info.append(tip);
  }
  const select=document.createElement("select");select.className="policy-control";
  select.id="perm-"+item.key;select.setAttribute("aria-label",item.label);
  for(const [value,label] of [["disabled","Disabled"],["enabled","Enabled"],["verify","Verify"]]){
    if(item.fixed && value!=="enabled")continue;
    const o=document.createElement("option");o.value=value;o.textContent=label;select.append(o);
  }
  select.value=policy[item.key];select.disabled=Boolean(item.fixed);
  select.addEventListener("change",()=>{
    policy[item.key]=select.value;
    status("changes-status","Unsaved draft","muted");
    notice("Permission draft changed. To activate it, choose Copy Settings and paste into Anna’s Executa credential form.");
  });
  row.append(info,select);list.append(row);
 }
}

async function loadDraft(){
 try{
  const response=anna?await anna.storage.get({key:KEY}):{value:JSON.parse(localStorage.getItem(KEY)||"null")};
  policy=normalize(response?.value);
 }catch{policy={...DEFAULT};}
 render();
}
async function saveDraft(){
 const draft=normalize(policy);
 try{
  if(anna)await anna.storage.set({key:KEY,value:draft});
  else localStorage.setItem(KEY,JSON.stringify(draft));
  status("changes-status","Draft saved","ok");
  notice("Draft saved. These settings are NOT enforced until you paste the policy into Anna's HA_POLICY_JSON credential.");
 }catch(e){notice("Unable to save draft: "+e.message);}
}
async function copyPolicy(){
 const output=exportPolicy(policy);
 try{
  await navigator.clipboard.writeText(output);
  notice("Settings copied. Paste into the Permissions policy field in Anna → Executa → Home Assistant Connector → Credentials, then click Read active settings.");
 }catch{
  const textarea=document.createElement("textarea");textarea.value=output;textarea.readOnly=true;textarea.style.width="100%";textarea.rows=10;
  const modal=$("message");modal.replaceChildren(document.createTextNode("Clipboard unavailable. Select and copy the JSON below: "),textarea);
  textarea.focus();textarea.select();
 }
}
async function discoverToolId(){
 if(window.__ANNA_TOOL_IDS__?.["home-assistant"])return window.__ANNA_TOOL_IDS__["home-assistant"];
 const tools=await anna.tools.list({});
 const match=(tools?.tools||[]).find(x=>[x.tool_name,x.plugin_name,x.name].some(name=>["home-assistant-connector","Home Assistant Connector","get_permissions"].includes(name)||String(name||"").includes("home-assistant")));
 return match?.tool_id||null;
}
async function invoke(method,args={}){
 if(!anna)throw new Error("The App is not connected to the Anna host.");
 if(!toolId)toolId=await discoverToolId();
 if(!toolId)throw new Error("Bundled Home Assistant Executa is not installed or enabled.");
 const res=await anna.tools.invoke({tool_id:toolId,method,args});
 const r=res?.result??res;
 if(r?.success===false)throw new Error(r.error||"Executa rejected the request");
 return r?.data??r;
}
async function testConnection(){
 status("connection-status","Checking…");
 try{
  const result=await invoke("test_connection");
  status("connection-status",result.connected?"Connected":"Unavailable",result.connected?"ok":"error");
  notice(result.connected?"Connected to "+(result.name||"Home Assistant")+".":"Unable to connect.");
 }catch(e){status("connection-status","Not connected","error");notice("Connection check failed: "+e.message+". Confirm the Agent can access your Home Assistant URL and the access token is valid.");}
}
async function readPolicy(){
 try{
  const res=await invoke("get_permissions");
  activePolicy=normalize(res.policy);
  const different=PERMISSIONS.filter(x=>activePolicy[x.key]!==policy[x.key]).length;
  $("effective-policy").textContent="Current permissions: "+PERMISSIONS.filter(x=>activePolicy[x.key]==="enabled").map(x=>x.label).join(", ")+". "+different+" setting(s) differ from your draft. Verification methods: PIN "+(res.pin_configured?"ready":"not set")+", TOTP "+(res.totp_configured?"ready":"not set")+".";
  status("changes-status",different===0?"Matches active":"Draft differs",different===0?"ok":"muted");
 }catch(e){$("effective-policy").textContent="Cannot read active policy: "+e.message;}
}
$("save-draft").addEventListener("click",saveDraft);
$("copy-json").addEventListener("click",copyPolicy);
$("reset").addEventListener("click",()=>{policy={...DEFAULT};render();status("changes-status","Unsaved draft");notice("Default access restored in draft: sensors only. Copy and apply the policy to change the Executa.");});
$("connection-test").addEventListener("click",testConnection);
$("refresh-policy").addEventListener("click",readPolicy);
async function connectAnna(){
 if(!AnnaAppRuntime){
   notice("Setup preview: the Anna runtime is unavailable. The settings page is still usable, but live tests require installation inside Anna.");
   return false;
 }
 try{
  anna=await Promise.race([AnnaAppRuntime.connect(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Anna connection timed out")),9000))]);
  document.getElementById("runtime-indicator")?.replaceChildren(document.createTextNode("Connected to Anna"));
  return true;
 }catch(e){notice("Anna connection unavailable ("+e.message+"). Open this App from Anna's Installed Apps after selecting an online Agent.");return false}
}
await connectAnna();
await loadDraft();
setupSecurity({invoke,notice});
