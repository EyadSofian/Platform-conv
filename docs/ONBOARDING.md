# BotPress Operations Inbox — customer onboarding

This guide is for businesses that already use BotPress and want to add a
human-operations layer: a unified inbox, agent handoff, replies back through
BotPress, and reporting.

## What this tool is

A web app that sits next to BotPress. BotPress keeps owning Facebook
Messenger, WhatsApp, Webchat, Telegram, and anything else you connect to it.
Every conversation BotPress sees is mirrored here in real time, where your
team can watch, take over, reply, and close it. Agent replies flow back
through BotPress to the customer.

## What it is not

- It is not a replacement for BotPress.
- It does not connect to Facebook/Meta or WhatsApp directly.
- It does not run your bot logic. It stores conversations and lets humans
  intervene.

## What you need before starting

- A working BotPress workspace with at least one channel (Messenger, WhatsApp,
  or Webchat) already delivering messages to your bot.
- A PostgreSQL database connection string.
- A domain (or a Railway-style auto domain) you can point BotPress at.
- One admin email + password for your first user.

## Step 1 — Deploy the app

Deploy this app to Railway, Render, Fly, or any Node host that can run a
Next.js app plus the Socket.io sidecar. Required environment variables are in
`.env.example` and the README.

The mandatory ones to start:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (your public domain)
- `BOTPRESS_WEBHOOK_SECRET` (any long random string; you will paste this
  into BotPress)

## Step 2 — Run the database migration and seed

```bash
npm run prisma:migrate
npm run db:seed
```

The seed creates two starter accounts: an admin and an agent. Change their
passwords (or delete them and recreate from /settings/agents) before going
live.

## Step 3 — Sign in and create your team

1. Open `https://<your-domain>/signin`.
2. Sign in as the admin.
3. Go to **Settings → Agents** and add your agents with roles:
   - Admin: full access.
   - Supervisor: routing capacity for handoffs.
   - Sales Agent: standard inbox user.
   - Viewer: read-only.

## Step 4 — Connect BotPress

1. In this app, open **Settings → Integrations**. Copy the **Webhook URL** —
   it will look like `https://<your-domain>/api/webhook/botpress`.
2. In BotPress Studio, add a Webhook integration that POSTs to that URL on
   every relevant event. Required body fields:
   - `userId` or `user_id`
   - `conversationId` or `conversation_id`
   - `event` — one of `conversation.started`, `message.received`,
     `message.sent`, `handoff.requested`, `conversation.closed`
   - `text`
   - `channel` (`whatsapp`, `web`, `messenger`, `telegram`)
3. Pick one auth method:
   - **Shared secret**: send header
     `x-botpress-secret: <BOTPRESS_WEBHOOK_SECRET>` on every call; or
   - **HMAC**: set `BOTPRESS_SIGNING_SECRET` and send
     `x-botpress-signature: sha256=<hex>` over the raw JSON body.
4. Back in the integration page, click **Test BotPress connection**. If
   BotPress is reachable from this app, a small probe event is delivered and
   the panel shows ✓.

## Step 5 — Verify the round trip

Trigger one real conversation on your channel (e.g. send a Messenger message
to your business page). Within a second or two you should see:

- A new row in **Inbox** with a **Bot active** badge.
- The bot's reply appearing in the same thread.
- The customer's next message also appearing without a refresh.

Then click **Take over** — the conversation flips to **Agent handling**, the
bot is paused via BotPress, and your reply box becomes live.

## Step 6 — Configure handoff in BotPress

In your BotPress flow, when you want the bot to escalate to a human:

1. Post `event=handoff.requested` to the webhook with the same `userId` and
   `conversationId`.
2. The app picks an available agent (round-robin by `lastAssignedAt`) and
   marks the conversation `HUMAN`.
3. The assigned agent gets a notification and the conversation appears in
   their **Mine** filter.

When the human is done and wants the bot to take back over, they click
**Resume bot** — the app pings BotPress with a `bot.resume` event so your
flow can continue.

When the conversation is fully done, send `event=conversation.closed` from
BotPress (or click **Close** in the app). Closed conversations stay
searchable and filterable.

## Step 7 — Optional integrations

- **Odoo CRM**: set `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`,
  `ODOO_SYNC_ENABLED=true` to push contacts and create leads.
- **WhatsApp campaigns**: only after you have approved templates and opt-in
  evidence. See the README's "WhatsApp campaign safety" section.

## Daily operations checklist

- Agents log in at `/signin` and live in `/inbox`.
- Supervisors monitor `/reports`.
- Admins manage `/settings/agents` and `/settings/integrations`.
- New channels are added inside BotPress, not here.

## Troubleshooting

- **Webhook returns 401**: your `BOTPRESS_WEBHOOK_SECRET` or
  `BOTPRESS_SIGNING_SECRET` does not match what BotPress is sending. Check
  the header name and value.
- **Webhook returns 422 "requires userId or conversationId"**: BotPress is
  POSTing without identifying the conversation. Add those fields in the
  BotPress action card.
- **Conversation appears but agent reply does not reach the customer**:
  `BOTPRESS_OUTGOING_WEBHOOK_URL` or BotPress Cloud Messaging API credentials
  are missing. Fill them in and click **Test BotPress connection**.
- **No live updates**: confirm the Socket.io sidecar is running and that
  `NEXT_PUBLIC_SOCKET_URL` is reachable from the browser.
