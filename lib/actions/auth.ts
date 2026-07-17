"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  createSession,
  deleteSession,
  hashPassword,
  verifyPassword,
  requireAdmin,
} from "@/lib/auth";

export type AuthFormState = { error?: string; success?: string } | undefined;

const MIN_PASSWORD_LENGTH = 8;

function findByUsername(username: string) {
  // Case-insensitive so "jamesb" logs in as "JamesB"
  return db.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
}

// ---------- login / logout ----------

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!username || !password) return { error: "Enter your username and password." };

  const user = await findByUsername(username);
  // Same message for "no such user" and "wrong password" — don't help guessers
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Wrong username or password." };
  }
  if (!user.active) return { error: "This account has been disabled." };

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, remember);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

// ---------- Accounts tab (admin only) ----------

export async function createAccount(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  await requireAdmin();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username) return { error: "Username is required." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (await findByUsername(username)) {
    return { error: `The username "${username}" is already taken.` };
  }

  await db.user.create({ data: { username, passwordHash: hashPassword(password) } });
  revalidatePath("/accounts");
  return { success: `Login created for ${username}.` };
}

export async function setAccountActive(userId: string, active: boolean) {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("You can't disable your own account.");
  await db.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/accounts");
}

export async function resetAccountPassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const user = await db.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(password) },
  });
  revalidatePath("/accounts");
  return { success: `Password updated for ${user.username}.` };
}
