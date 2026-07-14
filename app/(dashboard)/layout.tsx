import Link from "next/link";
import { ReactNode } from "react";

const nav = [
  { href: "/", label: "Overview" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/competitor-intel", label: "Competitor Intel" },
  { href: "/sources", label: "Agent HQ" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-neutral-50 p-4">
        <div className="mb-6">
          <span className="text-lg font-bold tracking-tight">MEPCA Hub</span>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
