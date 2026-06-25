"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: string;
  active: boolean;
};

export function WorkspaceSwitcher() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const activeId = session?.user?.organizationId ?? null;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { data: Workspace[] };
      setWorkspaces(json.data);
    } catch {
      // Non-fatal: switcher simply stays collapsed to the current workspace.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, activeId]);

  const active =
    workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null;

  async function switchTo(id: string) {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await update({ organizationId: id });
      router.refresh();
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  const label = active?.name ?? "Workspace";
  const canSwitch = workspaces.length > 1;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => canSwitch && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white transition",
          canSwitch && "hover:bg-white/10",
        )}
        title={canSwitch ? "Switch workspace" : label}
      >
        <Building2 className="h-4 w-4 shrink-0 text-teal-300" />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        {switching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
        ) : canSwitch ? (
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : null}
      </button>

      {open && canSwitch && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-card text-foreground shadow-lg">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => void switchTo(workspace.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">
                  {workspace.name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {workspace.role.toLowerCase()}
                  </span>
                </span>
                {workspace.id === activeId && (
                  <Check className="h-4 w-4 shrink-0 text-teal-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
