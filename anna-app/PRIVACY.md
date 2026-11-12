# Privacy Policy — Home Assistant Control Center

**Last updated:** November 12, 2026

Home Assistant Control Center is an independently developed Anna OS integration for a Home Assistant server that you own or administer. This policy describes how the App and its associated Home Assistant Executa handle information. It does not replace the privacy policies of Anna OS or Home Assistant.

## What information is used

- **Connection details:** The Home Assistant URL and long-lived access token are entered into Anna's native Executa credential settings and supplied to the Executa when invoked. The App's browser window does not directly collect or retain your token.
- **Permissions:** The App saves a nonsecret draft of your Disabled/Enabled/Verify preferences in Anna App storage. The active permission policy is stored in Executa credentials.
- **Home Assistant data:** When requested, the Executa retrieves entity states, attributes and responses from your configured Home Assistant server. Home Assistant and Anna may process these requests according to their respective policies.
- **Verification:** If you enable protected commands, the Executa may temporarily store a pending request containing the action and target entity, with expiration. PIN and authenticator codes are submitted to the Executa for verification; the App does not persist them in local browser storage. Passkey support is not currently available in the App.
- **Optional phone notifications:** If you configure a Home Assistant Companion notify service, the Executa sends a description of a pending action to your Home Assistant server for delivery to your registered device.

## How information is used

The integration uses this information only to provide the connection, sensor reading, control, permission, and verification features the user has enabled. It does not contain an advertising SDK or sell Home Assistant data.

## Where information travels

The Executa sends HTTPS API requests from the **selected Anna Agent** to the Home Assistant URL you configure. Cloud Agents require an address reachable from Anna's cloud environment. A Local Agent may be able to use your LAN. Anna's service and Agents may relay tool calls and store App/Executa data. Consult Anna's privacy documentation for platform storage, logging, and retention details.

## Security limitations

Controls are disabled by default, except authenticated sensor reads. Sensitive actions can require additional user verification. This integration has not yet completed end-to-end Cloud Agent security testing. Home Assistant Assist, scripts, scenes, and automations can perform indirect actions that the category controls may not isolate. Use a dedicated Home Assistant user with the minimum permissions appropriate to your installation.

## Retention and removal

Pending action approvals have short expirations. Draft preferences and credentials may remain in Anna until you change or remove them through Anna's settings and storage controls. To revoke integration access immediately, revoke the associated long-lived token in Home Assistant.

## Support and questions

Open an issue at [GitHub Support](https://github.com/ericlmccormick/Anna-Home-Assistant-Executa/issues). Do not share Home Assistant tokens, PINs, personal entity names, or private URLs in public issues.
