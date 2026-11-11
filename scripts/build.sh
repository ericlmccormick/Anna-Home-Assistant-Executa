#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version="$(node -p 'require("./package.json").version')"
archive="$PWD/dist/home-assistant-executa-${version}-linux-x86_64.tar.gz"
mkdir -p dist
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage"/{bin,src}
cp bin/home-assistant-executa "$stage/bin/"
cp src/main.js src/security-policy.js src/approval.js src/anna-storage.js src/manifest.json "$stage/src/"
cp archive/manifest.json "$stage/manifest.json"
cp -a node_modules "$stage/node_modules"
chmod 755 "$stage/bin/home-assistant-executa"
tar -C "$stage" -czf "$archive" bin src node_modules manifest.json
printf 'Created %s\n' "$archive"
sha256sum "$archive"
