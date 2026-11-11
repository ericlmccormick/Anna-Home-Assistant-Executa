# Anna Home Assistant Control Center (development branch)

A companion Anna OS App for the **Home Assistant Executa**. This app is intentionally isolated on the `feature/anna-control-center` branch and is **not ready for public release**.

## What Anna already provides

Anna's **Advanced → Executa** view includes a native credential configuration form. This is where users enter `HA_URL`, `HA_TOKEN`, and any reserved `HA_APPROVAL_PIN`. The Anna App Host API currently documents tools calls and application storage, but **no secure API for writing another Executa's credentials**. Therefore the App never collects, transmits, stores, or logs the HA token or PIN.

## Settings UI

- Default: sensor/binary_sensor reads allowed after standard HA token authentication. Everything else starts disabled.
- Each other group offers **Disabled / Enabled / Require PIN**. Garage/doors, locks, and security recommend PIN, but permit users to choose any mode.
- Current `PIN` mode blocks operation; there is no verified PIN approval path yet. Do not advertise it as complete.
- Users can save a **draft** policy in Anna App storage, copy JSON, and paste it into the Executa credential `HA_POLICY_JSON`. The Executa enforces that policy after the native credential is updated.
- A live `get_permissions` tool reads active settings back without exposing URL/token/PIN. Test connection uses the existing secure Executa credentials.

## Build / test

Requires Node.js 22+, no npm dependencies.

```bash
cd anna-app
npm test
npm run build
# after installing @anna-ai/cli, with a local Agent and Anna sign-in:
npm run validate
npm run dev
```

`npm run build` vendors the branch's Executa source into `anna-app/executas/home-assistant` for local app development and does not touch `main`.

## Future secure settings API

The missing platform feature is a **trusted, user-authorized Executa credential write** from an App. Do NOT pass URL tokens or raw PINs through `tools.invoke` arguments, chat prompts, or Anna App storage.

Before shipping functional PIN protections:
1. Confirm Anna supports trusted App identity and secure settings updates for a bundled Executa.
2. Keep a per-user permission policy in Executa-owned APS scope `tool`; deny policy mutations from arbitrary AI callers.
3. Implement action-specific, single-use approval challenges bound to the exact target, payload, requester, and user, with expiration, rate limits, secure PIN verification, and replay prevention. Do not send raw PINs as LLM tool parameters.
4. Ensure all paths—including Home Assistant Assist, templates, scenes, scripts, automations and custom events—are gated consistently. Assist may perform device control inside HA and cannot be made safe by an Executa service-call allowlist.
5. Verify credential isolation and local-network behavior on real Anna Local/Cloud Agents.

**Do not publish or merge until an end-to-end live Anna Agent test validates policy enforcement.**
