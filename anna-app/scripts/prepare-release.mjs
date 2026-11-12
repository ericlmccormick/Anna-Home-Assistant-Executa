import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const id=process.env.ANNA_HOME_ASSISTANT_TOOL_ID?.trim();
if(!id||!(/^[a-zA-Z0-9_-]{3,200}$/.test(id))||id.startsWith("bundled:")||id.startsWith("__")){
 console.error("A real minted Anna Executa tool ID is required. In Anna Advanced → Executa, open Home Assistant Connector and copy its Tool ID. Then set ANNA_HOME_ASSISTANT_TOOL_ID.");
 process.exit(2);
}
const manifestPath=path.join(root,"manifest.json");
const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
manifest.required_executas=[{tool_id:id,version:"latest"}];
manifest.optional_executas=[];
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n");
const sidecar=path.join(root,"bundle","anna-tool-ids.js");
fs.writeFileSync(sidecar,"// Generated for the Anna developer build. No credentials are included.\nwindow.__ANNA_TOOL_IDS__ = "+JSON.stringify({"home-assistant":id})+";\n");
console.log("Prepared Anna App manifest and UI mapping for minted Executa: "+id);
