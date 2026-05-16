import { Pause, Play, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { campaigns } from "@/lib/demo-data";

export default function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const campaign =
    campaigns.find((item) => item.id === params.id) ?? campaigns[0];

  return (
    <div className="space-y-6">
      <Panel>
        <PanelBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-xl font-semibold">{campaign.name}</h2>
              <Badge tone={campaign.status === "Running" ? "teal" : "slate"}>
                {campaign.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {campaign.type} · target {campaign.target}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Pause className="h-4 w-4" />
              Pause
            </Button>
            <Button variant="accent">
              <Play className="h-4 w-4" />
              Send
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Sent", campaign.sent],
          ["Delivered", campaign.delivered],
          ["Replied", campaign.replied],
          ["Converted", campaign.converted],
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
          <h2 className="font-semibold">Analytics</h2>
        </PanelHeader>
        <PanelBody>
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ["Delivery rate", campaign.sent ? "94%" : "0%"],
              ["Reply rate", campaign.sent ? "18%" : "0%"],
              ["Conversion rate", campaign.sent ? "5%" : "0%"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <TrendingUp className="h-4 w-4 text-teal-700" />
                </div>
                <p className="mt-3 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
