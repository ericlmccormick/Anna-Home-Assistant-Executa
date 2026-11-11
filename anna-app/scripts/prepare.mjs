import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const root=path.resolve(project,"..");
const target=path.join(project,"executas/home-assistant");
fs.mkdirSync(path.join(target,"src"),{recursive:true});
for(const name of ["main.js","manifest.json","security-policy.js","approval.js","anna-storage.js"]){
  fs.copyFileSync(path.join(root,"src",name),path.join(target,"src",name));
}
const deps=path.join(root,"node_modules");
if(fs.existsSync(deps))fs.cpSync(deps,path.join(target,"node_modules"),{recursive:true,force:true});
const executable=JSON.parse(fs.readFileSync(path.join(root,"executa.json"),"utf8"));
executable.distribution.active="local";
fs.writeFileSync(path.join(target,"executa.json"),JSON.stringify(executable,null,2)+"\n");
fs.writeFileSync(path.join(target,"plugin.js"),"#!/usr/bin/env node\nrequire('./src/main.js').run();\n");
fs.writeFileSync(path.join(target,"package.json"),JSON.stringify({name:"anna-home-assistant-executa-app",version:executable.version,private:true,type:"commonjs",main:"plugin.js",bin:{"anna-home-assistant":"plugin.js"},engines:{node:">=22"}},null,2)+"\n");
const app=JSON.parse(fs.readFileSync(path.join(project,"app.json"),"utf8"));
const manifest=JSON.parse(fs.readFileSync(path.join(project,"manifest.json"),"utf8"));
if(!app.bundled_executas?.["home-assistant"]||!manifest.required_executas?.some(x=>x.tool_id==="bundled:home-assistant"))throw new Error("Bundled Executa declaration is incomplete");
if(manifest.schema!==4)throw new Error("Expected Anna schema 4");
for(const file of ["index.html","app.js","policy.mjs","security-ui.mjs","style.css"]){
 if(!fs.existsSync(path.join(project,"bundle",file)))throw new Error("Missing bundle file: "+file);
}
console.log("Anna companion App prepared with bundled Executa version "+executable.version);
