# BotPress Operations Inbox

A sellable BotPress-first conversation management platform. BotPress remains
the channel gateway (Facebook Messenger, WhatsApp, Webchat, Telegram, …); this
app receives every conversation event, stores it, surfaces it in a unified
inbox, and lets your team take over from the bot and reply through BotPress.

> Every conversation BotPress sees appears in the Inbox — including ones the
> bot is still handling. Human takeover, resume-bot, and close are first-class
> actions.

## Stack

- Next.js 14 App Router, TypeScript, Tailwind CSS
- Prisma ORM with PostgreSQL
- NextAuth.js credentials auth with JWT sessions (route + page middleware)
- Socket.io sidecar server for live inbox events
- Bull campaign queue with a no-Redis direct-send fallback
- BotPress webhook ingest and outbound messaging bridge

## Local setup

1. Copy `.env.example` to `.env.local` and fill the values.
2. Start PostgreSQL and set `DATABASE_URL`.
3. Generate Prisma and run a migration:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run db:seed
   ```

4. Start the app and Socket.io sidecar:

   ```bash
   npm run dev
   ```

The web app runs on `http://localhost:3000`, Socket.io on
`http://localhost:3001`.

Seed accounts:

- `admin@example.com` / `password123`
- `agent@example.com` / `password123`

Sign in at `/signin` (you will be redirected there from any protected page).

## BotPress integration

BotPress is the source of channel delivery. Configure Messenger, WhatsApp, and
Webchat **inside BotPress** — do not point Meta or WhatsApp at this app
directly.

1. In BotPress Studio, install the Webhook integration.
2. Set the webhook URL to `https://<your-domain>/api/webhook/botpress`.
3. Add one of these auth methods:
   - shared secret: send `x-botpress-secret: <BOTPRESS_WEBHOOK_SECRET>` (or
     `Authorization: Bearer <secret>`); or
   - HMAC: set `BOTPRESS_SIGNING_SECRET` and send
     `x-botpress-signature: sha256=<hex>` computed over the raw JSON body.
4. Send `userId`, `conversationId`, `event`, `text`, and `channel` on every
   call. Snake_case is also accepted (`user_id`, `conversation_id`,
   `message_id`).
5. Use the BotPress handoff node and POST `event=handoff.requested`.
6. When the conversation ends, POST `event=conversation.closed`.

Supported events:

| Event aliases                                              | Effect                                  |
| ---------------------------------------------------------- | --------------------------------------- |
| `conversation.started`, `conversation.created`             | Create/touch the conversation row.      |
| `message.received`, `message.created`, `incoming.message`  | Store as `CUSTOMER` message.            |
| `message.sent`, `bot.message.sent`, `bot.reply`            | Store as `BOT` message.                 |
| `handoff.requested`, `handoff.request`, `human.requested`  | Flip conversation to `HUMAN`, route.    |
| `conversation.closed`, `conversation.ended`, `session.closed` | Flip conversation to `CLOSED`.       |

Every message stores the raw BotPress payload under `metadata.botpressRaw`
for debugging. Messages are deduplicated by `botpressMessageId`.

## Core endpoints

Public (no session required):

- `POST /api/webhook/botpress` — gated by webhook secret / HMAC.
- `POST /api/auth/[...nextauth]`
- `GET  /api/health`

Authenticated (require a NextAuth session):

- `GET  /api/conversations`
- `GET  /api/conversations/:id/messages`
- `PATCH /api/conversations/:id/takeover`
- `PATCH /api/conversations/:id/resume-bot`
- `PATCH /api/conversations/:id/assign`
- `PATCH /api/conversations/:id/close`
- `POST /api/messages/send`
- `GET/POST/PATCH /api/users`
- `GET/POST/PATCH /api/contacts`
- `POST /api/contacts/import-csv`
- `GET/POST /api/campaigns`, `POST /api/campaigns/:id/send`, `PATCH /api/campaigns/:id/pause`
- `POST /api/actions/{create-lead,assign-agent,update-contact,send-notification,tag-contact,schedule-follow-up}`
- `POST /api/integrations/odoo/{test,push-contact,sync-lead}`
- `GET/POST /api/whatsapp/templates`
- `GET/POST /api/integrations/botpress/test` — config flags + connection probe.

Page routes `/dashboard`, `/inbox`, `/contacts`, `/campaigns`, `/reports`,
`/settings/**` are protected by NextAuth middleware. `/signin` and the webhook
endpoint stay public.

## Inbox

`/inbox` consumes:

- `GET /api/conversations` with filters: `status=BOT|HUMAN|CLOSED`,
  `unassigned=true`, `agentId=<me>`, `q=<search>`, `channel=<...>`, `tag=<...>`.
- `GET /api/conversations/:id/messages?limit=100&before=<iso>` for thread
  history.
- `POST /api/messages/send` to reply through BotPress.
- `PATCH /api/conversations/:id/{takeover,resume-bot,close}` for controls.

Realtime updates arrive over Socket.io rooms `conversation:<id>`. Brand-new
conversations from BotPress emit `conversation.updated` so they pop into the
list without a refresh.

## Realtime flow

```
Customer (Messenger / WhatsApp / Webchat)
   → BotPress
      → POST /api/webhook/botpress
         → upsert Contact + Conversation
         → store Message (CUSTOMER / BOT / SYSTEM)
         → emit "message.created" to conversation:<id>
         → emit "conversation.updated" to all clients
      → Inbox UI live-updates
Agent reply
   → POST /api/messages/send
      → store Message (AGENT)
      → sendBotPressMessage() back to BotPress
      → emit realtime events
   → BotPress relays to the channel
```

