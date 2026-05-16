import {
  Activity,
  Bot,
  Clock3,
  Inbox,
  Megaphone,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { agents, campaigns, contacts, hourlyHeatmap } from "@/lib/demo-data";

const metrics = [
  { label: "Conversations today", value: "184", delta: "+18%", icon: Inbox },
  { label: "Bot handling rate", value: "71%", delta: "+6%", icon: Bot },
  { label: "Avg response time", value: "1m 58s", delta: "-22s", icon: Clock3 },
  { label: "Campaign replies", value: "298", delta: "+31%", icon: Megaphone },
];

export function ConversationCampaignDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Panel key={metric.label}>
              <PanelBody className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                  <Badge tone="teal" className="mt-3">
                    <TrendingUp className="h-3 w-3" />
                    {metric.delta}
                  </Badge>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 text-white">
                  <Icon className="h-5 w-5" />
                </div>
              </PanelBody>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Panel>
          <PanelHeader className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Conversation Flow</h2>
              <p className="text-sm text-muted-foreground">
                Bot, human, and campaign activity by hour
              </p>
            </div>
            <Button variant="outline" size="sm">
              <Activity className="h-4 w-4" />
              Export
            </Button>
          </PanelHeader>
          <PanelBody>
            <div className="grid h-72 grid-cols-12 items-end gap-3">
              {hourlyHeatmap.map((value, index) => (
                <div key={index} className="flex h-full flex-col justify-end gap-2">
                  <div
                    className="rounded-t-md bg-teal-600"
                    style={{ height: `${Math.max(14, value * 4)}px` }}
                  />
                  <span className="text-center text-xs text-muted-foreground">
                    {index + 8}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Bot resolved</p>
                <p className="mt-2 text-xl font-semibold">428</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Human handoffs</p>
                <p className="mt-2 text-xl font-semibold">96</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Closed won</p>
                <p className="mt-2 text-xl font-semibold">37</p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2 className="font-semibold">Agent Status</h2>
            <p className="text-sm text-muted-foreground">
              Availability and routing load
            </p>
          </PanelHeader>
          <PanelBody className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white">
                    <UsersRound className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {agent.conversations} active - {agent.responseTime}
                    </p>
                  </div>
                </div>
                <Badge
                  tone={
                    agent.availability === "Online"
                      ? "teal"
                      : agent.availability === "Busy"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {agent.availability}
                </Badge>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader>
            <h2 className="font-semibold">Recent Conversations</h2>
          </PanelHeader>
          <PanelBody className="space-y-3">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-4 rounded-lg border bg-slate-50 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{contact.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {contact.lastMessage}
                  </p>
                </div>
                <Badge tone={contact.mode === "bot" ? "teal" : "amber"}>
                  {contact.mode === "bot" ? "Bot" : "Human"}
                </Badge>
              </div>
            ))}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2 className="font-semibold">Campaign Pulse</h2>
          </PanelHeader>
          <PanelBody className="space-y-3">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-center justify-between gap-4 rounded-lg border bg-slate-50 p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {campaign.sent} sent - {campaign.replied} replied
                  </p>
                </div>
                <Badge tone={campaign.status === "Running" ? "teal" : "slate"}>
                  {campaign.status}
                </Badge>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
