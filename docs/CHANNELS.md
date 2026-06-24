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
- `BOTPRESS` — wraps the existing BotPress helpers (`botpress.ts`).

Other channel types throw "not implemented yet" from the registry until their
adapters land.

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
