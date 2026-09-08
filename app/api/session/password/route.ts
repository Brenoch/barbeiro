import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/server/password";
import {
  createSession,
  destroyAccountSessions,
  requireRole,
  sessionCookie,
} from "@/server/session";

/** Troca da própria senha. Derruba as outras sessões da conta. */
export async function POST(request: Request) {
  const { session, response } = await requireRole(request, ["barber", "admin"]);
  if (!session || !session.accountId) return response;

  const payload = (await request.json()) as { currentPassword?: string; newPassword?: string };
  const newPassword = payload.newPassword ?? "";

  if (newPassword.length < 8) {
    return Response.json({ error: "A nova senha precisa de pelo menos 8 caracteres." }, { status: 400 });
  }

  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.id, session.accountId)).limit(1);
  if (!account) return Response.json({ error: "Conta não encontrada." }, { status: 404 });

  const valid = await verifyPassword(payload.currentPassword ?? "", account.passwordHash);
  if (!valid) return Response.json({ error: "A senha atual está incorreta." }, { status: 401 });

  await db
    .update(accounts)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(accounts.id, account.id));

  await destroyAccountSessions(account.id);

  const token = await createSession({
    role: account.role as "barber" | "admin",
    accountId: account.id,
    displayName: account.displayName,
    userAgent: request.headers.get("user-agent") ?? "",
  });

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookie(token) } },
  );
}
