# Home Assistant for Anna — Control Center v0.1.1

**Private development branch only.** The App and Executa can be installed together through Anna's bundled Executa mechanism; live Agent installation is not yet verified.

## Design

The App is UI only; the Executa owns authentication and the Home Assistant API calls. Every user installs their own Executa instance and configures their own native credentials. The App has no ability to read or overwrite Anna's secure credential store.

**Out-of-the-box:** sensor and binary_sensor readings permitted after Home Assistant authentication; every other operation disabled. All configurable categories offer Disabled / Enabled / Verify; doors, locks, and alarms recommend Verify. Existing \`pin\` policy values are interpreted as \`verify\`.

When a caller requests a Verify-mode service/event:
1. Executa validates the exact domain/service/entity/data or event, then saves it in per-user Executa APS tool storage for at most two minutes.
2. The caller receives a \`VERIFICATION_REQUIRED\` result with a request ID; optionally, an HA Companion App notification is sent.
3. User opens this Control Center (Anna cannot currently be made to pop it open from an arbitrary Executa), checks the exact device and action, and approves with passkey/PIN/TOTP.
4. Executa validates proof, atomically consumes the action record, and executes **that stored action**, never freeform command arguments from the approval App. Pending actions expire and cannot be replayed.
5. Failure of Anna storage, invalid credentials, expired challenges, missing WebAuthn support or failed PIN/TOTP verification must **not execute the action**.

## Secure setup

In **Anna → Advanced → Executa → Learned → Home Assistant Connector → Credentials**, configure:

| Executa credential | Use |
|---|---|
| \`HA_URL\` | HTTPS Home Assistant base URL, required |
| \`HA_TOKEN\` | HA long-lived access token, required; sensitive |
| \`HA_POLICY_JSON\` | Active permission policy; paste the Control Center's exported JSON |
| \`HA_APPROVAL_PIN\` | Optional 6–12 digit numeric PIN for approvals and bootstrap passkey enrollment; sensitive |
| \`HA_TOTP_SECRET\` | Optional Base32 authenticator seed; sensitive |
| \`HA_PHONE_NOTIFY_SERVICE\` | Optional HA companion notify service, e.g. \`mobile_app_pixel_10_pro\` |
| \`HA_APPROVAL_LINK\` | Optional verified \`https://anna.partners/...\` Control Center deep link for phone alerts |
| \`HA_ALLOW_LOCAL_HTTP\` | Optional explicit local HTTP mode; not recommended |

**Don't enter PINs, authenticator codes, passkey replies, or tokens into Anna chat.** PIN/TOTP are accepted only via direct Control Center \`anna.tools.invoke\` calls; these still travel through Anna's RPC infrastructure and must be vetted against platform logging before production.

### Use a passkey

Set \`HA_APPROVAL_PIN\` as an enrollment bootstrap credential. In Control Center, enter it once in the **Register passkey** form. The browser uses \`navigator.credentials.create\`; the Executa verifies the signed registration with \`@simplewebauthn/server\` (origin \`https://anna.partners\`, RP \`anna.partners\`, required user verification) and saves only the public key in Executa APS. Subsequent requests use \`navigator.credentials.get\` and short-lived challenge verification.

**Platform blocker:** Anna's iframe must be same-origin or allow \`publickey-credentials-create\` and \`publickey-credentials-get\` through its embedding policy. WebAuthn support has not been tested in a live Anna App. Passkey failures are fail-closed.

### Use an authenticator app

Click **Generate authenticator seed** in Control Center (generated locally in the browser, not saved). Add the Base32 secret to your authenticator app, then paste the same secret in Anna's native \`HA_TOTP_SECRET\` credential. TOTP follows RFC 6238, HMAC-SHA1, six digits, 30-second steps, ±1 time-step tolerance. Authenticator codes are single-use per counter; failed attempts are rate limited. The device/Anna Agent should keep accurate time.

### Use a PIN

Configure \`HA_APPROVAL_PIN\` in native Executa credentials (6–12 numeric digits). Choose PIN in Control Center and enter it into the password field to approve a pending command. Repeated failures cause a 5-minute lockout. PIN values aren't stored in App local storage, but the native Anna credential store retains the configured secret.

### Phone approval notification

Configure \`HA_PHONE_NOTIFY_SERVICE\` with the registered mobile companion notify service. An action requiring verification can send an informative notification to the phone (and optionally an "Open Anna" link if \`HA_APPROVAL_LINK\` is configured). **Tapping the notification is never accepted as identity verification**; the user must use passkey/TOTP/PIN in Control Center. This avoids relying on unauthenticated HA notification action events.

## Risks and limitations

- **There is no verified, universal Executa-initiated secure popup or App credential-write API.** Policy settings remain a draft until exported into \`HA_POLICY_JSON\`; secrets must be entered in the native credential form.
- **Home Assistant Assist, scenes, scripts, automations, and custom events are not sandboxed by category.** For example, a script could unlock a door even if \`locks=disabled\`. Keep those categories disabled unless the user trusts all its indirect effects. A fully isolated HA user/agent is required for strong separation.
- The \`list_pending\` method is visible to any caller of this Executa and currently returns pending entity information. The absence of a host-attested calling-App identity means it is **not yet suitable for public release** where third-party apps are untrusted.
- WebAuthn enrollment is gated by an existing native PIN (not anonymous first-use). A third-party app that obtained that PIN could attempt enrollment. Do not treat native PIN as cryptographically equivalent to a passkey.
- Tests mock Home Assistant and Anna APIs. Real Anna Agent, iframe WebAuthn, companion notification, and end-to-end PIN/code/passkey behavior need live testing and a security review.
- Android/iOS phone-notification deep-link format is user configured; there is no assumed direct app-launch URL.

## Development

\`\`\`bash
npm install
npm test
npm run build
cd anna-app
npm test
npm run build
# Real Anna Agent + installed @anna-ai/cli required for:
npm run validate
npm run dev
\`\`\`

The root GitHub CI builds a Linux archive and a bundled Anna App. It does **not** publish anything or modify the default branch.

Relevant documentation:
- [Anna Executa lifecycle and reverse RPC](https://anna.partners/developers/tools/executa-lifecycle)
- [Anna persistent storage](https://anna.partners/developers/tools/executa-storage)
- [Anna App Host API](https://anna.partners/developers/apps/app-ui-host-api)
- [WebAuthn iframe permissions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/publickey-credentials-create)
- [HA Companion actionable notifications](https://companion.home-assistant.io/docs/notifications/actionable-notifications/)
