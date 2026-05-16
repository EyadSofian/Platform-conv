import { Bell, CalendarClock, ContactRound, Route, Save, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

const actions = [
  {
    name: "Create or update lead",
    endpoint: "/api/actions/create-lead",
    icon: ContactRound,
    status: "Enabled",
  },
  {
    name: "Assign conversation",
    endpoint: "/api/actions/assign-agent",
    icon: Route,
    status: "Enabled",
  },
  {
    name: "Tag contact",
    endpoint: "/api/actions/tag-contact",
    icon: Tag,
    status: "Enabled",
  },
  {
    name: "Notify agent",
    endpoint: "/api/actions/send-notification",
    icon: Bell,
    status: "Enabled",
  },
  {
    name: "Schedule follow-up",
    endpoint: "/api/actions/schedule-follow-up",
    icon: CalendarClock,
    status: "Enabled",
  },
];

export default function AIActionsSettingsPage() {
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Intent Routing</h2>
          <p className="text-sm text-muted-foreground">
            Map BotPress intents to platform actions
          </p>
        </PanelHeader>
        <PanelBody className="grid gap-3 lg:grid-cols-[220px_1fr_220px_auto]">
          <Select defaultValue="pricing_intent">
            <option value="pricing_intent">pricing_intent</option>
            <option value="handoff_requested">handoff_requested</option>
            <option value="lead_qualified">lead_qualified</option>
          </Select>
          <Input placeholder="Condition: payload.score > 70" />
          <Select defaultValue="assign">
            <option value="assign">Assign conversation</option>
            <option value="tag">Tag contact</option>
            <option value="notify">Notify agent</option>
          </Select>
          <Button variant="accent">
            <Save className="h-4 w-4" />
            Save
          </Button>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Panel key={action.endpoint}>
              <PanelBody>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge tone="teal">{action.status}</Badge>
                </div>
                <h2 className="font-semibold">{action.name}</h2>
                <p className="mt-2 font-mono text-sm text-muted-foreground">
                  {action.endpoint}
                </p>
              </PanelBody>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
