"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Power, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

type Trigger =
  | "NEW_CONVERSATION"
  | "NEW_MESSAGE"
  | "MESSAGE_KEYWORD"
  | "CHANNEL_IS"
  | "TAG_ADDED"
  | "NO_REPLY_AFTER"
  | "OUTSIDE_BUSINESS_HOURS";

type Action =
  | "ADD_TAG"
  | "ASSIGN_AGENT"
  | "NOTIFY"
  | "CLOSE"
  | "SNOOZE"
  | "SEND_WEBHOOK"
  | "SEND_TEMPLATE"
  | "CREATE_LEAD"
  | "HANDOFF_BOTPRESS";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: Trigger;
  triggerConfig: Record<string, unknown> | null;
  action: Action;
  actionConfig: Record<string, unknown> | null;
  runCount: number;
  lastRunAt: string | null;
};

const TRIGGERS: { value: Trigger; label: string }[] = [
  { value: "NEW_CONVERSATION", label: "New conversation" },
  { value: "NEW_MESSAGE", label: "New message" },
  { value: "MESSAGE_KEYWORD", label: "Message contains keyword" },
  { value: "CHANNEL_IS", label: "Channel is…" },
  { value: "TAG_ADDED", label: "Tag added" },
  { value: "NO_REPLY_AFTER", label: "No reply after… (time-based)" },
  { value: "OUTSIDE_BUSINESS_HOURS", label: "Outside business hours (time-based)" },
];

const ACTIONS: { value: Action; label: string }[] = [
  { value: "ADD_TAG", label: "Add tag" },
  { value: "ASSIGN_AGENT", label: "Assign agent" },
  { value: "NOTIFY", label: "Notify agent" },
  { value: "CLOSE", label: "Close conversation" },
  { value: "SNOOZE", label: "Snooze" },
  { value: "SEND_WEBHOOK", label: "Send webhook" },
  { value: "SEND_TEMPLATE", label: "Send WhatsApp template" },
  { value: "CREATE_LEAD", label: "Create lead" },
  { value: "HANDOFF_BOTPRESS", label: "Hand off to human (pause bot)" },
];

/** Triggers evaluated by the scheduler rather than on inbound events. */
const TIME_BASED_TRIGGERS: Trigger[] = [
  "NO_REPLY_AFTER",
  "OUTSIDE_BUSINESS_HOURS",
];

function triggerHint(trigger: Trigger): string {
  if (trigger === "MESSAGE_KEYWORD") return "Keywords (comma separated)";
  if (trigger === "CHANNEL_IS") return "Channel (e.g. WHATSAPP)";
  if (trigger === "TAG_ADDED") return "Tag (optional)";
  if (trigger === "NO_REPLY_AFTER") return "Minutes with no reply (e.g. 60)";
  if (trigger === "OUTSIDE_BUSINESS_HOURS")
    return "Business hours as start-end (e.g. 09:00-17:00)";
  return "No configuration needed";
}

function actionHint(action: Action): string {
  if (action === "ADD_TAG") return "Tag to add";
  if (action === "ASSIGN_AGENT") return "Agent ID";
  if (action === "NOTIFY") return "Message to show";
  if (action === "SNOOZE") return "Minutes";
  if (action === "SEND_WEBHOOK") return "Webhook URL";
  if (action === "SEND_TEMPLATE") return "Approved template name";
  if (action === "CREATE_LEAD") return "Lead tag (optional, default: lead)";
  if (action === "HANDOFF_BOTPRESS") return "Handoff note (optional)";
  return "No configuration needed";
}

function buildTriggerConfig(trigger: Trigger, value: string): Record<string, unknown> {
  if (trigger === "MESSAGE_KEYWORD") {
    return { keywords: value.split(",").map((s) => s.trim()).filter(Boolean) };
  }
  if (trigger === "CHANNEL_IS") return { channel: value.trim().toUpperCase() };
  if (trigger === "TAG_ADDED") return value.trim() ? { tag: value.trim() } : {};
  if (trigger === "NO_REPLY_AFTER") return { minutes: Number(value) || 60 };
  if (trigger === "OUTSIDE_BUSINESS_HOURS") {
    const [start, end] = value.split("-").map((s) => s.trim());
    return {
      start: start || "09:00",
      end: end || "17:00",
      timezone: "Africa/Cairo",
    };
  }
  return {};
}

