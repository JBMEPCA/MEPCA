// Creates (or repairs) the first admin login. Safe to re-run: if the username
// already exists it just makes sure the account is an active admin.
// Usage: node scripts/seed-admin.mjs <username> <password>
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage: node scripts/seed-admin.mjs <username> <password>");
  process.exit(1);
}

// Same salt:hash hex format as lib/auth.ts hashPassword()
const salt = randomBytes(16);
const passwordHash = `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;

const db = new PrismaClient();
const user = await db.user.upsert({
  where: { username },
  create: { username, passwordHash, isAdmin: true },
  update: { passwordHash, isAdmin: true, active: true },
});
console.log(`Admin login ready: ${user.username} (id ${user.id})`);
await db.$disconnect();
