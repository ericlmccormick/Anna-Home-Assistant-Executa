# Home Assistant for Anna OS — Control Center development branch

> **Branch:** `feature/anna-control-center` · Executa `0.1.1` · Anna companion App `0.1.0`
> **Status:** integration preview, not approved for public deployment. `main` and both Pebble projects remain unchanged.

This project provides a reusable Home Assistant Executa and a companion Anna App to configure a per-device-category security policy with PIN, TOTP, and optional WebAuthn passkey verification. It is adapted from [Pebble Home Assistant Bridge](https://github.com/ericlmccormick/Pebble-HA-plug-in).

## What works now

- **Executa:** JSON-RPC stdio, credential-secured Home Assistant API access, entity state reads, Assist conversation, allowlisted service calls, custom events, permission status, and fail-closed policy enforcement.
- **Default policy:** `sensor.*` and `binary_sensor.*` are readable without an additional permission gate, **after** the user configures Home Assistant authentication. Every other read/control capability defaults to **disabled**.
- **Tri-state policy:** Each configurable category supports `disabled`, `enabled`, or `pin`. Locks, doors/covers and security systems are marked verification-recommended, but the user can choose their own state.
- **Anna companion App:** Responsive settings UI, policy draft storage, export/copy as JSON, test connection, and active-policy readback through `get_permissions`. See [anna-app/README.md](anna-app/README.md).

## Important limitations

1. Anna provides a native **Advanced → Executa** credential form. Its documented App Host API does **not** provide a secure API to write an Executa's `HA_URL`, `HA_TOKEN` or PIN. The App therefore **never collects or stores those secrets**. Enter them in Anna's native Executa settings.
2. The App saves a **nonsecret permission draft**. To enforce your selections, copy the generated JSON into the native Executa credential `HA_POLICY_JSON`. The Executa reads and enforces that value for every invocation, including calls originating from other Anna apps.
3. **Approval requires Anna v2 per-user storage and a trusted Control Center interaction.** Verify mode queues an exact action for 120 seconds. A user can approve with an Anna-managed 6–12 digit PIN, a configured TOTP authenticator code, or a WebAuthn passkey if the Anna App iframe supports it. Phone notifications are convenience prompts, not verification. This has not been deployed on a live Anna Agent yet.
4. **Home Assistant Assist may trigger device actions internally.** Even requiring verification for an Assist request cannot enforce the separate device categories inside HA; strong separation requires the HA account/agent to restrict allowed domains.
5. Only automated tests, protocol smoke tests and packaging have been verified. No live Anna Agent or Home Assistant integration tests have yet been completed.

## Native Executa credentials

| Field | Required | Notes |
| --- | --- | --- |
| `HA_URL` | Yes | HTTPS base URL without a path/query |
| `HA_TOKEN` | Yes | Anna-managed sensitive credential; use an appropriate HA user |
| `HA_POLICY_JSON` | No | JSON from companion App; empty means sensor-only default |
| `HA_APPROVAL_PIN` | No | Native secure PIN for explicit approvals and passkey enrollment |
| `HA_TOTP_SECRET` | No | Native secure Base32 authenticator seed |
| `HA_PHONE_NOTIFY_SERVICE` | No | HA Companion mobile notify service for informative approval alerts |
| `HA_APPROVAL_LINK` | No | Optional verified Anna App link used by notifications |
| `HA_ALLOW_LOCAL_HTTP` | No | False by default; local private network only, unsafe without TLS |

No Home Assistant token or PIN is passed as an LLM-visible tool argument, stored in Anna App storage, or logged by the Executa.

## Capabilities

| Executa tool | Policy |
| --- | --- |
| `test_connection` | Allowed when credentials configured |
| `get_permissions` | Reads active policy; never returns secrets |
| `get_state` | Sensors enabled; other states disabled or queued for Verify |
| `list_states` | Sensors available by default; other states disabled or queued for Verify |
| `converse` | Assist disabled by default; optional Verify mode creates pending request |
| `call_service` | Domain-specific permission; disabled by default |
| `fire_event` | Events disabled by default; Verify creates a pending request |

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

The CI workflow runs Executa security/API tests and companion App tests, builds a Linux archive and prepares the bundled App sources. An end-to-end live Anna deployment, passkey iframe compatibility check, and security review are still required. See [the Control Center setup and limitations](anna-app/README.md).

## Release rule

Do **not** merge to `main`, publish, or expose physical security controls until an authenticated Anna Agent test confirms tool installation, credentials, correct execution of all three policy modes, safe PIN approval, and handling of cross-app calls.

Resources: [Anna Executa protocol](https://anna.partners/developers/tools/executa-protocol), [Anna credential security](https://anna.partners/developers/tools/executa-credentials), [Anna App UI Host API](https://anna.partners/developers/apps/app-ui-host-api).

Licensed MIT. Independent community integration; not affiliated with Anna or Home Assistant.
