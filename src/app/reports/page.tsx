import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { agents, hourlyHeatmap } from "@/lib/demo-data";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">
            Conversation, agent, channel, and campaign performance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline">
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total conversations", "4,812"],
          ["Bot handling", "71%"],
          ["Human handling", "29%"],
          ["Resolution rate", "83%"],
        ].map(([label, value]) => (
          <Panel key={label}>
            <PanelBody>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </PanelBody>
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader>
            <h2 className="font-semibold">Peak Hours</h2>
          </PanelHeader>
          <PanelBody>
            <div className="grid grid-cols-6 gap-3 md:grid-cols-12">
              {hourlyHeatmap.map((value, index) => (
                <div key={index} className="space-y-2">
                  <div
                    className="h-16 rounded-md border"
                    style={{
                      backgroundColor: `rgba(13, 148, 136, ${Math.min(
                        0.9,
                        0.15 + value / 70,
                      )})`,
                    }}
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    {index + 8}:00
                  </p>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2 className="font-semibold">Channels</h2>
          </PanelHeader>
          <PanelBody className="space-y-4">
            {[
              ["WhatsApp", 58],
              ["Web", 27],
              ["Telegram", 11],
              ["Messenger", 4],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="font-medium">{value}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-teal-600"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Agent Performance</h2>
        </PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Agent</th>
                <th className="px-5 py-3 font-medium">Handled</th>
                <th className="px-5 py-3 font-medium">Response Time</th>
                <th className="px-5 py-3 font-medium">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, index) => (
                <tr key={agent.id} className="border-b last:border-0">
                  <td className="px-5 py-4 font-semibold">{agent.name}</td>
                  <td className="px-5 py-4">{agent.conversations}</td>
                  <td className="px-5 py-4">{agent.responseTime}</td>
                  <td className="px-5 py-4">{86 - index * 7}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
