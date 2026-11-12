#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version="$(node -p 'require("./package.json").version')"
app_ver="$(node -p 'require("./anna-app/package.json").version')"
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
tar -C "$temp" -xzf "dist/home-assistant-anna-app-$app_ver.tar.gz"
profile="$(node -p "require('$temp/executas/home-assistant/executa.json').distribution.active")"
[ "$profile" = binary ] || { echo "Cloud package uses $profile, expected binary" >&2; exit 1; }
archive="$temp/executas/home-assistant/dist/home-assistant-executa-$version-linux-x86_64.tar.gz"
[ -s "$archive" ] || { echo "Cloud Linux archive missing" >&2; exit 1; }
mkdir -p "$temp/installed"
tar -xzf "$archive" -C "$temp/installed"
test -x "$temp/installed/bin/home-assistant-executa"
test -f "$temp/installed/src/manifest.json"
test -f "$temp/bundle/index.html"
test -f "$temp/bundle/anna-tool-ids.js"
printf '{"jsonrpc":"2.0","id":1,"method":"describe"}\n{"jsonrpc":"2.0","id":2,"method":"health"}\n' |
 ANNA_NODE_EXECUTABLE="$(command -v node)" EXECUTA_HOME="$temp/installed" "$temp/installed/bin/home-assistant-executa" > "$temp/responses.jsonl"
node -e 'const fs=require("fs"),r=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);if(r.length!==2||r[0].result?.name!=="home-assistant-connector"||r[1].result?.status!=="ready")process.exit(1);' "$temp/responses.jsonl"
echo "PASS: Cloud Agent Linux binary is bundled, extracts, starts, describes, and reports healthy"
