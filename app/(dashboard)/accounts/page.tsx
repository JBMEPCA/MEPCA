import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountsManager } from "@/components/accounts/accounts-manager";

export const metadata = { title: "Accounts — Cogent Hub" };

// Admin-only: create logins, disable/enable them, reset passwords
export default async function AccountsPage() {
  const admin = await requireAdmin();

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      isAdmin: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create logins for the Hub, and disable them if someone should no longer have access.
      </p>
      <AccountsManager
        users={users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        }))}
        currentUserId={admin.id}
      />
    </div>
  );
}
