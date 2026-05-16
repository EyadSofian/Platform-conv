import Link from "next/link";
import { Download, Filter, Plus, Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { contacts } from "@/lib/demo-data";

export default function ContactsPage() {
  return (
    <div className="space-y-6">
      <Panel>
        <PanelBody className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_160px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search contacts" />
          </div>
          <Select defaultValue="all">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </Select>
          <Select defaultValue="all">
            <option value="all">All agents</option>
            <option value="omar">Omar Sales</option>
            <option value="lina">Lina Supervisor</option>
          </Select>
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
            <Button variant="outline" title="Import CSV">
              <Upload className="h-4 w-4" />
            </Button>
            <Button variant="accent">
              <Plus className="h-4 w-4" />
              Contact
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Contacts</h2>
            <p className="text-sm text-muted-foreground">
              BotPress identity, assignment, status, and tags
            </p>
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Channel</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Agent</th>
                <th className="px-5 py-3 font-medium">Tags</th>
                <th className="px-5 py-3 font-medium">WhatsApp</th>
                <th className="px-5 py-3 font-medium">BotPress</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b last:border-0">
                  <td className="px-5 py-4">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="font-semibold hover:text-teal-700"
                    >
                      {contact.name}
                    </Link>
                    <p className="text-muted-foreground">{contact.email}</p>
                  </td>
                  <td className="px-5 py-4">{contact.channel}</td>
                  <td className="px-5 py-4">
                    <Badge tone={contact.status === "active" ? "teal" : "amber"}>
                      {contact.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">{contact.assignedAgent}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.map((tag) => (
                        <Badge key={tag} tone="slate">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={contact.whatsappOptIn ? "teal" : "red"}>
                      {contact.whatsappOptIn ? "Opted in" : "No opt-in"}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    <p>{contact.botpressUserId}</p>
                    <p>{contact.botpressConvId}</p>
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
