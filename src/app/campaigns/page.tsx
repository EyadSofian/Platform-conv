import Link from "next/link";
import { CalendarClock, Pause, Play, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { campaigns } from "@/lib/demo-data";

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Campaign Manager</h2>
          <p className="text-sm text-muted-foreground">
            Broadcasts, drip sequences, scheduling, and BotPress sends
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          New campaign
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Sent", "1,620"],
          ["Delivered", "1,533"],
          ["Replied", "298"],
          ["Converted", "87"],
        ].map(([label, value]) => (
          <Panel key={label}>
            <PanelBody>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </PanelBody>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Campaigns</h2>
        </PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Target</th>
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
                  </td>
                  <td className="px-5 py-4">{campaign.type}</td>
                  <td className="px-5 py-4">{campaign.target}</td>
                  <td className="px-5 py-4">
                    <Badge
                      tone={
                        campaign.status === "Running"
                          ? "teal"
                          : campaign.status === "Draft"
                            ? "slate"
                            : "neutral"
                      }
                    >
                      {campaign.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    {campaign.sent} sent · {campaign.replied} replies ·{" "}
                    {campaign.converted} won
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <Button size="icon" variant="outline" title="Send">
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" title="Pause">
                        <Pause className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" title="Schedule">
                        <CalendarClock className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
