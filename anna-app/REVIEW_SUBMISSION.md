# Anna Developer Review — Home Assistant Control Center 0.1.3

**Status:** development candidate. Do **not** submit this branch for re-review until the live fresh-install Cloud Agent checklist below has been completed and a video has been captured. Automated tests and an archive smoke test are not a Cloud Agent integration test.

## Store listing (paste into Anna Developer Console → Listing)

- **Name:** Home Assistant Control Center
- **Slug:** `home-assistant-control`
- **Category:** Utilities
- **Tagline:** Connect Home Assistant to Anna with simple, secure controls
- **Logo:** [Home Assistant logo](assets/home-assistant-logo-128.png) (for the Console, prefer uploading the provided 256×256 PNG)
- **Homepage:** https://github.com/ericlmccormick/Anna-Home-Assistant-Executa
- **Support:** https://github.com/ericlmccormick/Anna-Home-Assistant-Executa/issues
- **Privacy policy:** https://github.com/ericlmccormick/Anna-Home-Assistant-Executa/blob/fix/anna-review-2026-11/anna-app/PRIVACY.md

**Long description:**

Connect your own Home Assistant smart home to Anna through a configurable connector. Read sensors, control selected lights, switches, fans, and thermostats, and separately enable actions involving covers, locks, alarms, scenes, scripts, and automations. Every control capability starts disabled. Sensor readings are available after your Home Assistant connection is configured. For each category you can choose Disabled, Enabled, or Verify. Verification requests use a temporary approval queue and can be completed with a configured PIN or authenticator app code; optional phone notifications alert you that a review is pending. The connection wizard explains Cloud Agent versus Local Agent network requirements and guides you through creating the Home Assistant token. A live connection test and effective-permissions checker help confirm the configuration. Your access token is stored in Anna Executa credentials and is never saved in the App window. You must run your own Home Assistant server and make it accessible to the Agent you choose. Cloud Agents require a publicly reachable HTTPS Home Assistant URL. Passkey support is planned but currently unavailable in Anna App windows. Home Assistant Assist, scripts, scenes, and automations can indirectly affect multiple devices; keep them disabled unless adequately restricted in Home Assistant.

## Publish/installation architecture

**Important correction:** Anna App bundling is a *reference* to a **minted tool ID** in the Anna Executa catalogue. It does not install executable files from the App archive. The `bundled:home-assistant` string in the development `manifest.json` is a placeholder only, **not an upload-ready dependency**.

1. Publish the Home Assistant Executa on Anna with **binary Linux x86_64 distribution** (not local distribution); verify Agent installation.
2. Copy the published Executa's minted `tool_id` from the Anna Executa screen.
3. In the repository root run `npm install && npm test && npm run build`.
4. Run `cd anna-app && npm test && npm run build`.
5. In `anna-app`, set `ANNA_HOME_ASSISTANT_TOOL_ID=<real tool ID>`, then run `npm run prepare:release`. This writes the real tool ID into `manifest.json` and `bundle/anna-tool-ids.js` and avoids a broken UI tool lookup. Do **not** use a raw placeholder string.
6. Use the Anna CLI `anna-app apps push` from `anna-app`, then `anna-app apps cut 0.1.3`; verify the UI bundle is `bundle_ready`. **These steps require the user's authenticated Anna developer session or PAT.**
7. Keep App status as DRAFT or a private test version. Install it and check it opens from Installed Apps, then run the Cloud Agent test below.
8. Only then consider a new review submission.

## Requirements for Cloud Agent users

- Own, running Home Assistant instance (not bundled by this product).
- Home Assistant external URL reachable by the **Anna Cloud Agent** over HTTPS with a certificate trusted by the Agent.
- A Home Assistant **long-lived access token** for a separate, least-privileged Home Assistant account. Never send the token to reviewers via email or chat.
- A running Anna Cloud Agent with the Home Assistant Executa installed and active.
- No port-forwarding of plain HTTP. A local-only address such as `192.168.x.x:8123`, `localhost`, or `homeassistant.local` is **not reachable** from the Cloud Agent.
- A Local Agent is appropriate for users who keep Home Assistant on their LAN, but a user still must configure an address accessible from the Local Agent machine. HTTPS remains strongly preferred.

## Disposable Home Assistant test environment

