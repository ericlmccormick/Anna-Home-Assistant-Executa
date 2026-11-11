# Home Assistant Connector for Anna OS (Executa)

Reusable **Anna Executa tool** for Home Assistant, adapted from the [Pebble Home Assistant Bridge](https://github.com/ericlmccormick/Pebble-HA-plug-in). The Pebble apps and bridge are unchanged.

## Status

**v0.1.0 developer preview**. The stdio protocol, mocked Home Assistant API interactions, and Linux archive are tested. Installation and live Home Assistant calls on a real Anna Agent are **not yet verified**. This repository is an Executa, **not an Anna App with a UI**; a companion App may be added later for marketplace/grant eligibility.

## Tools

| Tool | Behavior | Access |
| --- | --- | --- |
| `test_connection` | Checks authenticated `/api/config` | Read |
| `get_state` | Fetches one entity and attributes | Read |
| `list_states` | Lists up to 100 entities, optionally by domain | Read |
| `converse` | Sends text to Home Assistant Assist and returns response plus conversation ID | Assist; HA agent may trigger actions |
| `call_service` | Allowlisted services for light, switch, fan, climate, scene, automation, script | **Off by default** |
| `fire_event` | Fires a named HA event | **Off by default** |

The allowlist excludes direct lock, alarm-panel, and cover commands, but scenes, scripts, and automations **can themselves have security-sensitive effects**. There is no strong platform-enforced confirmation guarantee; callers must still obtain user confirmation and use least-privileged HA credentials.

### Credentials (configured in the Anna Executa settings)

- `HA_URL`: required HTTPS base URL, e.g. `https://your-ha-host:8123` (no `/api` or trailing path).
- `HA_TOKEN`: required long-lived Home Assistant access token; injected as a *sensitive credential* per invocation, never passed through tool parameters.
- `HA_ENABLE_CONTROL`: optional, `false` by default. Set `true` only to enable `call_service` and `fire_event`.
- `HA_ALLOW_LOCAL_HTTP`: optional, `false` by default. Set `true` only for a private RFC1918 IPv4 or `.local` hostname reached by a **local** Agent. **HTTP transmits the token without encryption.**

Cloud Agents generally cannot access private LAN Home Assistant addresses without additional secure connectivity. This Executa deliberately disables HTTP-to-public-IP connections, URL credentials, path/query parameters, and HTTP redirects.

## Local development

Node.js 22 is recommended; no npm dependencies are required.

```bash
npm test
npm run build
# Prints JSON-RPC describe, then exits at EOF
printf '{"jsonrpc":"2.0","id":1,"method":"describe"}\n' | node src/main.js
```

For a safe local smoke test **only**, export `HA_URL` and `HA_TOKEN` into your terminal environment, then send `invoke` requests. Avoid shell history and never commit tokens. Credentials in an actual Anna Agent come from `params.context.credentials` and are not read from environment variables.

## Anna installation and publishing

1. Install the Anna CLI (`npm install -g @anna-ai/cli`) and confirm `anna-app doctor` passes.
2. Develop locally with `node src/main.js` or configure an Anna local Executa pointing to the entry point. `executa.json` includes a local profile, and a binary profile for a release.
3. Run `npm test && npm run build`. The file `dist/home-assistant-executa-0.1.0-linux-x86_64.tar.gz` contains a runnable shim, source and an archive-level `manifest.json`.
4. In Anna **Advanced → Executa / My Tools**, mint the server-assigned `tool_id` and create a **private** tool first. Do not invent or hardcode an ID.
5. For binary release, change `executa.json`'s active distribution profile to `binary`; upload the archive using Anna's supported release workflow, or provide the artifact from a tagged GitHub Release. The archive depends on the shared Node 22 runtime and declares that in `executa.json`.
6. Install and run `describe`, `health`, and `test_connection` on a real Anna Agent before switching visibility to `public` or `app_bundled`.

The GitHub Actions workflow runs tests and produces a `.tar.gz` artifact on pushes and pull requests; it does **not** automatically publish to Anna.

Official references: [Anna Executa protocol](https://anna.partners/developers/tools/executa-protocol), [Credentials](https://anna.partners/developers/tools/executa-credentials), [Binary distribution](https://anna.partners/developers/tools/executa-binary), and [Shared runtimes](https://anna.partners/developers/tools/executa-platform-runtimes).

## Planned follow-ups

- Live Anna Agent validation and platform-conformance fixes.
- Native optional Home Assistant Agent and Assist pipeline discovery.
- A companion Anna App (UI) for install/onboarding and Founding Builder qualification.
- Confirmation from Anna of cross-App Executa invocation and usage attribution.

## Security and licensing

No Home Assistant token is stored in this repository or logged by the Executa. Anna stores and injects the user's credential per call. Prefer a dedicated, least-privileged Home Assistant user. Use HTTPS by default. Home Assistant's own user permissions still apply; `converse` can issue commands through HA Assist even when `HA_ENABLE_CONTROL=false`.

License: MIT. Third-party Home Assistant and Anna trademarks belong to their owners. This project is not affiliated with either platform.