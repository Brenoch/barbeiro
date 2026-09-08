import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, clients } from "@/db/schema";
import { randomId, verifyPassword } from "@/server/password";
import {
  clearedSessionCookie,
  createSession,
  destroySession,
  getSession,
  purgeExpiredSessions,
  sessionCookie,
  touchSession,
} from "@/server/session";
import { ensureSeed, normalizePhone } from "@/server/store";

/** Resposta genérica: não revela se o usuário existe ou se a senha errou. */
const INVALID_LOGIN = "Nome ou senha incorretos.";

export async function GET(request: Request) {
  await ensureSeed();
  const db = getDb();
  const session = await getSession(request);
  if (session) await touchSession(session.id);

  const staff = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, "admin"));

  return Response.json({
    session: session
      ? {
          role: session.role,
          name: session.displayName,
          barberId: session.barberId,
          mustChangePassword: session.mustChangePassword,
        }
      : null,
    setupRequired: staff.length === 0,
  });
}

export async function POST(request: Request) {
  await ensureSeed();
  await purgeExpiredSessions();

  const payload = (await request.json()) as {
    mode?: "staff" | "client";
    username?: string;
    password?: string;
    phone?: string;
    name?: string;
  };
  const userAgent = request.headers.get("user-agent") ?? "";

  if (payload.mode === "client") return loginClient(payload, userAgent);
  return loginStaff(payload, userAgent);
}

async function loginStaff(
  payload: { username?: string; password?: string },
  userAgent: string,
) {
  const db = getDb();
  const username = payload.username?.trim().toLowerCase() ?? "";
  const password = payload.password ?? "";

  if (!username || !password) {
    return Response.json({ error: INVALID_LOGIN }, { status: 401 });
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.username, username)).limit(1);

  // Verifica a senha mesmo sem conta encontrada, para o tempo de resposta não
  // denunciar quais usuários existem.
  const reference = account?.passwordHash ?? "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const valid = await verifyPassword(password, reference);

  if (!account || !valid) {
    return Response.json({ error: INVALID_LOGIN }, { status: 401 });
  }
  if (!account.active) {
    return Response.json({ error: "Este acesso foi desativado pela barbearia." }, { status: 403 });
  }

  await db.update(accounts).set({ lastLoginAt: new Date().toISOString() }).where(eq(accounts.id, account.id));

  const token = await createSession({
    role: account.role as "barber" | "admin",
    accountId: account.id,
    displayName: account.displayName,
    userAgent,
  });

  return Response.json(
    {
      session: {
        role: account.role,
        name: account.displayName,
        barberId: account.barberId,
        mustChangePassword: account.mustChangePassword,
      },
    },
    { headers: { "Set-Cookie": sessionCookie(token) } },
  );
}

/**
 * Identificação do cliente por nome e telefone, sem senha.
 *
 * É uma identificação, não uma autenticação: quem souber o telefone de outra
 * pessoa consegue ver e cancelar os horários dela. Foi a escolha da barbearia,
 * para não colocar atrito antes do agendamento.
 */
async function loginClient(
  payload: { phone?: string; name?: string },
  userAgent: string,
) {
  const db = getDb();
  const phone = normalizePhone(payload.phone ?? "");
  const name = payload.name?.trim() ?? "";

  if (name.length < 2) {
    return Response.json({ error: "Informe seu nome." }, { status: 400 });
  }
  if (phone.length < 10) {
    return Response.json({ error: "Informe um telefone válido com DDD." }, { status: 400 });
  }

  const [existing] = await db.select().from(clients).where(eq(clients.phone, phone)).limit(1);

  let clientId = existing?.id;
  if (!clientId) {
    clientId = randomId("cli");
    await db.insert(clients).values({ id: clientId, name, phone });
  } else if (name !== existing.name) {
    await db.update(clients).set({ name }).where(eq(clients.id, clientId));
  }

  const token = await createSession({ role: "client", clientId, displayName: name, userAgent });

  return Response.json(
    { session: { role: "client", name, barberId: null, mustChangePassword: false } },
    { headers: { "Set-Cookie": sessionCookie(token) } },
  );
}

export async function DELETE(request: Request) {
  await destroySession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie() } });
}