A minimal Home Assistant-compatible demo server lives at [review/demo-ha-server.mjs](../review/demo-ha-server.mjs). It has three simulated entities: `sensor.demo_temperature`, `binary_sensor.demo_motion`, and `light.demo_lamp`. The only mutation it accepts is turning/toggling the demo lamp; lock, alarm, and other dangerous service calls are not implemented.

```bash
# From the repository root; this token is for the throwaway demo server only.
export DEMO_HA_TOKEN="$(openssl rand -hex 24)"
node review/demo-ha-server.mjs
```

The server deliberately binds to `127.0.0.1:8124` only. For an Anna **Cloud Agent**, it must be exposed using a **temporary, trusted HTTPS reverse proxy or tunnel** that reaches this loopback endpoint; use that public HTTPS URL for `HA_URL` and your generated demo token for `HA_TOKEN`. Do not publish the test token in GitHub or share the URL indefinitely. Revoke the URL and stop the demo server after testing. This is a testing fixture, not the official Home Assistant product or a hardened public API.

For a Local Agent running on the same computer, `http://127.0.0.1` is deliberately rejected by the production Executa for security reasons; use a real trusted HA endpoint or an HTTPS reverse proxy instead.

## Fresh-install test plan (use a disposable demo HA environment)

1. Start a fresh Anna **Cloud Agent** and confirm it reports online.
2. Install the Home Assistant Executa's **Linux x86_64 binary** through Anna; verify `describe` and `health`.
3. Create a fresh App install and open the **main** UI window. Confirm the app loads, the logo is visible, and the setup steps make sense without developer knowledge.
4. In Anna → Advanced → Executa → Home Assistant Connector → Credentials, enter a *demo* HTTPS HA URL and a newly issued demo token.
5. Use **Test connection**. Confirm connection succeeds. Re-test with deliberately invalid token (expect clear failure, no token leakage).
6. Verify the default policy: `sensor.*` and `binary_sensor.*` work; all control operations and other entity reads fail closed.
7. In the App choose `lights=enabled`, save draft, copy settings into the Executa's `HA_POLICY_JSON`, and return to check active settings.
8. Call `light.turn_on` on a **noncritical demo light**; verify state change in Home Assistant. Re-disable it and confirm subsequent calls are refused.
9. Set `lights=verify` and configure a demo PIN in native credentials. Request a light change; verify it **does not execute yet**, appears in the pending queue, and executes exactly once after approval.
10. Confirm invalid PIN is rejected, approval expires, replay is rejected, and the approval queue is not usable if the Agent is offline.
11. Test TOTP with a demo seed and authenticator app. Verify that reusing the same code in its time step is rejected.
12. Test optional phone alert only if a test phone is registered; receiving the notification must **not** execute the action.
13. Repeat at desktop width and narrow/mobile viewport; no blank or error-only screen.
14. Uninstall/reinstall. Verify onboarding is clear and no secrets appear in App local storage or chat.
15. Record software versions, final Agent type, test date, Cloud Agent run ID/logs, screenshots, and any failures. Do not claim the test passed if a step is unverified.

## Video for Anna reviewers (record actual Cloud Agent session)

A 3–5 minute screen recording should show: fresh App install → selecting Cloud Agent → setup wizard → native credential form **with token obscured** → successful connection → sensor read → enabling a demo light → command execution → switching to Verify → PIN approval → default-deny example. Show both the Anna App and the corresponding demo Home Assistant device state. Never display real API tokens, PINs or private hostnames.

## Reviewer handoff checklist

- [ ] Logo uploaded to the Anna **listing**, not only checked into GitHub.
- [ ] Two or more **real App screenshots** uploaded to listing, matching the installed build. Repository/previews are *not* substitutes for live screenshots.
- [ ] Long description saved in Anna listing.
- [ ] Real Executa minted tool ID used in App manifest; `bundled:home-assistant` placeholder removed.
- [ ] Executa Linux binary deployed and running on Anna Cloud Agent.
- [ ] New App version `0.1.3` cut with `bundle_ready` UI assets.
- [ ] Fresh Cloud Agent test completed with a demo Home Assistant instance.
- [ ] Reviewer video recorded and shared securely (no secrets shown).
- [ ] Reviewer test environment or a short-lived demo account provided securely (not in public GitHub).
- [ ] Version submitted to review only after all steps pass.
