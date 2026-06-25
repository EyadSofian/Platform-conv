"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  CirclePause,
  Inbox,
  Loader2,
  MessageCircle,
  PlugZap,
  Plus,
  RefreshCw,
  Settings2,
  Signal,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChannelType =
  | "WHATSAPP_CLOUD"
  | "FACEBOOK_MESSENGER"
  | "INSTAGRAM"
  | "WEBCHAT"
  | "TELEGRAM"
  | "BOTPRESS";

type InboxStatus = "ACTIVE" | "PAUSED" | "DISCONNECTED";

type ChannelHealthStatus =
  | "CONNECTED"
  | "TOKEN_INVALID"
  | "WEBHOOK_FAILING"
  | "MISSING_CONFIG"
  | "DISCONNECTED";

type InboxRecord = {
  id: string;
  name: string;
  description: string | null;
  channelType: ChannelType;
  status: InboxStatus;
  botEnabled: boolean;
  aiEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  defaultAssignee?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  channelConnection?: {
    id: string;
    status: ChannelHealthStatus;
    externalId: string | null;
    phoneNumberId: string | null;
    businessAccountId: string | null;
    webhookVerifyToken: string | null;
    lastWebhookAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
  } | null;
  _count?: { conversations: number };
};

type CreateForm = {
  name: string;
  description: string;
  channelType: ChannelType;
  phoneNumberId: string;
  businessAccountId: string;
  externalId: string;
  webhookVerifyToken: string;
  accessToken: string;
  botEnabled: boolean;
  aiEnabled: boolean;
};

const CHANNEL_OPTIONS: { value: ChannelType; label: string; help: string }[] = [
  {
    value: "WHATSAPP_CLOUD",
    label: "WhatsApp Cloud",
    help: "Direct Meta WhatsApp API inbox",
  },
  {
    value: "FACEBOOK_MESSENGER",
    label: "Facebook Messenger",
    help: "Page inbox for Messenger conversations",
  },
  {
    value: "INSTAGRAM",
    label: "Instagram",
    help: "DM inbox for professional accounts",
  },
  { value: "WEBCHAT", label: "Webchat", help: "Website widget inbox" },
  { value: "TELEGRAM", label: "Telegram", help: "Telegram bot inbox" },
  {
    value: "BOTPRESS",
    label: "BotPress",
    help: "Optional bot provider inbox",
  },
];

const emptyForm: CreateForm = {
  name: "",
  description: "",
  channelType: "WHATSAPP_CLOUD",
  phoneNumberId: "",
  businessAccountId: "",
  externalId: "",
  webhookVerifyToken: "",
  accessToken: "",
  botEnabled: true,
  aiEnabled: true,
};

const CHANNEL_TONE: Record<ChannelType, "teal" | "blue" | "amber" | "slate"> = {
  WHATSAPP_CLOUD: "teal",
  FACEBOOK_MESSENGER: "blue",
  INSTAGRAM: "amber",
  WEBCHAT: "slate",
  TELEGRAM: "blue",
  BOTPRESS: "slate",
};

const STATUS_TONE: Record<InboxStatus, "teal" | "amber" | "slate"> = {
  ACTIVE: "teal",
  PAUSED: "amber",
  DISCONNECTED: "slate",
};

const HEALTH_TONE: Record<
  ChannelHealthStatus,
  "teal" | "amber" | "red" | "slate"
> = {
  CONNECTED: "teal",
  TOKEN_INVALID: "red",
  WEBHOOK_FAILING: "red",
  MISSING_CONFIG: "amber",
  DISCONNECTED: "slate",
};

