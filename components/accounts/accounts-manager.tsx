"use client";

import { useRef, useState, useTransition, useActionState } from "react";
import { format } from "date-fns";
import {
  createAccount,
  resetAccountPassword,
  setAccountActive,
  type AuthFormState,
} from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Account = {
  id: string;
  username: string;
  isAdmin: boolean;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export function AccountsManager({
  users,
  currentUserId,
}: {
  users: Account[];
  currentUserId: string;
}) {
  return (
    <div className="mt-6 space-y-8">
      <CreateAccountForm />
      <AccountsTable users={users} currentUserId={currentUserId} />
    </div>
  );
}

function CreateAccountForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (prev: AuthFormState, formData: FormData) => {
      const result = await createAccount(prev, formData);
      if (result?.success) formRef.current?.reset();
      return result;
    },
    undefined
  );

  return (
    <section className="rounded-xl border border-border bg-card/60 p-5">
      <h2 className="text-sm font-semibold">Create a login</h2>
      <form ref={formRef} action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-username">Username</Label>
          <Input id="new-username" name="username" required className="w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Password</Label>
          <Input
            id="new-password"
            name="password"
            type="text"
            autoComplete="off"
            required
            minLength={8}
            className="w-52"
            placeholder="At least 8 characters"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create login"}
        </Button>
      </form>
      {state?.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="mt-2 text-sm text-primary">{state.success}</p>}
    </section>
  );
}

function AccountsTable({
  users,
  currentUserId,
}: {
  users: Account[];
  currentUserId: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">Current accounts</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Username</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Last login</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <AccountRow key={user.id} user={user} isSelf={user.id === currentUserId} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountRow({ user, isSelf }: { user: Account; isSelf: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [showReset, setShowReset] = useState(false);

  return (
    <>
      <tr className="border-b border-border/60 last:border-0">
        <td className="px-4 py-2.5 font-medium">
          {user.username}
          {user.isAdmin && (
            <span className="ml-2 rounded bg-[#29abe2]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#29abe2]">
              Admin
            </span>
          )}
          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">
          {format(new Date(user.createdAt), "d MMM yyyy")}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">
          {user.lastLoginAt ? format(new Date(user.lastLoginAt), "d MMM yyyy, HH:mm") : "Never"}
        </td>
        <td className="px-4 py-2.5">
          {user.active ? (
            <span className="text-emerald-400">Active</span>
          ) : (
            <span className="text-destructive">Disabled</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="xs" onClick={() => setShowReset((s) => !s)}>
              {showReset ? "Cancel" : "Reset password"}
            </Button>
            {!isSelf && (
              <Button
                variant={user.active ? "destructive" : "secondary"}
                size="xs"
                disabled={isPending}
                onClick={() =>
                  startTransition(() => setAccountActive(user.id, !user.active))
                }
              >
                {user.active ? "Disable" : "Enable"}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {showReset && (
        <tr className="border-b border-border/60 bg-card/40 last:border-0">
          <td colSpan={5} className="px-4 py-3">
            <ResetPasswordForm userId={user.id} onDone={() => setShowReset(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

function ResetPasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(resetAccountPassword, undefined);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="userId" value={userId} />
      <Input
        name="password"
        type="text"
        autoComplete="off"
        required
        minLength={8}
        placeholder="New password (min 8 characters)"
        className="w-64"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
      {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
      {state?.success && (
        <span className="text-sm text-primary">
          {state.success}{" "}
          <button type="button" className="underline" onClick={onDone}>
            Close
          </button>
        </span>
      )}
    </form>
  );
}
