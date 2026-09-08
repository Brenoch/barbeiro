import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { hashPassword, randomId } from "@/server/password";
import { createSession, sessionCookie } from "@/server/session";
import { ensureSeed } from "@/server/store";

/**
 * Primeiro acesso do proprietário. Só funciona enquanto não existe nenhuma
 * conta de administrador — é o que evita uma senha padrão no código.
 */
export async function POST(request: Request) {
  await ensureSeed();
  const db = getDb();

  const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, "admin"));
  if (existing.length > 0) {
    return Response.json({ error: "O acesso do proprietário já foi criado." }, { status: 409 });
  }

  const payload = (await request.json()) as { username?: string; password?: string; name?: string };
  const username = payload.username?.trim().toLowerCase() ?? "";
  const password = payload.password ?? "";

  if (username.length < 4) {
    return Response.json({ error: "O usuário precisa de pelo menos 4 caracteres." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "A senha precisa de pelo menos 8 caracteres." }, { status: 400 });
  }

  const id = randomId("acc");
  const displayName = payload.name?.trim() || "Proprietário";

  await db.insert(accounts).values({
    id,
    username,
    passwordHash: await hashPassword(password),
    role: "admin",
    barberId: null,
    displayName,
    active: true,
    mustChangePassword: false,
  });

  const token = await createSession({
    role: "admin",
    accountId: id,
    displayName,
    userAgent: request.headers.get("user-agent") ?? "",
  });

  return Response.json(
    { session: { role: "admin", name: displayName, barberId: null, mustChangePassword: false } },
    { status: 201, headers: { "Set-Cookie": sessionCookie(token) } },
  );
}