function buildActionConfig(action: Action, value: string): Record<string, unknown> {
  if (action === "ADD_TAG") return { tag: value.trim() };
  if (action === "ASSIGN_AGENT") return { agentId: value.trim() };
  if (action === "NOTIFY") return { body: value.trim() };
  if (action === "SNOOZE") return { minutes: Number(value) || 60 };
  if (action === "SEND_WEBHOOK") return { url: value.trim() };
  if (action === "SEND_TEMPLATE") return { templateName: value.trim() };
  if (action === "CREATE_LEAD")
    return value.trim() ? { tag: value.trim() } : {};
  if (action === "HANDOFF_BOTPRESS")
    return value.trim() ? { message: value.trim() } : {};
  return {};
}

export function AutomationSettingsClient() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<Trigger>("MESSAGE_KEYWORD");
  const [triggerValue, setTriggerValue] = useState("");
  const [action, setAction] = useState<Action>("ADD_TAG");
  const [actionValue, setActionValue] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/automation-rules", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${response.status})`);
      }
      const json = (await response.json()) as { data: Rule[] };
      setRules(json.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/automation-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trigger,
          triggerConfig: buildTriggerConfig(trigger, triggerValue),
          action,
          actionConfig: buildActionConfig(action, actionValue),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${response.status})`);
      }
      const json = (await response.json()) as { data: Rule };
      setRules((current) => [...current, json.data]);
      setName("");
      setTriggerValue("");
      setActionValue("");
      toast.success("Automation rule created");
    } catch (err) {
      toast.error((err as Error).message || "Failed to create rule");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: Rule) {
    try {
      const response = await fetch(`/api/automation-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!response.ok) throw new Error(`Failed (${response.status})`);
      const json = (await response.json()) as { data: Rule };
      setRules((current) =>
        current.map((r) => (r.id === rule.id ? { ...r, enabled: json.data.enabled } : r)),
      );
    } catch (err) {
      toast.error((err as Error).message || "Failed to update rule");
    }
  }

  async function deleteRule(rule: Rule) {
    try {
      const response = await fetch(`/api/automation-rules/${rule.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed (${response.status})`);
      }
      setRules((current) => current.filter((r) => r.id !== rule.id));
      toast.success("Rule deleted");
    } catch (err) {
      toast.error((err as Error).message || "Failed to delete rule");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Panel>
        <PanelHeader className="flex items-center gap-2">
          <Workflow className="h-5 w-5" />
          <div>
            <h2 className="font-semibold">Automation rules</h2>
            <p className="text-sm text-muted-foreground">
              Run an action automatically when a trigger fires on inbound activity.
            </p>
          </div>
        </PanelHeader>
        <PanelBody className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Rule name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div />
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">When</label>
            <Select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as Trigger)}
            >
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Input
              placeholder={triggerHint(trigger)}
              value={triggerValue}
              onChange={(e) => setTriggerValue(e.target.value)}
            />
            {TIME_BASED_TRIGGERS.includes(trigger) && (
              <p className="text-xs text-muted-foreground">
                Evaluated by the scheduler (worker:scheduler or the cron route),
                not on inbound messages.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Then</label>
            <Select
              value={action}
              onChange={(e) => setAction(e.target.value as Action)}
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
            <Input
              placeholder={actionHint(action)}
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              variant="accent"
              onClick={() => void handleCreate()}
              disabled={saving || !name.trim()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add rule
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <h3 className="font-semibold">Active rules</h3>
        </PanelHeader>
        <PanelBody className="space-y-2">
          {loading && (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading rules
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {!loading && !error && rules.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No automation rules yet. Create your first rule above.
            </div>
          )}
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{rule.name}</p>
                  <Badge tone={rule.enabled ? "teal" : "slate"}>
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  When <span className="font-medium">{rule.trigger}</span> → then{" "}
                  <span className="font-medium">{rule.action}</span> · ran{" "}
                  {rule.runCount}×
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  title={rule.enabled ? "Disable" : "Enable"}
                  onClick={() => void toggleRule(rule)}
                >
                  <Power className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Delete"
                  onClick={() => void deleteRule(rule)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
