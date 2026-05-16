"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Bot,
  ContactRound,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname?.startsWith("/signin")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r bg-slate-950 text-white lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-500 text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">SalesOps Console</p>
            <p className="text-xs text-slate-400">BotPress handoff hub</p>
          </div>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white",
                  active && "bg-white text-slate-950 hover:bg-white hover:text-slate-950",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-4 left-3 right-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-teal-300" />
            Human handoff ready
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Webhook, actions, campaigns, and live updates are wired.
          </p>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur lg:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">
              AI-assisted sales workspace
            </p>
            <h1 className="truncate text-lg font-semibold">
              {navItems.find((item) => pathname.startsWith(item.href))?.label ??
                "Dashboard"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/agents"
              className="hidden h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium sm:flex"
            >
              <UsersRound className="h-4 w-4" />
              Team
            </Link>
            {session?.user && (
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm sm:flex">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {initials(session.user.name ?? session.user.email ?? "?")}
                  </span>
                  <span className="max-w-[160px] truncate">
                    {session.user.name ?? session.user.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/signin" })}
                  className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b bg-card px-4 py-2 lg:hidden">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm",
                  active && "border-slate-900 bg-slate-900 text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
