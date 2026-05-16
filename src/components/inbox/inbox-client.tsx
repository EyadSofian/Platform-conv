"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  CirclePause,
  FilePlus2,
  ImageIcon,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  RefreshCw,
  Send,
  Tag,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, initials } from "@/lib/utils";
import { useSocket } from "@/hooks/use-socket";

type FilterKey = "all" | "bot" | "human" | "closed" | "unassigned" | "mine";

type ConversationStatus = "BOT" | "HUMAN" | "CLOSED";

type Channel = "WHATSAPP" | "WEB" | "TELEGRAM" | "MESSENGER";

type MessageSender = "BOT" | "AGENT" | "CUSTOMER" | "SYSTEM";

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  channel: Channel;
  tags: string[];
  botpressUserId: string | null;
  botpressConvId: string | null;
};

type Conversation = {
  id: string;
  contactId: string;
  status: ConversationStatus;
  assignedAgentId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  closedAt: string | null;
  contact: Contact;
  assignedAgent: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type Message = {
  id: string;
  contactId: string;
  content: string;
  type: string;
  sender: MessageSender;
  senderId: string | null;
  isNote: boolean;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type SessionResponse = {
  user?: { id?: string; name?: string | null; email?: string | null };
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bot", label: "Bot active" },
  { key: "human", label: "Human" },
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "Mine" },
  { key: "closed", label: "Closed" },
];

const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  WEB: "Webchat",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
};

function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function senderLabel(sender: MessageSender) {
  switch (sender) {
    case "AGENT":
      return "Agent";
    case "BOT":
      return "Bot";
    case "CUSTOMER":
      return "Customer";
    case "SYSTEM":
      return "System";
  }
}

function buildConversationsQuery(filter: FilterKey, agentId?: string, q?: string) {
  const params = new URLSearchParams();
  if (filter === "bot") params.set("status", "BOT");
  if (filter === "human") params.set("status", "HUMAN");
  if (filter === "closed") params.set("status", "CLOSED");
  if (filter === "unassigned") params.set("unassigned", "true");
  if (filter === "mine" && agentId) params.set("agentId", agentId);
  if (q) params.set("q", q);
  const qs = params.toString();
  return `/api/conversations${qs ? `?${qs}` : ""}`;
}

