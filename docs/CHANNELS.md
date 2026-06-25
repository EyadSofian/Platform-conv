# Channel adapter architecture (Sprint 1)

This platform owns conversations, contacts, messages, and channel connections.
BotPress is now **one optional channel adapter**, not the core architecture.

## The adapter contract

Every channel implements `ChannelAdapter` (`src/lib/channels/types.ts`):

```ts
interface ChannelAdapter {
  type: ChannelType;
  verifyWebhook(req): Promise<WebhookVerificationResult>;
  normalizeWebhook(payload): Promise<NormalizedChannelEvent[]>;
  sendMessage(input): Promise<SendMessageResult>;
  getCapabilities(): ChannelCapabilities;
}
```

Inbound payloads are normalized into a single model
(`NormalizedChannelEvent` — either a `message` or a `status` update) so the rest
of the platform never needs channel-specific branching.

Resolve an adapter with `getChannelAdapter(type, account?)` or
`adapterFromAccount(account)` (`src/lib/channels/registry.ts`). Credentials are
read from a `ChannelAccount` row when present, otherwise from environment
variables (keeping single-tenant `.env` setups working).

### Implemented now

- `WHATSAPP_CLOUD` — full adapter (`whatsapp-cloud.ts`): GET hub-challenge
  verification, `X-Hub-Signature-256` validation, inbound message + status
  normalization, text/template/media send, 24h service window.
- `TELEGRAM` — `telegram.ts`: secret-token verification, update normalization,
  bot `sendMessage`. Webhook at `/api/webhook/telegram`.
- `FACEBOOK_MESSENGER` / `INSTAGRAM` — `meta-messaging.ts`: shared Graph Send
  API + webhook envelope (hub-challenge + `X-Hub-Signature-256`, delivery/read
  receipts). Webhooks at `/api/webhook/messenger` and `/api/webhook/instagram`.
- `WEBCHAT` — `webchat.ts`: first-party widget; inbound at
  `/api/webhook/webchat`, outbound delivered via realtime.
- `BOTPRESS` — wraps the existing BotPress helpers (`botpress.ts`).

All channels except WhatsApp share `handleWebhookIngest` /
`handleWebhookVerification` (`webhook-handler.ts`), which stores the raw event,
verifies the signature, and runs the normalized ingest pipeline.

## WhatsApp Cloud flow

- **Verify webhook**: `GET /api/webhook/whatsapp` echoes `hub.challenge` when the
  verify token matches.
- **Ingest**: `POST /api/webhook/whatsapp` stores the raw payload in
  `WebhookEvent` (idempotent on `(source, externalId)`), verifies the signature,
  then normalizes and ingests messages (deduplicated on the provider `wamid`)
  and delivery/read/failed status updates.
- **Send**: agent replies to WhatsApp contacts go through
  `deliverWhatsAppReply`, which enforces the 24-hour customer service window —
  free-form text inside the window, an approved template outside it
  (`ServiceWindowError` → HTTP 409 otherwise).

## Multi-tenancy

`Organization` + `OrganizationMember` model the workspace. The session/JWT now
carries `organizationId` and `orgRole`. New writes scope by the active
organization; legacy rows (null `organizationId`) are handled by
`resolveOrganizationId()` which falls back to the default workspace during the
backfill window. The migration is fully additive (all new org columns are
nullable), so it applies over existing data without a backfill step.

## Private notes

`ConversationNote` stores internal notes (author, body, org, conversation).
`POST /api/conversations/:id/notes` creates one and emits a `note.created`
realtime event; the inbox renders notes inline, visually distinct from customer
and agent messages, and never sends them to the customer.

## Templates, campaigns & automation (Sprint 2)

### Message templates
- `WhatsAppTemplate` is org-scoped. CRUD at `/api/whatsapp/templates`
  (`?sync=1` pulls from the WhatsApp Cloud API when credentials exist),
  `/api/whatsapp/templates/:id` (GET/PATCH/DELETE), and
  `/api/whatsapp/templates/:id/preview` (renders the body with sample
  variables). `extractTemplateVariables` / `renderTemplatePreview` live in
  `src/lib/whatsapp.ts`.

### WhatsApp campaigns
- `validateCampaignRecipients` (`POST /api/campaigns/:id/validate`) is a dry run
  reporting eligible vs skipped contacts and the reason per skip
  (`missing_phone`, `missing_whatsapp_opt_in`, `unsubscribed`,
  `marketing_paused`, …).
- `sendCampaignNow` sends WhatsApp campaigns as **approved templates** through
  the Cloud adapter (free-form marketing is never sent), respecting opt-in /
  `marketingPaused` / `unsubscribed`, quiet hours (timezone-aware, can wrap past
  midnight), and the per-minute rate limit. Non-WhatsApp campaigns keep the
  BotPress path.
- Per-recipient status (`queued/sent/delivered/read/failed/replied`) and the
  campaign counters are updated as WhatsApp delivery/read/failed webhooks arrive
  (matched on the stored message id) and when a contact replies.

### Automation rules
- `AutomationRule` (org-scoped) pairs a trigger with an action. The engine
  (`runAutomations`) runs on inbound ingest for `NEW_CONVERSATION`,
  `NEW_MESSAGE`, `MESSAGE_KEYWORD`, and `CHANNEL_IS` triggers; actions
  `ADD_TAG`, `ASSIGN_AGENT`, `NOTIFY`, `CLOSE`, `SNOOZE`, and `SEND_WEBHOOK` are
  implemented (others are scaffolded). Rules are managed at
  `/api/automation-rules` (+ `/:id`) and the **Settings → Automation** page;
  editing requires ADMIN/SUPERVISOR. Failures are isolated per rule so a bad
  rule never blocks ingestion.

## Reporting, integrations & reliability (Sprint 3)

### Reporting
- `buildReport` (`/api/reports?days=N`, org-scoped) returns channel mix, open vs
  closed, **first-response** and **resolution** times, agent workload, campaign
  delivery/read/reply rates, **WhatsApp template performance**, and contact
  growth. The Reports page renders it live.

### Integrations
- `Integration` (org-scoped) pairs an `IntegrationType`
  (ODOO/HUBSPOT/SHOPIFY/ZAPIER/WEBHOOK/BOTPRESS) with config + secret
  credentials (never returned to the client — `redactIntegration`).
- `dispatchIntegrationEvent(orgId, event, data)` fans platform events out to
  enabled integrations subscribed to that event; ZAPIER/WEBHOOK perform an HTTP
  POST, HubSpot/Shopify are scaffolded, Odoo keeps its dedicated service. Wired
  to `message.received` on inbound ingest. Managed at `/api/integrations`
  (ADMIN/SUPERVISOR), with per-integration error capture.

### Security & reliability
- `AuditLog` persists sensitive actions (integration + automation changes) via
  `writeAudit`, alongside the structured console log.
- `/api/health` now checks database connectivity and returns 503 when down.
- Webhooks remain idempotent (raw `WebhookEvent` stored, deduped on the provider
  message id) and signature-verified per channel.
