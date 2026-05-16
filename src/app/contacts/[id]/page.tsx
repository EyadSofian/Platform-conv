import { Bot, Mail, Phone, Tag, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { contacts, messages } from "@/lib/demo-data";

export default function ContactProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const contact = contacts.find((item) => item.id === params.id) ?? contacts[0];

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">{contact.name}</h2>
          <p className="text-sm text-muted-foreground">{contact.channel}</p>
        </PanelHeader>
        <PanelBody className="space-y-5">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {contact.phone}
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {contact.email}
            </div>
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              {contact.assignedAgent}
            </div>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              {contact.botpressConvId}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Tags</p>
            <div className="flex flex-wrap gap-2">
              {contact.tags.map((tag) => (
                <Badge key={tag} tone="slate">
                  <Tag className="h-3 w-3" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline">Assign</Button>
            <Button variant="accent">Open chat</Button>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Conversation History</h2>
          <p className="text-sm text-muted-foreground">
            Customer, bot, agent, and internal timeline
          </p>
        </PanelHeader>
        <PanelBody>
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="rounded-lg border bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Badge
                    tone={
                      message.sender === "bot"
                        ? "teal"
                        : message.sender === "note"
                          ? "amber"
                          : "neutral"
                    }
                  >
                    {message.sender}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {message.time}
                  </span>
                </div>
                <p className="text-sm leading-6">{message.body}</p>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
