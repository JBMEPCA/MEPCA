import { ReactNode } from "react";
import { Sidebar } from "@/components/nav/sidebar";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ username: user.username, isAdmin: user.isAdmin }} />
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
