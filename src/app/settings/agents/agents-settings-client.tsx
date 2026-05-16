"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Shield,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

type Availability = "ONLINE" | "BUSY" | "AWAY" | "OFFLINE";
type UserRole = "ADMIN" | "SUPERVISOR" | "SALES_AGENT" | "VIEWER";

type Agent = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  availability: Availability;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    assignedConversations: number;
    sentMessages: number;
  };
};

type AgentDraft = {
  name: string;
  email: string;
  role: UserRole;
  availability: Availability;
  password: string;
};

const availabilityOptions: Array<{ value: Availability; label: string }> = [
  { value: "ONLINE", label: "Online" },
  { value: "BUSY", label: "Busy" },
  { value: "AWAY", label: "Away" },
  { value: "OFFLINE", label: "Offline" },
];

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "ADMIN", label: "Admin" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "SALES_AGENT", label: "Agent" },
  { value: "VIEWER", label: "Viewer" },
];

const emptyDraft: AgentDraft = {
  name: "",
  email: "",
  role: "SALES_AGENT",
  availability: "ONLINE",
  password: "",
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as { data?: T; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload.data as T;
}

function availabilityTone(availability: Availability) {
  if (availability === "ONLINE") return "teal";
  if (availability === "BUSY") return "amber";
  if (availability === "OFFLINE") return "neutral";
  return "slate";
}

function labelFor<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function draftFromAgent(agent: Agent): AgentDraft {
  return {
    name: agent.name ?? "",
    email: agent.email ?? "",
    role: agent.role,
    availability: agent.availability,
    password: "",
  };
}

export function AgentsSettingsClient() {
  const queryClient = useQueryClient();
  const [createDraft, setCreateDraft] = useState<AgentDraft>(emptyDraft);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editDraft, setEditDraft] = useState<AgentDraft>(emptyDraft);

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiJson<Agent[]>("/api/users"),
  });

  const sortedAgents = useMemo(
    () =>
      [...(agentsQuery.data ?? [])].sort((left, right) =>
        (left.name ?? left.email ?? "").localeCompare(
          right.name ?? right.email ?? "",
        ),
      ),
    [agentsQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: (draft: AgentDraft) =>
      apiJson<Agent>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name.trim(),
          email: draft.email.trim(),
          role: draft.role,
          availability: draft.availability,
          ...(draft.password ? { password: draft.password } : {}),
        }),
      }),
    onSuccess: async () => {
      setCreateDraft(emptyDraft);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent created.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Create failed.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: AgentDraft }) =>
      apiJson<Agent>(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name.trim(),
          email: draft.email.trim(),
          role: draft.role,
          availability: draft.availability,
          ...(draft.password ? { password: draft.password } : {}),
        }),
      }),
    onSuccess: async (updatedAgent) => {
      queryClient.setQueryData<Agent[]>(["agents"], (current) =>
        current?.map((agent) =>
          agent.id === updatedAgent.id ? { ...agent, ...updatedAgent } : agent,
        ),
      );
      setEditingAgent(null);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent updated.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    },
  });

  function openEdit(agent: Agent) {
    setEditingAgent(agent);
    setEditDraft(draftFromAgent(agent));
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate(createDraft);
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAgent) return;
    updateMutation.mutate({ id: editingAgent.id, draft: editDraft });
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader>
          <h2 className="font-semibold">Create Agent</h2>
        </PanelHeader>
        <PanelBody>
          <form
            className="grid gap-3 lg:grid-cols-[1fr_1fr_160px_160px_150px_auto]"
            onSubmit={submitCreate}
          >
            <Input
              placeholder="Name"
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  name: event.target.value,
                }))
              }
              required
            />
            <Input
              placeholder="Email"
              type="email"
              value={createDraft.email}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  email: event.target.value,
                }))
              }
              required
            />
            <Select
              value={createDraft.role}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  role: event.target.value as UserRole,
                }))
              }
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={createDraft.availability}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  availability: event.target.value as Availability,
                }))
              }
            >
              {availabilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Password"
              type="password"
              value={createDraft.password}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  password: event.target.value,
                }))
              }
            />
            <Button
              type="submit"
              variant="accent"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </form>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Team</h2>
            <p className="text-sm text-muted-foreground">
              Round-robin uses available agents and supervisors
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => agentsQuery.refetch()}
            disabled={agentsQuery.isFetching}
            aria-label="Refresh agents"
          >
            <RefreshCw
              className={`h-4 w-4 ${agentsQuery.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </PanelHeader>
        <PanelBody>
          {agentsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading agents
            </div>
          )}

          {agentsQuery.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {agentsQuery.error instanceof Error
                ? agentsQuery.error.message
                : "Unable to load agents."}
            </div>
          )}

          {!agentsQuery.isLoading &&
            !agentsQuery.isError &&
            sortedAgents.length === 0 && (
              <div className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">
                No agents yet.
              </div>
            )}

          <div className="grid gap-3 lg:grid-cols-3">
            {sortedAgents.map((agent) => (
              <div key={agent.id} className="rounded-lg border bg-slate-50 p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {agent.name ?? agent.email ?? "Unnamed agent"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {labelFor(roleOptions, agent.role)}
                    </p>
                  </div>
                  <Badge tone={availabilityTone(agent.availability)}>
                    {labelFor(availabilityOptions, agent.availability)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-white p-3">
                    <RadioTower className="mb-2 h-4 w-4 text-teal-700" />
                    {agent._count?.assignedConversations ?? 0} active
                  </div>
                  <div className="rounded-md bg-white p-3">
                    <Shield className="mb-2 h-4 w-4 text-slate-700" />
                    {agent._count?.sentMessages ?? 0} sent
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  type="button"
                  variant="outline"
                  onClick={() => openEdit(agent)}
                >
                  <Pencil className="h-4 w-4" />
                  Edit Agent
                </Button>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>

      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <form
            className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
            onSubmit={submitEdit}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">
                Edit agent - {editingAgent.name ?? editingAgent.email}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setEditingAgent(null)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Agent Name</span>
                <Input
                  value={editDraft.name}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Email</span>
                <Input
                  type="email"
                  value={editDraft.email}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      email: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Role</span>
                <Select
                  value={editDraft.role}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      role: event.target.value as UserRole,
                    }))
                  }
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Availability</span>
                <Select
                  value={editDraft.availability}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      availability: event.target.value as Availability,
                    }))
                  }
                >
                  {availabilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-w-64 flex-1 items-center gap-2 text-sm text-muted-foreground">
                <LockKeyhole className="h-4 w-4 text-teal-700" />
                <Input
                  className="max-w-xs"
                  placeholder="New password"
                  type="password"
                  value={editDraft.password}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      password: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingAgent(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )}
                  Edit Agent
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
