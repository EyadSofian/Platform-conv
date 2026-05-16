import { CalendarClock, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function NewCampaignPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Create Campaign</h2>
          <p className="text-sm text-muted-foreground">
            Segment contacts and send through BotPress
          </p>
        </PanelHeader>
        <PanelBody className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Input placeholder="Campaign name" />
            <Select defaultValue="blast">
              <option value="blast">One-time blast</option>
              <option value="drip">Drip sequence</option>
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Approved template name" defaultValue="spring_reactivation_ar" />
              <Select defaultValue="ar_EG">
                <option value="ar_EG">Arabic (Egypt)</option>
                <option value="en_US">English (US)</option>
              </Select>
            </div>
            <Textarea
              className="min-h-44"
              placeholder="Campaign message"
              defaultValue="We have a new WhatsApp automation bundle for growing teams. Want a quick walkthrough?"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="datetime-local" />
              <Select defaultValue="immediate">
                <option value="immediate">Send immediately</option>
                <option value="scheduled">Schedule</option>
              </Select>
            </div>
          </div>
          <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold">Target Rules</p>
              <p className="text-sm text-muted-foreground">
                Combine tags, status, agent, channel, and date range
              </p>
            </div>
            <Input placeholder="Tags: pricing, renewal" />
            <Select defaultValue="active">
              <option value="active">Active contacts</option>
              <option value="pending">Pending contacts</option>
              <option value="closed">Closed contacts</option>
            </Select>
            <Select defaultValue="all">
              <option value="all">All agents</option>
              <option value="agent-1">Omar Sales</option>
              <option value="agent-2">Lina Supervisor</option>
            </Select>
            <Select defaultValue="whatsapp">
              <option value="whatsapp">WhatsApp</option>
              <option value="web">Web chat</option>
              <option value="telegram">Telegram</option>
            </Select>
            <Input type="number" min="1" defaultValue="30" placeholder="Messages per minute" />
            <Select defaultValue="optin">
              <option value="optin">Respect WhatsApp opt-in</option>
              <option value="all">Ignore opt-in for test only</option>
            </Select>
          </div>
        </PanelBody>
      </Panel>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline">
          <Save className="h-4 w-4" />
          Save draft
        </Button>
        <Button variant="outline">
          <CalendarClock className="h-4 w-4" />
          Schedule
        </Button>
        <Button variant="accent">
          <Send className="h-4 w-4" />
          Send now
        </Button>
      </div>
    </div>
  );
}