export function InboxClient() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [actionPending, setActionPending] = useState<
    "takeover" | "resume" | "close" | null
  >(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const { socket, connected } = useSocket();
  const activeIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((session: SessionResponse | null) => {
        if (session?.user?.id) setCurrentUserId(session.user.id);
      })
      .catch(() => null);
  }, []);

  const refreshConversations = useCallback(
    async (signal?: AbortSignal) => {
      setListLoading(true);
      setListError(null);
      try {
        const url = buildConversationsQuery(
          filter,
          currentUserId ?? undefined,
          debouncedSearch || undefined,
        );
        const response = await fetch(url, { cache: "no-store", signal });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || `Failed (${response.status})`);
        }
        const json = (await response.json()) as { data: Conversation[] };
        setConversations(json.data);
        if (!activeIdRef.current && json.data.length > 0) {
          setActiveId(json.data[0].id);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setListError((error as Error).message);
      } finally {
        setListLoading(false);
      }
    },
    [filter, currentUserId, debouncedSearch],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshConversations(controller.signal);
    return () => controller.abort();
  }, [refreshConversations]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    const controller = new AbortController();
    setMessagesLoading(true);
    setMessagesError(null);
    fetch(`/api/conversations/${activeId}/messages?limit=100`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || `Failed (${response.status})`);
        }
        const json = (await response.json()) as {
          data: { messages: Message[] };
        };
        setMessages(json.data.messages);
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setMessagesError((error as Error).message);
      })
      .finally(() => setMessagesLoading(false));
    return () => controller.abort();
  }, [activeId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!socket || !activeId) return;
    socket.emit("conversation:join", activeId);
    return () => {
      socket.emit("conversation:leave", activeId);
    };
  }, [socket, activeId]);

  useEffect(() => {
    if (!socket) return;
    const handleMessage = (payload: Message & { contactId?: string }) => {
      if (!payload?.id) return;
      const active = activeIdRef.current;
      const matchActive =
        !!active &&
        conversations.find((c) => c.id === active)?.contactId === payload.contactId;
      if (matchActive) {
        setMessages((current) =>
          current.some((m) => m.id === payload.id) ? current : [...current, payload],
        );
      }
    };
    const handleConversationUpdated = (payload: Conversation) => {
      if (!payload?.id) return;
      setConversations((current) => {
        const idx = current.findIndex((c) => c.id === payload.id);
        if (idx === -1) {
          return [payload, ...current];
        }
        const next = [...current];
        next[idx] = { ...next[idx], ...payload };
        next.sort((a, b) => {
          const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return tb - ta;
        });
        return next;
      });
    };
    socket.on("message.created", handleMessage);
    socket.on("conversation.updated", handleConversationUpdated);
    return () => {
      socket.off("message.created", handleMessage);
      socket.off("conversation.updated", handleConversationUpdated);
    };
  }, [socket, conversations]);

  async function handleSend() {
    if (!activeConversation || !draft.trim() || sending) return;
    setSending(true);
    const content = draft.trim();
    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: activeConversation.contactId,
          content,
          senderId: currentUserId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${response.status})`);
      }
      const json = (await response.json()) as {
        data: { message: Message };
      };
      setMessages((current) =>
        current.some((m) => m.id === json.data.message.id)
          ? current
          : [...current, json.data.message],
      );
      setDraft("");
    } catch (error) {
      toast.error((error as Error).message || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function runControl(action: "takeover" | "resume" | "close") {
    if (!activeConversation || actionPending) return;
    setActionPending(action);
    const path =
      action === "takeover"
        ? `takeover`
        : action === "resume"
          ? `resume-bot`
          : `close`;
    try {
      const response = await fetch(
        `/api/conversations/${activeConversation.id}/${path}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body:
            action === "takeover" && currentUserId
              ? JSON.stringify({ agentId: currentUserId })
              : undefined,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${response.status})`);
      }
      const json = (await response.json()) as { data: Conversation };
      setConversations((current) => {
        const idx = current.findIndex((c) => c.id === json.data.id);
        if (idx === -1) return current;
        const next = [...current];
        next[idx] = { ...next[idx], ...json.data };
        return next;
      });
      toast.success(
        action === "takeover"
          ? "You are handling this conversation"
          : action === "resume"
            ? "Bot resumed"
            : "Conversation closed",
      );
    } catch (error) {
      toast.error((error as Error).message || "Action failed");
    } finally {
      setActionPending(null);
    }
  }

  const status = activeConversation?.status ?? "BOT";

  return (
    <div className="grid h-[calc(100vh-7.5rem)] min-h-[680px] overflow-hidden rounded-lg border bg-card lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
        <div className="border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Live Inbox</h2>
              <p className="text-sm text-muted-foreground">
                {connected ? "Receiving live updates" : "Socket reconnecting"}
              </p>
            </div>
            <Badge tone={connected ? "teal" : "amber"}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {connected ? "Live" : "Idle"}
            </Badge>
          </div>
          <Input
            className="mt-4"
            placeholder="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                onClick={() => setFilter(option.key)}
                className={cn(
                  "h-7 rounded-full border px-3 text-xs font-medium transition",
                  filter === option.key
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2 scrollbar-thin">
          {listLoading && conversations.length === 0 && (
            <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading conversations
            </div>
          )}
          {listError && (
            <div className="m-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {listError}
              <Button
                size="sm"
                variant="outline"
                className="ml-3"
                onClick={() => void refreshConversations()}
              >
                Retry
              </Button>
            </div>
          )}
          {!listLoading && !listError && conversations.length === 0 && (
            <div className="m-4 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No conversations match this filter yet. BotPress conversations
              will appear here as soon as they start.
            </div>
          )}
          {conversations.map((conversation) => {
            const contact = conversation.contact;
            const isActive = conversation.id === activeId;
            const isClosed = conversation.status === "CLOSED";
            const isHuman = conversation.status === "HUMAN";
            return (
              <button
                key={conversation.id}
                onClick={() => setActiveId(conversation.id)}
                className={cn(
                  "mb-2 w-full rounded-lg border p-3 text-left transition hover:bg-muted",
                  isActive && "border-teal-300 bg-teal-50",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white">
                    {initials(contact.name ?? contact.phone ?? "?")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {contact.name ??
                          contact.phone ??
                          contact.email ??
                          "Unknown contact"}
                      </p>
                      {conversation.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {conversation.lastMessageAt
                        ? new Date(conversation.lastMessageAt).toLocaleString()
                        : "No messages yet"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          isClosed ? "slate" : isHuman ? "amber" : "teal"
                        }
                      >
                        {isClosed ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : isHuman ? (
                          <UserRound className="h-3 w-3" />
                        ) : (
                          <Bot className="h-3 w-3" />
                        )}
                        {isClosed
                          ? "Closed"
                          : isHuman
                            ? "Agent handling"
                            : "Bot active"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {CHANNEL_LABEL[contact.channel] ?? contact.channel}
                      </span>
                      {conversation.assignedAgent?.name && (
                        <span className="text-xs text-muted-foreground">
                          · {conversation.assignedAgent.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="grid min-h-0 grid-rows-[auto_1fr_auto]">
        {activeConversation ? (
          <>
            <header className="border-b p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 font-semibold text-white">
                    {initials(activeConversation.contact.name ?? "?")}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">
                      {activeConversation.contact.name ??
                        activeConversation.contact.phone ??
                        "Unknown contact"}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {activeConversation.contact.phone ?? "—"} ·{" "}
                      {activeConversation.contact.email ?? "—"} ·{" "}
                      {CHANNEL_LABEL[activeConversation.contact.channel] ??
                        activeConversation.contact.channel}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      status === "CLOSED"
                        ? "slate"
                        : status === "HUMAN"
                          ? "amber"
                          : "teal"
                    }
                  >
                    {status === "CLOSED" ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : status === "HUMAN" ? (
                      <UserRound className="h-3 w-3" />
                    ) : (
                      <Bot className="h-3 w-3" />
                    )}
                    {status === "CLOSED"
                      ? "Closed"
                      : status === "HUMAN"
                        ? "Agent Handling"
                        : "Bot Active"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      status !== "BOT" || actionPending !== null
                    }
                    onClick={() => void runControl("takeover")}
                    title="Take over conversation"
                  >
                    {actionPending === "takeover" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CirclePause className="h-4 w-4" />
                    )}
                    Take over
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      status !== "HUMAN" || actionPending !== null
                    }
                    onClick={() => void runControl("resume")}
                    title="Resume BotPress bot"
                  >
                    {actionPending === "resume" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Resume bot
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      status === "CLOSED" || actionPending !== null
                    }
                    onClick={() => void runControl("close")}
                    title="Close conversation"
                  >
                    {actionPending === "close" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Close
                  </Button>
                </div>
              </div>
              {activeConversation.contact.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeConversation.contact.tags.map((tag) => (
                    <Badge key={tag} tone="slate">
                      <Tag className="h-3 w-3" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </header>

            <div
              ref={scrollRef}
              className="min-h-0 overflow-auto bg-slate-50 p-5 scrollbar-thin"
            >
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                {messagesLoading && (
                  <div className="flex items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading messages
                  </div>
                )}
                {messagesError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {messagesError}
                  </div>
                )}
                {!messagesLoading && !messagesError && messages.length === 0 && (
                  <div className="rounded-md border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                    No messages yet. Bot or agent replies will appear here.
                  </div>
                )}
                {messages.map((message) => {
                  const isAgent = message.sender === "AGENT";
                  const isBot = message.sender === "BOT";
                  const isSystem = message.sender === "SYSTEM" || message.isNote;
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        isAgent && "justify-end",
                        isSystem && "justify-center",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[78%] rounded-lg border bg-white px-4 py-3 shadow-sm",
                          isAgent &&
                            "border-slate-800 bg-slate-900 text-white",
                          isBot && "border-teal-200 bg-teal-50",
                          isSystem &&
                            "max-w-full border-amber-200 bg-amber-50 text-amber-800",
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium opacity-80">
                          {isBot && <Bot className="h-3 w-3" />}
                          {isAgent && <UserRound className="h-3 w-3" />}
                          <span>{senderLabel(message.sender)}</span>
                          <span>{formatTime(message.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="border-t bg-card p-4">
              <div className="mx-auto max-w-4xl">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={
                    status === "CLOSED"
                      ? "This conversation is closed. Reopen to reply."
                      : "Write a reply (Ctrl+Enter to send)"
                  }
                  disabled={status === "CLOSED" || sending}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey)
                    ) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" title="Attach file" disabled>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Attach image" disabled>
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Add internal note" disabled>
                      <FilePlus2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Quick reply" disabled>
                      <MessageSquarePlus className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    onClick={() => void handleSend()}
                    variant="accent"
                    disabled={
                      status === "CLOSED" || sending || draft.trim().length === 0
                    }
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            {listLoading
              ? "Loading inbox…"
              : "Select a conversation to start replying."}
          </div>
        )}
      </section>
    </div>
  );
}
