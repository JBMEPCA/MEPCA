import Link from "next/link";
import Image from "next/image";
import { ReactNode } from "react";

const nav = [
  { href: "/", label: "Overview" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/content", label: "Upcoming Content" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/sales", label: "Sales" },
  { href: "/analytics", label: "Analytics" },
  { href: "/competitor-intel", label: "Competitor Intel" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-border bg-card/60 p-4 backdrop-blur">
        <div className="mb-8 px-2 pt-2">
          <Image
            src="/mepca-logo-white.png"
            alt="MEPCA"
            width={140}
            height={40}
            priority
            className="h-auto w-32"
          />
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-border pt-4 px-3">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Agents</p>
          <p className="mt-2 text-xs text-muted-foreground">
            🕵️ Agent Intel — <span className="text-primary">on duty</span>
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