## Railway deployment

- One web service for Next.js + Socket.io (Socket.io runs on the same domain
  in prod; clients use `NEXT_PUBLIC_SOCKET_URL` or window.origin).
- Railway PostgreSQL for `DATABASE_URL`.
- Railway Redis for Bull campaign sending if volume grows (optional).
- `railway.json` runs `npx prisma migrate deploy` before each deploy and probes
  `/api/health`.

Required environment:

```bash
DATABASE_URL=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-railway-domain
BOTPRESS_WEBHOOK_SECRET=...
BOTPRESS_SIGNING_SECRET=     # optional, enables HMAC verification
BOTPRESS_OUTGOING_WEBHOOK_URL=
BOTPRESS_API_TOKEN=
BOTPRESS_BOT_ID=
BOTPRESS_WORKSPACE_ID=
SOCKET_PORT=3001
SOCKET_INTERNAL_SECRET=
NEXT_PUBLIC_SOCKET_URL=
REDIS_URL=                   # optional
ODOO_URL=
ODOO_DB=
ODOO_USERNAME=
ODOO_PASSWORD=
ODOO_SYNC_ENABLED=false
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_DEFAULT_LANGUAGE=
```

After the Railway domain is generated, update `NEXTAUTH_URL` and point your
BotPress webhook at `https://<domain>/api/webhook/botpress`.

## Odoo 17 (optional)

The app talks to Odoo 17 over JSON-RPC at `/jsonrpc`.

- `POST /api/integrations/odoo/test` — credentials check.
- `POST /api/integrations/odoo/push-contact` — upsert into `res.partner`.
- `POST /api/integrations/odoo/sync-lead` — create `crm.lead`.

If `ODOO_SYNC_ENABLED=true`, BotPress `create-lead` actions sync leads into
Odoo automatically.

## WhatsApp campaign safety

WhatsApp campaigns are guarded by approved-template gating, `whatsappOptIn`
evidence, `marketingPaused`, per-campaign rate limits, and quiet hours.

1. Sync approved templates via `POST /api/whatsapp/templates`.
2. Import contacts with explicit opt-in evidence.
3. Start with a small warm-up segment.
4. Monitor template quality, read rate, blocks, and opt-outs.

## Multi-tenancy migration plan (not yet applied)

The app is single-tenant today. To turn it into a SaaS that hosts many
businesses on one deployment, apply the following migration **before** taking
on more than one customer:

1. **Add new models** in `prisma/schema.prisma`:

   ```prisma
   model Organization {
     id          String   @id @default(cuid())
     name        String
     slug        String   @unique
     createdAt   DateTime @default(now())
     updatedAt   DateTime @updatedAt
     botpress    BotPressConnection?
     members     OrganizationMember[]
     contacts    Contact[]
     conversations Conversation[]
     campaigns   Campaign[]
   }

   model OrganizationMember {
     id             String   @id @default(cuid())
     organizationId String
     userId         String
     role           UserRole @default(SALES_AGENT)
     organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
     user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
     @@unique([organizationId, userId])
   }

   model BotPressConnection {
     id             String   @id @default(cuid())
     organizationId String   @unique
     webhookSecret  String
     signingSecret  String?
     outgoingUrl    String?
     apiToken       String?
     workspaceId    String?
     botId          String?
     organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
   }
   ```

2. **Add `organizationId` foreign keys** to `Contact`, `Conversation`,
   `Campaign`, `WhatsAppTemplate`, `Notification`, `FollowUpReminder`. Backfill
   each row to a `default-organization` row created in the migration.

3. **Route the BotPress webhook** by org. Two safe options:
   - URL-scoped: `/api/webhook/botpress/[orgSlug]` — the slug picks the
     `BotPressConnection` to verify against and scopes writes.
   - Header-scoped: keep `/api/webhook/botpress` but require an
     `x-org-slug` header.

4. **Scope every query** by the caller's `organizationId`. Update services in
   `src/services/*` to accept and filter by `organizationId`. Update
   middleware to inject `organizationId` into request context (e.g. via a
   header set after session lookup).

5. **Settings UI**: per-org BotPress connection editing, members management,
   billing-ready org metadata (plan, seat count, status).

6. **NextAuth**: keep credentials. Add an `organizationId` claim to the JWT,
   sourced from `OrganizationMember` on sign-in. Add a workspace switcher.

7. **Background jobs**: pass `organizationId` through the Bull queue, the
   campaign worker, and the Odoo sync — every job must run inside one org's
   scope.

Until this migration ships, deploy one app instance per customer
(Railway makes this cheap) and keep `BOTPRESS_WEBHOOK_SECRET` per instance.

## Notes

- Without `REDIS_URL`, campaigns send directly in the API process.
- `BOTPRESS_OUTGOING_WEBHOOK_URL` can point at a custom BotPress webhook; if
  omitted, the BotPress Cloud Messaging API is used with
  `BOTPRESS_API_TOKEN`, `BOTPRESS_WORKSPACE_ID`, and `BOTPRESS_BOT_ID`.
- The app does not connect to Facebook/Meta or WhatsApp Cloud APIs directly.
  Those channels must be configured inside BotPress.