function channelLabel(value: ChannelType) {
  return CHANNEL_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function formatDate(iso?: string | null) {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusIcon(status: InboxStatus) {
  if (status === "ACTIVE") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "PAUSED") return <CirclePause className="h-3 w-3" />;
  return <TriangleAlert className="h-3 w-3" />;
}

function healthLabel(status?: ChannelHealthStatus) {
  if (!status) return "No connection";
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function InboxesClient() {
  const [inboxes, setInboxes] = useState<InboxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>(emptyForm);

  async function loadInboxes() {
    setLoading(true);
    try {
      const response = await fetch("/api/inboxes", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${response.status})`);
      }
      const json = (await response.json()) as { data: InboxRecord[] };
      setInboxes(json.data);
    } catch (error) {
      toast.error((error as Error).message || "Failed to load inboxes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInboxes();
  }, []);

  const summary = useMemo(
    () => ({
      active: inboxes.filter((inbox) => inbox.status === "ACTIVE").length,
      bot: inboxes.filter((inbox) => inbox.botEnabled).length,
      ai: inboxes.filter((inbox) => inbox.aiEnabled).length,
      conversations: inboxes.reduce(
        (total, inbox) => total + (inbox._count?.conversations ?? 0),
        0,
      ),
    }),
    [inboxes],
  );

  function updateForm<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || saving) return;

    setSaving(true);
    try {
      const response = await fetch("/api/inboxes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          channelType: form.channelType,
          status: "DISCONNECTED",
          botEnabled: form.botEnabled,
          aiEnabled: form.aiEnabled,
          connection: {
            phoneNumberId: form.phoneNumberId || null,
            businessAccountId: form.businessAccountId || null,
            externalId: form.externalId || null,
            webhookVerifyToken: form.webhookVerifyToken || null,
            accessToken: form.accessToken || null,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${response.status})`);
      }

      const json = (await response.json()) as { data: InboxRecord };
      setInboxes((current) => [json.data, ...current]);
      setForm(emptyForm);
      toast.success("Inbox created");
    } catch (error) {
      toast.error((error as Error).message || "Failed to create inbox");
    } finally {
      setSaving(false);
    }
  }

  async function patchInbox(id: string, body: Partial<InboxRecord>) {
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/inboxes/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed (${response.status})`);
      }
      const json = (await response.json()) as { data: InboxRecord };
      setInboxes((current) =>
        current.map((inbox) => (inbox.id === id ? json.data : inbox)),
      );
    } catch (error) {
      toast.error((error as Error).message || "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Omnichannel routing
          </p>
          <h2 className="text-2xl font-semibold tracking-normal">Inboxes</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Create owned inboxes for WhatsApp, Facebook, Instagram, webchat,
            and bot providers. Bot and AI controls live here before messages
            reach agents.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadInboxes()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: "Active inboxes", value: summary.active, icon: Inbox },
          { label: "Bot enabled", value: summary.bot, icon: Bot },
          { label: "AI enabled", value: summary.ai, icon: BrainCircuit },
          {
            label: "Routed conversations",
            value: summary.conversations,
            icon: MessageCircle,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Panel key={item.label}>
              <PanelBody className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-2xl font-semibold">{item.value}</p>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                </div>
              </PanelBody>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel>
          <PanelHeader className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Connected inboxes</h3>
              <p className="text-sm text-muted-foreground">
                Operational inboxes owned by this platform, not by BotPress.
              </p>
            </div>
            <Badge tone={loading ? "amber" : "teal"}>
              <Signal className="h-3 w-3" />
              {loading ? "Syncing" : "Ready"}
            </Badge>
          </PanelHeader>
          <PanelBody className="space-y-3">
            {loading && inboxes.length === 0 && (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading inboxes
              </div>
            )}
            {!loading && inboxes.length === 0 && (
              <div className="rounded-md border border-dashed p-8 text-center">
                <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
                <h3 className="mt-3 font-semibold">No inboxes yet</h3>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                  Create a WhatsApp Cloud inbox first, then add Facebook,
                  Instagram, and webchat as separate routed inboxes.
                </p>
              </div>
            )}
            {inboxes.map((inbox) => {
              const health = inbox.channelConnection?.status ?? "DISCONNECTED";
              const busy = updatingId === inbox.id;
              return (
                <div
                  key={inbox.id}
                  className="rounded-md border bg-card p-4 transition hover:border-slate-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold">{inbox.name}</h4>
                        <Badge tone={CHANNEL_TONE[inbox.channelType]}>
                          {channelLabel(inbox.channelType)}
                        </Badge>
                        <Badge tone={STATUS_TONE[inbox.status]}>
                          {statusIcon(inbox.status)}
                          {inbox.status.toLowerCase()}
                        </Badge>
                      </div>
                      {inbox.description && (
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                          {inbox.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={inbox.botEnabled ? "default" : "outline"}
                        disabled={busy}
                        onClick={() =>
                          void patchInbox(inbox.id, {
                            botEnabled: !inbox.botEnabled,
                          })
                        }
                        title={
                          inbox.botEnabled
                            ? "Pause bot for this inbox"
                            : "Enable bot for this inbox"
                        }
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                        Bot {inbox.botEnabled ? "on" : "off"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={inbox.aiEnabled ? "accent" : "outline"}
                        disabled={busy}
                        onClick={() =>
                          void patchInbox(inbox.id, {
                            aiEnabled: !inbox.aiEnabled,
                          })
                        }
                        title={
                          inbox.aiEnabled
                            ? "Disable AI assistant for this inbox"
                            : "Enable AI assistant for this inbox"
                        }
                      >
                        <BrainCircuit className="h-4 w-4" />
                        AI {inbox.aiEnabled ? "on" : "off"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Health
                      </p>
                      <Badge tone={HEALTH_TONE[health]}>
                        <PlugZap className="h-3 w-3" />
                        {healthLabel(health)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Conversations
                      </p>
                      <p className="font-semibold">
                        {inbox._count?.conversations ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Channel ID
                      </p>
                      <p className="truncate text-muted-foreground">
                        {inbox.channelConnection?.phoneNumberId ??
                          inbox.channelConnection?.externalId ??
                          "Not configured"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Last webhook
                      </p>
                      <p className="text-muted-foreground">
                        {formatDate(inbox.channelConnection?.lastWebhookAt)}
                      </p>
                    </div>
                  </div>

                  {inbox.channelConnection?.lastError && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {inbox.channelConnection.lastError}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                    <Button
                      type="button"
                      size="sm"
                      variant={inbox.status === "ACTIVE" ? "outline" : "accent"}
                      disabled={busy}
                      onClick={() =>
                        void patchInbox(inbox.id, {
                          status:
                            inbox.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                        })
                      }
                    >
                      {inbox.status === "ACTIVE" ? (
                        <CirclePause className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {inbox.status === "ACTIVE" ? "Pause inbox" : "Activate"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled>
                      <Settings2 className="h-4 w-4" />
                      Connection settings
                    </Button>
                  </div>
                </div>
              );
            })}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <h3 className="font-semibold">Create inbox</h3>
            <p className="text-sm text-muted-foreground">
              Start with WhatsApp Cloud, then add more channel providers.
            </p>
          </PanelHeader>
          <PanelBody>
            <form className="space-y-4" onSubmit={(event) => void handleCreate(event)}>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Inbox name</span>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Sales WhatsApp"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Channel</span>
                <Select
                  value={form.channelType}
                  onChange={(event) =>
                    updateForm("channelType", event.target.value as ChannelType)
                  }
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  {
                    CHANNEL_OPTIONS.find(
                      (option) => option.value === form.channelType,
                    )?.help
                  }
                </p>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Description</span>
                <Textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  placeholder="Handles sales leads and human takeover"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Phone number ID</span>
                  <Input
                    value={form.phoneNumberId}
                    onChange={(event) =>
                      updateForm("phoneNumberId", event.target.value)
                    }
                    placeholder="WhatsApp phone_number_id"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Business account ID</span>
                  <Input
                    value={form.businessAccountId}
                    onChange={(event) =>
                      updateForm("businessAccountId", event.target.value)
                    }
                    placeholder="WABA / page ID"
                  />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium">External account ID</span>
                <Input
                  value={form.externalId}
                  onChange={(event) =>
                    updateForm("externalId", event.target.value)
                  }
                  placeholder="Page, IG, or provider account id"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Webhook verify token</span>
                <Input
                  value={form.webhookVerifyToken}
                  onChange={(event) =>
                    updateForm("webhookVerifyToken", event.target.value)
                  }
                  placeholder="Token used by the provider webhook"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Access token</span>
                <Input
                  type="password"
                  value={form.accessToken}
                  onChange={(event) =>
                    updateForm("accessToken", event.target.value)
                  }
                  placeholder="Stored server-side only"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => updateForm("botEnabled", !form.botEnabled)}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-md border p-3 text-left transition",
                    form.botEnabled
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "bg-card hover:bg-muted",
                  )}
                >
                  <Bot className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">
                      Bot {form.botEnabled ? "enabled" : "paused"}
                    </span>
                    <span className="block text-xs opacity-75">
                      Default automation state
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => updateForm("aiEnabled", !form.aiEnabled)}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-md border p-3 text-left transition",
                    form.aiEnabled
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "bg-card hover:bg-muted",
                  )}
                >
                  <BrainCircuit className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">
                      AI {form.aiEnabled ? "enabled" : "off"}
                    </span>
                    <span className="block text-xs opacity-75">
                      Suggestions and summaries
                    </span>
                  </span>
                </button>
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full"
                disabled={!form.name.trim() || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create inbox
              </Button>
            </form>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
