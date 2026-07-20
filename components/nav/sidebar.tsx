"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MAGAZINES, MAGAZINE_TABS } from "@/lib/magazines";
import { logout } from "@/lib/actions/auth";

// Cogent Hub sidebar: company-level links on top, then a collapsible section
// per magazine. The section for the magazine you're currently in opens
// automatically; the rest stay tucked away.

export function Sidebar({
  user,
}: {
  user: { username: string; isAdmin: boolean };
}) {
  const pathname = usePathname();
  const currentSlug = MAGAZINES.find(
    (m) => pathname === `/${m.slug}` || pathname.startsWith(`/${m.slug}/`)
  )?.slug;

  // Manual open/close choices layered over the "auto-open current" default
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (slug: string) => toggled[slug] ?? slug === currentSlug;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur">
      <div className="px-5 pt-5 pb-4">
        <Link href="/" className="block">
          <span className="text-lg font-bold tracking-tight text-[#29abe2]">
            COGENT
          </span>
          <span className="ml-1.5 text-lg font-light tracking-tight text-foreground">
            MULTIMEDIA
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <Link
          href="/"
          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground ${
            pathname === "/" ? "bg-accent text-foreground" : "text-muted-foreground"
          }`}
        >
          Cogent Overview
        </Link>
        <Link
          href="/cogent-sales"
          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground ${
            pathname === "/cogent-sales" ? "bg-accent text-foreground" : "text-muted-foreground"
          }`}
        >
          Cogent Sales
        </Link>
        <Link
          href="/eshot"
          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground ${
            pathname === "/eshot" ? "bg-accent text-foreground" : "text-muted-foreground"
          }`}
        >
          E-shot Builder
        </Link>
        {user.isAdmin && (
          <Link
            href="/accounts"
            className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground ${
              pathname === "/accounts" ? "bg-accent text-foreground" : "text-muted-foreground"
            }`}
          >
            Accounts
          </Link>
        )}

        <div className="mt-4 space-y-1">
          {MAGAZINES.map((mag) => {
            const open = isOpen(mag.slug);
            return (
              <div key={mag.slug}>
                <button
                  type="button"
                  onClick={() => setToggled((t) => ({ ...t, [mag.slug]: !open }))}
                  className="flex h-12 w-full items-center justify-between rounded-md px-3 text-sm font-semibold transition-colors hover:bg-accent"
                  style={{ color: mag.brandColor }}
                >
                  {/* Fixed-size box + object-contain = every logo renders the same
                      height; brightness-0 invert = every logo renders white. */}
                  <span className="relative block h-7 w-28">
                    {mag.logo ? (
                      <Image
                        src={mag.logo}
                        alt={mag.name}
                        fill
                        sizes="112px"
                        className="object-contain object-left brightness-0 invert"
                      />
                    ) : (
                      mag.name
                    )}
                  </span>
                  <span
                    className={`text-xs text-muted-foreground transition-transform ${
                      open ? "rotate-90" : ""
                    }`}
                  >
                    ▸
                  </span>
                </button>
                {open && (
                  <div className="mb-2 ml-2 border-l border-border pl-2">
                    {MAGAZINE_TABS.map((tab) => {
                      const href = `/${mag.slug}${tab.path}`;
                      const active = pathname === href;
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={`block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground ${
                            active ? "bg-accent font-medium text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {tab.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-border px-6 py-4">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Agents</p>
        <p className="mt-2 text-xs text-muted-foreground">
          🕵️ Agent Intel — <span className="text-primary">on duty</span>
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-3">
        <p className="truncate text-xs text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.username}</span>
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
