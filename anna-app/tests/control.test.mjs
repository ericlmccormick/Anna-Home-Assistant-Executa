import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PERMISSIONS,DEFAULT,normalize,exportPolicy} from "../bundle/policy.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
test("sensor reads default enabled, all other access disabled",()=>{
 assert.equal(DEFAULT.sensor_read,"enabled");
 for(const [k,value] of Object.entries(DEFAULT))if(k!=="sensor_read")assert.equal(value,"disabled",k);
});
test("locks, covers and security recommend PIN but default to disabled",()=>{
 for(const key of ["locks","covers","security"]){
   const item=PERMISSIONS.find(x=>x.key===key);
   assert.equal(item.recommend,"verify");
   assert.equal(DEFAULT[key],"disabled");
 }
});
test("all categories support tri-state policy (except fixed sensor read)",()=>{
 const policy=normalize({locks:"enabled",lights:"verify",events:"disabled"});
 assert.equal(policy.locks,"enabled");
 assert.equal(policy.lights,"verify");
 assert.equal(policy.events,"disabled");
 assert.equal(policy.sensor_read,"enabled");
});
test("reject invalid category values and sensor security weakening",()=>{
 assert.throws(()=>normalize({unknown:"enabled"}));
 assert.throws(()=>normalize({locks:"open"}));
 assert.throws(()=>normalize({sensor_read:"disabled"}));
});
test("exported policy is valid JSON with all expected categories",()=>{
 const p=JSON.parse(exportPolicy({lights:"enabled"}));
 assert.equal(p.lights,"enabled");
 assert.equal(Object.keys(p).length,PERMISSIONS.length);
});
test("Anna App schema uses bundled Executa with no extra permissions",()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,"app.json"),"utf8"));
 const m=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
 assert.equal(m.schema,4);
 assert.equal(m.required_executas[0].tool_id,"bundled:home-assistant");
 assert.ok(app.bundled_executas["home-assistant"]);
 assert.equal(m.ui.bundle.entry,"index.html");
});
test("UI includes explicit draft-only warning and does not store credential fields",()=>{
 const html=fs.readFileSync(path.join(root,"bundle/index.html"),"utf8");
 const js=fs.readFileSync(path.join(root,"bundle/app.js"),"utf8");
 assert.match(html,/Advanced → Executa → Home Assistant Connector → Credentials/);
 assert.match(html,/Cloud Agent/);
 assert.match(html,/Local Agent/);
 assert.match(html,/anna-tool-ids.js/);
 assert.match(html,/HA_TOKEN/);
 assert.match(html,/HA_POLICY_JSON/);
 assert.match(html,/verification-code/);
 assert.match(html,/enroll-passkey/);
 assert.match(html,/HA_TOTP_SECRET/);
 assert.match(html,/HA_PHONE_NOTIFY_SERVICE/);
 assert.doesNotMatch(js,/storage\.set\(\{[^}]*HA_TOKEN/s);
});

test("Cloud release profile and front-end tool mapping are declared",()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,"app.json"),"utf8"));
 assert.equal(app.version,"0.1.2");
 assert.ok(fs.existsSync(path.join(root,"bundle","anna-tool-ids.js")));
 const main=fs.readFileSync(path.join(root,"bundle","app.js"),"utf8");
 assert.match(main,/AnnaAppRuntime\.connect/);
 assert.match(main,/Anna connection timed out/);
});
