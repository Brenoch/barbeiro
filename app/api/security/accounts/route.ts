import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, barbers } from "@/db/schema";
import { generateTemporaryPassword, hashPassword, randomId } from "@/server/password";
import { destroyAccountSessions, requireRole } from "@/server/session";

/** Lista os acessos. Nenhum hash de senha sai daqui. */
export async function GET(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const db = getDb();
  const rows = await db
    .select({
      id: accounts.id,
      username: accounts.username,
      role: accounts.role,
      barberId: accounts.barberId,
      displayName: accounts.displayName,
      active: accounts.active,
      mustChangePassword: accounts.mustChangePassword,
      lastLoginAt: accounts.lastLoginAt,
      createdAt: accounts.createdAt,
    })
    .from(accounts);

  return Response.json({ accounts: rows, barbers: await db.select().from(barbers) });
}

/** Cria o acesso de um barbeiro com senha provisória de uso único. */
export async function POST(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const payload = (await request.json()) as { username?: string; barberId?: string };
  const username = payload.username?.trim().toLowerCase() ?? "";
  const barberId = payload.barberId ?? "";

  if (username.length < 2) {
    return Response.json({ error: "O usuário precisa de pelo menos 2 caracteres." }, { status: 400 });
  }

  const db = getDb();
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId)).limit(1);
  if (!barber) return Response.json({ error: "Barbeiro não encontrado." }, { status: 400 });

  const [taken] = await db.select().from(accounts).where(eq(accounts.username, username)).limit(1);
  if (taken) return Response.json({ error: "Este usuário já existe." }, { status: 409 });

  const temporaryPassword = generateTemporaryPassword();
  await db.insert(accounts).values({
    id: randomId("acc"),
    username,
    passwordHash: await hashPassword(temporaryPassword),
    role: "barber",
    barberId,
    displayName: barber.name,
    active: true,
    mustChangePassword: true,
  });

  // Exibida uma única vez, na tela de quem criou.
  return Response.json({ ok: true, username, temporaryPassword }, { status: 201 });
}

/** Redefine a senha, ativa ou desativa um acesso. */
export async function PATCH(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const payload = (await request.json()) as {
    id?: string;
    action?: "reset" | "activate" | "deactivate";
  };

  if (!payload.id || !payload.action) {
    return Response.json({ error: "Informe o acesso e a ação." }, { status: 400 });
  }

  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.id, payload.id)).limit(1);
  if (!account) return Response.json({ error: "Acesso não encontrado." }, { status: 404 });

  // Trava de segurança: o proprietário não consegue se trancar para fora.
  if (account.id === session.accountId && payload.action === "deactivate") {
    return Response.json({ error: "Você não pode desativar o próprio acesso." }, { status: 400 });
  }

  if (payload.action === "reset") {
    const temporaryPassword = generateTemporaryPassword();
    await db
      .update(accounts)
      .set({ passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true })
      .where(eq(accounts.id, account.id));
    await destroyAccountSessions(account.id);
    return Response.json({ ok: true, temporaryPassword });
  }

  const active = payload.action === "activate";
  await db.update(accounts).set({ active }).where(eq(accounts.id, account.id));
  if (!active) await destroyAccountSessions(account.id);

  // O acesso e o cadastro de barbeiro são a mesma pessoa saindo ou voltando:
  // desativar um sem o outro deixava o barbeiro sem login mas ainda
  // agendável pelo cliente, ou vice-versa.
  if (account.role === "barber" && account.barberId) {
    await db.update(barbers).set({ active }).where(eq(barbers.id, account.barberId));
  }

  return Response.json({ ok: true, active });
}
