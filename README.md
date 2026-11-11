# Home Assistant for Anna OS — Control Center development branch

> **Branch:** `feature/anna-control-center` · Executa `0.2.0-alpha.1` · Anna companion App `0.1.0`  
> **Status:** integration preview, not approved for public deployment. `main` and both Pebble projects remain unchanged.

This project provides a reusable Home Assistant Executa and a companion Anna App to configure a per-device-category security policy. It is adapted from [Pebble Home Assistant Bridge](https://github.com/ericlmccormick/Pebble-HA-plug-in).

## What works now

- **Executa:** JSON-RPC stdio, credential-secured Home Assistant API access, entity state reads, Assist conversation, allowlisted service calls, custom events, permission status, and fail-closed policy enforcement.
- **Default policy:** `sensor.*` and `binary_sensor.*` are readable without an additional permission gate, **after** the user configures Home Assistant authentication. Every other read/control capability defaults to **disabled**.
- **Tri-state policy:** Each configurable category supports `disabled`, `enabled`, or `pin`. Locks, doors/covers and security systems are marked PIN-recommended, but the user can choose their own state.
- **Anna companion App:** Responsive settings UI, policy draft storage, export/copy as JSON, test connection, and active-policy readback through `get_permissions`. See [anna-app/README.md](anna-app/README.md).

## Important limitations

1. Anna provides a native **Advanced → Executa** credential form. Its documented App Host API does **not** provide a secure API to write an Executa's `HA_URL`, `HA_TOKEN` or PIN. The App therefore **never collects or stores those secrets**. Enter them in Anna's native Executa settings.
2. The App saves a **nonsecret permission draft**. To enforce your selections, copy the generated JSON into the native Executa credential `HA_POLICY_JSON`. The Executa reads and enforces that value for every invocation, including calls originating from other Anna apps.
3. **PIN enforcement is not operational.** Selecting `pin` currently rejects the action with `PIN_REQUIRED` rather than executing it. `HA_APPROVAL_PIN` is reserved for a future secure, verified approval protocol. Do not interpret setting a PIN as authorizing a sensitive action.
4. **Home Assistant Assist may trigger device actions internally.** Enabling `assist` does not provide per-action protection inside HA, so control boundaries must also be enforced by the Home Assistant account/agent.
5. Only automated tests and packaging have been verified. No live Anna Agent or Home Assistant integration tests have yet been completed.

## Native Executa credentials

| Field | Required | Notes |
| --- | --- | --- |
| `HA_URL` | Yes | HTTPS base URL without a path/query |
| `HA_TOKEN` | Yes | Anna-managed sensitive credential; use an appropriate HA user |
| `HA_POLICY_JSON` | No | JSON from companion App; empty means sensor-only default |
| `HA_APPROVAL_PIN` | No | Reserved; PIN actions remain blocked |
| `HA_ALLOW_LOCAL_HTTP` | No | False by default; local private network only, unsafe without TLS |

No Home Assistant token or PIN is passed as an LLM-visible tool argument, stored in Anna App storage, or logged by the Executa.

## Capabilities

| Executa tool | Policy |
| --- | --- |
| `test_connection` | Allowed when credentials configured |
| `get_permissions` | Reads active policy; never returns secrets |
| `get_state` | Sensor reads enabled; other states require `other_read` |
| `list_states` | Defaults to only `sensor` and `binary_sensor`; other domains require `other_read` |
| `converse` | `assist` disabled by default |
| `call_service` | Domain-specific permission; disabled by default |
| `fire_event` | `events` disabled by default |

Direct service categories: lights, switches, fans, thermostats, scenes, automations, scripts, covers, locks, and security. The strict allowlist remains in the Executa code. These are not an exhaustive Home Assistant API surface.

## Test and build

Requires Node.js 22+. No third-party runtime dependencies.

```bash
npm test
npm run build

cd anna-app
npm test
npm run build
# with Anna CLI installed and authenticated:
npm run validate
npm run dev
```

The CI workflow runs **22 Executa tests and 7 companion App tests**, builds a Linux archive and prepares the bundled App sources. The CLI validation and an end-to-end live Anna deployment still need to be run with an actual account/Agent.

## Release rule

Do **not** merge to `main`, publish, or expose physical security controls until an authenticated Anna Agent test confirms tool installation, credentials, correct execution of all three policy modes, safe PIN approval, and handling of cross-app calls.

Resources: [Anna Executa protocol](https://anna.partners/developers/tools/executa-protocol), [Anna credential security](https://anna.partners/developers/tools/executa-credentials), [Anna App UI Host API](https://anna.partners/developers/apps/app-ui-host-api).

Licensed MIT. Independent community integration; not affiliated with Anna or Home Assistant.
