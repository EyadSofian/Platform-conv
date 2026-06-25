"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

type Report = {
  rangeDays: number;
  conversations: {
    open: number;
    closed: number;
    byStatus: { status: string; count: number }[];
    byChannel: { channel: string; count: number }[];
  };
  responseTime: { averageSeconds: number; label: string; sampleSize: number };
  resolutionTime: { averageSeconds: number; label: string; sampleSize: number };
  agents: {
    agent: { id: string; name: string | null; email: string | null };
    messagesSent: number;
    assignedConversations: number;
  }[];
  campaigns: {
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    deliveryRate: number;
    readRate: number;
    replyRate: number;
  };
  templates: {
    template: string | null;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    deliveryRate: number;
    readRate: number;
    replyRate: number;
  }[];
  contacts: {
    total: number;
    newInRange: number;
    growth: { date: string; count: number }[];
  };
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Panel>
      <PanelBody>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </PanelBody>
    </Panel>
  );
}

export function ReportsClient() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/reports?days=${days}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || `Failed (${response.status})`);
        }
        const json = (await response.json()) as { data: Report };
        setReport(json.data);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [days]);

  const totalConversations = useMemo(
    () => (report ? report.conversations.open + report.conversations.closed : 0),
    [report],
  );
  const maxGrowth = useMemo(
    () =>
      report
        ? Math.max(1, ...report.contacts.growth.map((g) => g.count))
        : 1,
    [report],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">
            Conversation, agent, channel, and campaign performance
          </p>
        </div>
        <Select
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-40"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading reports
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {report && !loading && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Total conversations" value={totalConversations} />
            <Stat label="Open" value={report.conversations.open} />
            <Stat label="Avg first response" value={report.responseTime.label} />
            <Stat label="Avg resolution" value={report.resolutionTime.label} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader>
                <h3 className="font-semibold">Conversations by channel</h3>
              </PanelHeader>
              <PanelBody className="space-y-2">
                {report.conversations.byChannel.length === 0 && (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                )}
                {report.conversations.byChannel.map((row) => (
                  <div
                    key={row.channel}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{row.channel}</span>
                    <span className="font-semibold">{row.count}</span>
                  </div>
                ))}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <h3 className="font-semibold">Campaign performance</h3>
              </PanelHeader>
              <PanelBody className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Sent</p>
                  <p className="text-lg font-semibold">{report.campaigns.sent}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Delivered</p>
                  <p className="text-lg font-semibold">
                    {report.campaigns.deliveryRate}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Read</p>
                  <p className="text-lg font-semibold">
                    {report.campaigns.readRate}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Replied</p>
                  <p className="text-lg font-semibold">
                    {report.campaigns.replyRate}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Failed</p>
                  <p className="text-lg font-semibold">{report.campaigns.failed}</p>
                </div>
              </PanelBody>
            </Panel>
          </div>

          <Panel>
            <PanelHeader>
              <h3 className="font-semibold">Agent workload</h3>
            </PanelHeader>
            <PanelBody className="space-y-2">
              {report.agents.length === 0 && (
                <p className="text-sm text-muted-foreground">No agent activity yet.</p>
              )}
              {report.agents.map((row) => (
                <div
                  key={row.agent.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <span className="font-medium">
                    {row.agent.name ?? row.agent.email}
                  </span>
                  <span className="text-muted-foreground">
                    {row.messagesSent} messages · {row.assignedConversations} assigned
                  </span>
                </div>
              ))}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader>
              <h3 className="font-semibold">WhatsApp template performance</h3>
            </PanelHeader>
            <PanelBody className="space-y-2">
              {report.templates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No template campaigns yet.
                </p>
              )}
              {report.templates.map((row) => (
                <div
                  key={row.template ?? "unknown"}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <span className="font-medium">{row.template}</span>
                  <span className="text-muted-foreground">
                    {row.sent} sent · {row.deliveryRate}% delivered · {row.readRate}%
                    read · {row.replyRate}% replied
                  </span>
                </div>
              ))}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader className="flex items-center justify-between">
              <h3 className="font-semibold">Contact growth</h3>
              <span className="text-sm text-muted-foreground">
                {report.contacts.newInRange} new · {report.contacts.total} total
              </span>
            </PanelHeader>
            <PanelBody>
              <div className="flex h-32 items-end gap-0.5">
                {report.contacts.growth.map((point) => (
                  <div
                    key={point.date}
                    title={`${point.date}: ${point.count}`}
                    className="flex-1 rounded-t bg-teal-400/70"
                    style={{
                      height: `${Math.max(2, (point.count / maxGrowth) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            </PanelBody>
          </Panel>
        </>
      )}
    </div>
  );
}
