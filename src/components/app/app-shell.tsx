"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  ContactRound,
  GitBranch,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquareText,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Conversations", icon: MessageSquareText },
  { href: "/inboxes", label: "Inboxes", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/settings/automation", label: "Automations", icon: GitBranch },
  { href: "/settings/ai-actions", label: "AI Settings", icon: BrainCircuit },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isNavActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/settings") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname?.startsWith("/signin")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background"></div>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl text-slate-200 lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-purple-600 text-white shadow-glow">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold text-gradient">ConvDesk</p>
            <p className="text-xs text-slate-400 font-medium">AI omnichannel inbox</p>
          </div>
        </div>
        <div className="px-3 pt-4">
          <WorkspaceSwitcher />
        </div>
        <nav className="space-y-1.5 px-3 py-6">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-400 transition-all duration-200 hover:bg-white/10 hover:text-white",
                  active && "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary shadow-sm",
                )}
              >
                <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-4 left-3 right-3 rounded-xl border border-white/10 bg-white/5 p-4 shadow-soft backdrop-blur-md transition-transform hover:-translate-y-1 duration-300">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Platform-owned routing
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Inboxes, AI assistance, bot controls, campaigns, and live updates.
          </p>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/5 bg-background/60 px-4 backdrop-blur-xl lg:px-8">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-primary">
              AI-native conversation operations
            </p>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-100">
              {navItems.find((item) => isNavActive(pathname, item.href))
                ?.label ?? "Dashboard"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/agents"
              className="hidden h-9 items-center gap-2 rounded-lg border border-white/10 bg-card/50 px-4 text-sm font-medium transition hover:bg-white/10 sm:flex"
            >
              <UsersRound className="h-4 w-4" />
              Team
            </Link>
            {session?.user && (
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-card/50 px-3 py-1.5 text-sm sm:flex">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary ring-1 ring-primary/50">
                    {initials(session.user.name ?? session.user.email ?? "?")}
                  </span>
                  <span className="max-w-[160px] truncate font-medium text-slate-200">
                    {session.user.name ?? session.user.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/signin" })}
                  className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-card/50 px-3 text-sm font-medium transition hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-white/5 bg-background/60 backdrop-blur-xl px-4 py-3 lg:hidden scrollbar-thin">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-medium transition-colors",
                  active ? "border-primary bg-primary/10 text-primary" : "bg-card/50 text-slate-300 hover:bg-white/10",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="px-4 py-8 lg:px-8 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
