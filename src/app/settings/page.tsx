import Link from "next/link";
import { Bot, PlugZap, Shield, UsersRound } from "lucide-react";
import { Panel, PanelBody } from "@/components/ui/panel";

const settings = [
  {
    href: "/settings/agents",
    title: "Agents",
    body: "Roles, availability, and routing capacity",
    icon: UsersRound,
  },
  {
    href: "/settings/integrations",
    title: "Integrations",
    body: "BotPress webhook URL, token, and workspace IDs",
    icon: PlugZap,
  },
  {
    href: "/settings/ai-actions",
    title: "AI Actions",
    body: "Lead creation, tagging, assignment, and alerts",
    icon: Bot,
  },
  {
    href: "/settings/agents",
    title: "Access Control",
    body: "Admin, supervisor, sales agent, and viewer scopes",
    icon: Shield,
  },
];

export default function SettingsPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {settings.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.title} href={item.href}>
            <Panel className="h-full transition hover:border-teal-300 hover:shadow-soft">
              <PanelBody>
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.body}
                </p>
              </PanelBody>
            </Panel>
          </Link>
        );
      })}
    </div>
  );
}
