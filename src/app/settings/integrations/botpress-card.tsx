"use client";

import { useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, PlugZap, ShieldCheck, Webhook, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

type ConfigFlags = {
  hasWebhookSecret: boolean;
  hasSigningSecret: boolean;
  hasOutgoingWebhook: boolean;
  hasApiToken: boolean;
  hasWorkspaceId: boolean;
  hasBotId: boolean;
};

export function BotPressIntegrationCard({
  webhookUrl,
  flags,
}: {
  webhookUrl: string;
  flags: ConfigFlags;
}) {
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  function copy(value: string, label: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  async function runTest() {
    setTesting(true);
    setLastResult(null);
    try {
      const response = await fetch("/api/integrations/botpress/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || `Failed (${response.status})`);
      }
      const delivered = !!json?.data?.delivered;
      const skipped = json?.data?.result?.skipped;
      setLastResult({
        ok: delivered,
        message: delivered
          ? "BotPress accepted the connection probe."
          : skipped
            ? json.data.result.reason
            : "BotPress responded but did not confirm delivery.",
      });
      if (delivered) toast.success("BotPress connection ok");
    } catch (error) {
      setLastResult({ ok: false, message: (error as Error).message });
      toast.error((error as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Panel className="xl:col-span-2">
      <PanelHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">BotPress</h2>
            <p className="text-sm text-muted-foreground">
              BotPress is your channel gateway. Connect Facebook Messenger,
              WhatsApp, and Webchat <strong>inside BotPress</strong> — this app
              receives those conversations from BotPress and lets your team
              reply.
            </p>
          </div>
          <Badge tone={flags.hasWebhookSecret ? "teal" : "amber"}>
            {flags.hasWebhookSecret ? "Webhook secret set" : "Webhook secret missing"}
          </Badge>
        </div>
      </PanelHeader>
      <PanelBody className="space-y-5">
        <label className="block space-y-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Webhook className="h-4 w-4" />
            Webhook URL — paste into BotPress
          </span>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} />
            <Button
              variant="outline"
              size="icon"
              title="Copy webhook URL"
              onClick={() => copy(webhookUrl, "Webhook URL")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            POST events here from BotPress. Required body fields:{" "}
            <code className="rounded bg-slate-100 px-1">userId</code>,{" "}
            <code className="rounded bg-slate-100 px-1">conversationId</code>,{" "}
            <code className="rounded bg-slate-100 px-1">event</code>.
          </p>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4" />
              Shared secret header
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Set <code>BOTPRESS_WEBHOOK_SECRET</code> on the server. Send it
              from BotPress as <code>x-botpress-secret</code> header or as{" "}
              <code>Authorization: Bearer …</code>.
            </p>
            <Badge tone={flags.hasWebhookSecret ? "teal" : "amber"} className="mt-3">
              {flags.hasWebhookSecret ? "Configured" : "Not configured"}
            </Badge>
          </div>
          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" />
              HMAC signature (optional)
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Set <code>BOTPRESS_SIGNING_SECRET</code> for stronger
              verification. BotPress must send{" "}
              <code>x-botpress-signature: sha256=…</code>.
            </p>
            <Badge tone={flags.hasSigningSecret ? "teal" : "slate"} className="mt-3">
              {flags.hasSigningSecret ? "Configured" : "Off"}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border bg-slate-50 p-4">
          <p className="text-sm font-medium">Outbound delivery</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Agent replies from this app are pushed back to BotPress. Configure
            either an outgoing webhook on BotPress, or the BotPress Cloud
            Messaging API.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={flags.hasOutgoingWebhook ? "teal" : "slate"}>
              BOTPRESS_OUTGOING_WEBHOOK_URL{" "}
              {flags.hasOutgoingWebhook ? "✓" : "—"}
            </Badge>
            <Badge tone={flags.hasApiToken ? "teal" : "slate"}>
              BOTPRESS_API_TOKEN {flags.hasApiToken ? "✓" : "—"}
            </Badge>
            <Badge tone={flags.hasWorkspaceId ? "teal" : "slate"}>
              BOTPRESS_WORKSPACE_ID {flags.hasWorkspaceId ? "✓" : "—"}
            </Badge>
            <Badge tone={flags.hasBotId ? "teal" : "slate"}>
              BOTPRESS_BOT_ID {flags.hasBotId ? "✓" : "—"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="accent" onClick={runTest} disabled={testing}>
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlugZap className="h-4 w-4" />
            )}
            Test BotPress connection
          </Button>
          {lastResult && (
            <div
              className={
                lastResult.ok
                  ? "flex items-center gap-2 text-sm text-teal-700"
                  : "flex items-center gap-2 text-sm text-red-700"
              }
            >
              {lastResult.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {lastResult.message}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Channel ownership</p>
          <p className="mt-1 text-xs leading-5">
            Facebook Messenger, WhatsApp, Webchat, and Telegram are configured
            inside BotPress, not here. This app stores the conversations and
            lets your team take over from the bot — but BotPress remains the
            delivery layer to the customer.
          </p>
        </div>
      </PanelBody>
    </Panel>
  );
}
