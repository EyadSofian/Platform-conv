"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, type Campaign, type Template } from "../campaign-shared";

type Agent = { id: string; name: string | null; email: string };

export default function NewCampaignPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [type, setType] = useState("BLAST");
  const [channel, setChannel] = useState("WHATSAPP");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en_US");
  const [message, setMessage] = useState("");
  const [tags, setTags] = useState("");
  const [contactStatus, setContactStatus] = useState("ACTIVE");
  const [agentId, setAgentId] = useState("");
  const [respectOptIn, setRespectOptIn] = useState("true");
  const [rateLimit, setRateLimit] = useState("30");
  const [scheduleMode, setScheduleMode] = useState("immediate");
  const [scheduledAt, setScheduledAt] = useState("");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Template[]>("/api/whatsapp/templates")
      .then((list) =>
        setTemplates(list.filter((t) => t.status === "APPROVED")),
      )
      .catch(() => setTemplates([]));
    apiFetch<Agent[]>("/api/users")
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  const isWhatsApp = channel === "WHATSAPP";

  function buildPayload(status: "DRAFT" | "SCHEDULED") {
    const scheduled =
      scheduleMode === "scheduled" && scheduledAt
        ? new Date(scheduledAt).toISOString()
        : null;
    return {
      name: name.trim(),
      message: message.trim(),
      type,
      status: scheduled ? "SCHEDULED" : status,
      channel,
      templateName: isWhatsApp && templateName ? templateName : null,
      templateLanguage,
      respectOptIn: respectOptIn === "true",
      rateLimitPerMinute: Number(rateLimit) || 30,
      scheduledAt: scheduled,
      targetRules: {
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        status: [contactStatus],
        agentId: agentId || null,
        channel: [channel],
      },
    };
  }

  async function submit(status: "DRAFT" | "SCHEDULED") {
    if (!name.trim()) return toast.error("Campaign name is required.");
    if (!message.trim()) return toast.error("Campaign message is required.");
    if (isWhatsApp && !templateName) {
      return toast.error("Select an approved WhatsApp template.");
    }
    setSaving(true);
    try {
      const campaign = await apiFetch<Campaign>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(buildPayload(status)),
      });
      toast.success("Campaign created.");
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Create Campaign</h2>
          <p className="text-sm text-muted-foreground">
            Target opted-in contacts and send through an approved channel
          </p>
        </PanelHeader>
        <PanelBody className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Input
              placeholder="Campaign name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="BLAST">One-time blast</option>
                <option value="DRIP">Drip sequence</option>
              </Select>
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="WEB">Web chat</option>
                <option value="TELEGRAM">Telegram</option>
                <option value="MESSENGER">Messenger</option>
                <option value="INSTAGRAM">Instagram</option>
              </Select>
            </div>
            {isWhatsApp && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  value={templateName}
                  onChange={(e) => {
                    setTemplateName(e.target.value);
                    const tpl = templates.find(
                      (t) => t.name === e.target.value,
                    );
                    if (tpl) setTemplateLanguage(tpl.language);
                  }}
                >
                  <option value="">Select approved template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="Template language"
                  value={templateLanguage}
                  onChange={(e) => setTemplateLanguage(e.target.value)}
                />
              </div>
            )}
            {isWhatsApp && templates.length === 0 && (
              <p className="text-xs text-amber-600">
                No approved WhatsApp templates found. Add one under WhatsApp
                templates first.
              </p>
            )}
            <Textarea
              className="min-h-44"
              placeholder="Campaign message (used as the conversation record / fallback body)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={scheduleMode}
                onChange={(e) => setScheduleMode(e.target.value)}
              >
                <option value="immediate">Send immediately</option>
                <option value="scheduled">Schedule</option>
              </Select>
              <Input
                type="datetime-local"
                value={scheduledAt}
                disabled={scheduleMode !== "scheduled"}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold">Targeting</p>
              <p className="text-sm text-muted-foreground">
                Combine tags, status, and assigned agent
              </p>
            </div>
            <Input
              placeholder="Tags (comma separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <Select
              value={contactStatus}
              onChange={(e) => setContactStatus(e.target.value)}
            >
              <option value="ACTIVE">Active contacts</option>
              <option value="PENDING">Pending contacts</option>
              <option value="CLOSED">Closed contacts</option>
            </Select>
            <Select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.email}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min="1"
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              placeholder="Messages per minute"
            />
            <Select
              value={respectOptIn}
              onChange={(e) => setRespectOptIn(e.target.value)}
            >
              <option value="true">Respect WhatsApp opt-in</option>
              <option value="false">Ignore opt-in (test only)</option>
            </Select>
          </div>
        </PanelBody>
      </Panel>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => void submit("DRAFT")}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save draft
        </Button>
        <Button
          variant="accent"
          disabled={saving}
          onClick={() => void submit("SCHEDULED")}
        >
          {scheduleMode === "scheduled" ? (
            <CalendarClock className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {scheduleMode === "scheduled" ? "Schedule" : "Create & review"}
        </Button>
      </div>
    </div>
  );
}
