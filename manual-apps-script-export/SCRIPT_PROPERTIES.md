# SCRIPT_PROPERTIES.md

Property **names** only — no values, no secrets. Set these under Project Settings → Script
Properties in the Apps Script editor, after pasting all files in and replacing the manifest, but
before running `setupCRM()`. Source: `apps-script/Config.gs`'s `SCRIPT_PROPERTY_KEYS`.

| Property name | Required? | Notes |
|---|---|---|
| `CRM_API_KEY` | Yes | The API key the Next.js backend must send with every request. Generate a fresh random value yourself — this file does not, and must not, contain it. |
| `CRM_SIGNING_SECRET` | Yes | The HMAC signing secret shared with the Next.js backend's `CRM_SIGNING_SECRET` env var. Generate a fresh random value yourself. |
| `CRM_SPREADSHEET_ID` | Yes | The ID of the Google Sheet this script is bound to (the long string in the Sheet's URL between `/d/` and `/edit`). |
| `BUSINESS_TIMEZONE` | No | Defaults to `America/La_Paz` if unset. Only set this if the business is genuinely in a different timezone. |
| `GOOGLE_CALENDAR_ID` | No | Only needed if `ENABLE_CALENDAR_SYNC` is `true`. |
| `ENABLE_CALENDAR_SYNC` | No | Set to the literal string `true` to turn on optional Calendar sync; anything else (or unset) keeps it off. |
| `INTERNAL_NOTIFICATION_EMAIL` | No | Only used for optional internal alerting, if applicable. |

Never write the actual values of `CRM_API_KEY` or `CRM_SIGNING_SECRET` into this file, any other
document, a commit, or a chat — only their names, as above. The Next.js backend needs the same
`CRM_API_KEY` and `CRM_SIGNING_SECRET` values in its own environment (`CRM_APPS_SCRIPT_URL`,
`CRM_API_KEY`, `CRM_SIGNING_SECRET` — see this repo's `APPS_SCRIPT_SETUP.md`) — copy them there
directly, not through any document.
