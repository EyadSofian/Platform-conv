import { headers } from "next/headers";
import { DatabaseZap, Link2, MessageCircle, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { BotPressIntegrationCard } from "./botpress-card";

const actionEndpoints = [
  "POST /api/actions/create-lead",
  "POST /api/actions/assign-agent",
  "POST /api/actions/update-contact",
  "POST /api/actions/send-notification",
  "POST /api/actions/tag-contact",
  "POST /api/actions/schedule-follow-up",
];

function getBaseUrl() {
  const env = process.env.NEXTAUTH_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

export const dynamic = "force-dynamic";

export default function IntegrationsSettingsPage() {
  const baseUrl = getBaseUrl();
  const webhookUrl = `${baseUrl}/api/webhook/botpress`;
  const flags = {
    hasWebhookSecret: Boolean(process.env.BOTPRESS_WEBHOOK_SECRET),
    hasSigningSecret: Boolean(process.env.BOTPRESS_SIGNING_SECRET),
    hasOutgoingWebhook: Boolean(process.env.BOTPRESS_OUTGOING_WEBHOOK_URL),
    hasApiToken: Boolean(process.env.BOTPRESS_API_TOKEN),
    hasWorkspaceId: Boolean(process.env.BOTPRESS_WORKSPACE_ID),
    hasBotId: Boolean(process.env.BOTPRESS_BOT_ID),
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <BotPressIntegrationCard webhookUrl={webhookUrl} flags={flags} />

      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">BotPress Studio checklist</h2>
        </PanelHeader>
        <PanelBody className="space-y-3 text-sm">
          {[
            "Connect Facebook Messenger / WhatsApp / Webchat inside BotPress.",
            "Add a Webhook integration that POSTs to /api/webhook/botpress.",
            "Send userId, conversationId, event, text, and channel in every payload.",
            "Use the BotPress handoff node and send event=handoff.requested.",
            "When the conversation ends, send event=conversation.closed.",
            "Call AI Action endpoints from Execute Code cards.",
          ].map((item, index) => (
            <div
              key={item}
              className="flex gap-3 rounded-lg border bg-slate-50 p-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
                {index + 1}
              </span>
              <span>{item}</span>
            </div>
          ))}
        </PanelBody>
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelHeader>
          <h2 className="font-semibold">Action endpoints</h2>
          <p className="text-sm text-muted-foreground">
            Call these from BotPress Execute Code cards to drive CRM and
            automation work inside this app.
          </p>
        </PanelHeader>
        <PanelBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actionEndpoints.map((endpoint) => (
            <div
              key={endpoint}
              className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3 font-mono text-sm"
            >
              <Link2 className="h-4 w-4 text-teal-700" />
              {endpoint}
            </div>
          ))}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Odoo 17 CRM</h2>
          <p className="text-sm text-muted-foreground">
            Push contacts into res.partner and crm.lead
          </p>
        </PanelHeader>
        <PanelBody className="space-y-4">
          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <DatabaseZap className="h-4 w-4" />
              Odoo URL
            </span>
            <Input placeholder="https://yourcompany.odoo.com" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="ODOO_DB" />
            <Input placeholder="ODOO_USERNAME" />
          </div>
          <Input placeholder="ODOO_PASSWORD or API key" />
          <Button variant="outline">
            <PlugZap className="h-4 w-4" />
            Test Odoo
          </Button>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">WhatsApp campaign safety</h2>
          <p className="text-sm text-muted-foreground">
            Template sync, opt-in, and send pacing
          </p>
        </PanelHeader>
        <PanelBody className="space-y-4">
          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="h-4 w-4" />
              WABA ID
            </span>
            <Input placeholder="WHATSAPP_BUSINESS_ACCOUNT_ID" />
          </label>
          <Input placeholder="WHATSAPP_PHONE_NUMBER_ID" />
          <Input placeholder="WHATSAPP_ACCESS_TOKEN" />
          <Button variant="accent">
            <MessageCircle className="h-4 w-4" />
            Sync templates
          </Button>
        </PanelBody>
      </Panel>
    </div>
  );
}
