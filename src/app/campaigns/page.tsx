"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Pause, Play, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import {
  apiFetch,
  STATUS_TONE,
  type Campaign,
} from "./campaign-shared";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await apiFetch<Campaign[]>("/api/campaigns"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    id: string,
    kind: "send" | "pause" | "resume",
  ) {
    setBusyId(id);
    try {
      const path =
        kind === "send"
          ? `/api/campaigns/${id}/send`
          : `/api/campaigns/${id}/${kind}`;
      await apiFetch(path, { method: kind === "send" ? "POST" : "PATCH" });
      toast.success(
        kind === "send"
          ? "Campaign queued for sending."
          : `Campaign ${kind}d.`,
      );
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const totals = campaigns.reduce(
    (acc, c) => ({
      sent: acc.sent + c.sentCount,
      delivered: acc.delivered + c.deliveredCount,
      replied: acc.replied + c.repliedCount,
      converted: acc.converted + c.convertedCount,
    }),
    { sent: 0, delivered: 0, replied: 0, converted: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Campaign Manager</h2>
          <p className="text-sm text-muted-foreground">
            WhatsApp broadcasts, scheduling, opt-in enforcement, and delivery
            tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Link
            href="/campaigns/new"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Sent", totals.sent],
          ["Delivered", totals.delivered],
          ["Replied", totals.replied],
          ["Converted", totals.converted],
        ].map(([label, value]) => (
          <Panel key={label as string}>
            <PanelBody>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">
                {(value as number).toLocaleString()}
              </p>
            </PanelBody>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Campaigns</h2>
        </PanelHeader>
        {loading ? (
          <PanelBody className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campaigns…
          </PanelBody>
        ) : error ? (
          <PanelBody className="text-sm text-red-600">{error}</PanelBody>
        ) : campaigns.length === 0 ? (
          <PanelBody className="space-y-3 py-10 text-center">
            <p className="text-sm font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first WhatsApp campaign to reach opted-in contacts.
            </p>
            <Link
              href="/campaigns/new"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
            >
              <Plus className="h-4 w-4" />
              New campaign
            </Link>
          </PanelBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Channel</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Performance</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b last:border-0">
                    <td className="px-5 py-4">
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-semibold hover:text-teal-700"
                      >
                        {campaign.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {campaign.type}
                        {campaign.templateName
                          ? ` · ${campaign.templateName}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-5 py-4">{campaign.channel}</td>
                    <td className="px-5 py-4">
                      <Badge tone={STATUS_TONE[campaign.status]}>
                        {campaign.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {campaign.sentCount} sent · {campaign.deliveredCount}{" "}
                      delivered · {campaign.repliedCount} replies
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          title="Send"
                          disabled={
                            busyId === campaign.id ||
                            campaign.status === "PAUSED"
                          }
                          onClick={() => void act(campaign.id, "send")}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        {campaign.status === "PAUSED" ? (
                          <Button
                            size="icon"
                            variant="outline"
                            title="Resume"
                            disabled={busyId === campaign.id}
                            onClick={() => void act(campaign.id, "resume")}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="outline"
                            title="Pause"
                            disabled={busyId === campaign.id}
                            onClick={() => void act(campaign.id, "pause")}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
