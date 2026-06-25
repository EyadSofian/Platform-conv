"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import {
  apiFetch,
  rate,
  STATUS_TONE,
  type Campaign,
  type ValidationResult,
} from "../campaign-shared";

type Recipient = {
  id: string;
  status: string;
  skipReason: string | null;
  failedReason: string | null;
  contact: { id: string; name: string | null; phone: string | null };
};

type CampaignDetail = Campaign & { recipients?: Recipient[] };

export default function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaign(await apiFetch<CampaignDetail>(`/api/campaigns/${params.id}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(kind: "send" | "pause" | "resume" | "validate") {
    setBusy(true);
    try {
      if (kind === "validate") {
        const result = await apiFetch<ValidationResult>(
          `/api/campaigns/${params.id}/validate`,
          { method: "POST" },
        );
        setValidation(result);
        toast.success(`${result.eligible} eligible · ${result.skipped} skipped`);
      } else {
        const path =
          kind === "send"
            ? `/api/campaigns/${params.id}/send`
            : `/api/campaigns/${params.id}/${kind}`;
        await apiFetch(path, { method: kind === "send" ? "POST" : "PATCH" });
        toast.success(
          kind === "send" ? "Campaign queued for sending." : `Campaign ${kind}d.`,
        );
        await load();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading campaign…
      </div>
    );
  }
  if (error || !campaign) {
    return <p className="text-sm text-red-600">{error ?? "Not found."}</p>;
  }

  const metrics: [string, number][] = [
    ["Queued", campaign.queuedCount],
    ["Sent", campaign.sentCount],
    ["Delivered", campaign.deliveredCount],
    ["Read", campaign.readCount],
    ["Replied", campaign.repliedCount],
    ["Failed", campaign.failedCount],
    ["Skipped", campaign.skippedCount],
    ["Converted", campaign.convertedCount],
  ];

  return (
    <div className="space-y-6">
      <Panel>
        <PanelBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-xl font-semibold">{campaign.name}</h2>
              <Badge tone={STATUS_TONE[campaign.status]}>
                {campaign.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {campaign.type} · {campaign.channel}
              {campaign.templateName ? ` · ${campaign.templateName}` : ""} ·{" "}
              {campaign.respectOptIn ? "opt-in enforced" : "opt-in ignored"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void runAction("validate")}
            >
              <ShieldCheck className="h-4 w-4" />
              Validate
            </Button>
            {campaign.status === "PAUSED" ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void runAction("resume")}
              >
                <RefreshCw className="h-4 w-4" />
                Resume
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void runAction("pause")}
              >
                <Pause className="h-4 w-4" />
                Pause
              </Button>
            )}
            <Button
              variant="accent"
              disabled={busy || campaign.status === "PAUSED"}
              onClick={() => void runAction("send")}
            >
              <Play className="h-4 w-4" />
              Send
            </Button>
          </div>
        </PanelBody>
      </Panel>

      {validation && (
        <Panel>
          <PanelHeader>
            <h2 className="font-semibold">Recipient validation</h2>
          </PanelHeader>
          <PanelBody className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="inline-flex items-center gap-1 text-teal-700">
                <CheckCircle2 className="h-4 w-4" />
                {validation.eligible} eligible
              </span>
              <span className="text-muted-foreground">
                {validation.skipped} skipped of {validation.total} targeted
              </span>
            </div>
            {Object.keys(validation.skippedByReason).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(validation.skippedByReason).map(
                  ([reason, count]) => (
                    <Badge key={reason} tone="amber">
                      {reason}: {count}
                    </Badge>
                  ),
                )}
              </div>
            )}
          </PanelBody>
        </Panel>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <Panel key={label}>
            <PanelBody>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">
                {value.toLocaleString()}
              </p>
            </PanelBody>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Delivery rates</h2>
        </PanelHeader>
        <PanelBody>
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ["Delivery rate", rate(campaign.deliveredCount, campaign.sentCount)],
              ["Read rate", rate(campaign.readCount, campaign.deliveredCount)],
              ["Reply rate", rate(campaign.repliedCount, campaign.sentCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-3 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>

      {campaign.recipients && campaign.recipients.length > 0 && (
        <Panel>
          <PanelHeader>
            <h2 className="font-semibold">
              Recipients ({campaign.recipients.length})
            </h2>
          </PanelHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {campaign.recipients.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-5 py-3">
                      {r.contact.name ?? "Unknown"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.contact.phone ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        tone={
                          r.status === "sent"
                            ? "teal"
                            : r.status === "failed"
                              ? "red"
                              : "slate"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.skipReason ?? r.failedReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
