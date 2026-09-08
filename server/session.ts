import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, sessions } from "@/db/schema";
import { hashToken, randomId, randomToken } from "./password";

export const SESSION_COOKIE = "bart_session";

/**
 * O login não expira sozinho. O cliente marca horário uma vez e continua
 * entrando sem digitar nada de novo; o barbeiro abre a agenda direto.
 *
 * Só saem da sessão quem sair pelo botão, quem limpar os dados do navegador,
 * e quem tiver o acesso revogado pelo proprietário em Acessos.
 */
const SESSION_DAYS = 3650;

export type Role = "client" | "barber" | "admin";

export type ActiveSession = {
  id: string;
  role: Role;
  accountId: string | null;
  clientId: string | null;
  displayName: string;
  barberId: string | null;
  mustChangePassword: boolean;
};

function expiryDate(days = SESSION_DAYS) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * `HttpOnly` impede o JavaScript da página de ler ou forjar o cookie, que era
 * exatamente o furo da sessão em localStorage. `SameSite=Lax` mantém o login
 * ao voltar de um link externo, como o do WhatsApp.
 */
export function sessionCookie(token: string, days = SESSION_DAYS) {
  const maxAge = days * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

type CreateSessionInput = {
  role: Role;
  accountId?: string | null;
  clientId?: string | null;
  displayName: string;
  userAgent?: string;
};

export async function createSession(input: CreateSessionInput) {
  const db = getDb();
  const token = randomToken();

  await db.insert(sessions).values({
    id: randomId("ses"),
    tokenHash: await hashToken(token),
    role: input.role,
    accountId: input.accountId ?? null,
    clientId: input.clientId ?? null,
    displayName: input.displayName,
    userAgent: (input.userAgent ?? "").slice(0, 180),
    expiresAt: expiryDate(),
  });

  return token;
}

/**
 * Lê a sessão do cookie. Conta desativada ou sessão vencida devolve `null`
 * na mesma hora, então revogar acesso tem efeito imediato.
 */
export async function getSession(request: Request): Promise<ActiveSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const tokenHash = await hashToken(token);

  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!row) return null;

  let barberId: string | null = null;
  let mustChangePassword = false;

  if (row.accountId) {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, row.accountId)).limit(1);
    if (!account || !account.active) return null;
    barberId = account.barberId;
    mustChangePassword = account.mustChangePassword;
  }

  return {
    id: row.id,
    role: row.role as Role,
    accountId: row.accountId,
    clientId: row.clientId,
    displayName: row.displayName,
    barberId,
    mustChangePassword,
  };
}

export async function touchSession(sessionId: string) {
  const db = getDb();
  await db.update(sessions).set({ lastSeenAt: new Date().toISOString() }).where(eq(sessions.id, sessionId));
}

export async function destroySession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;

  const db = getDb();
  await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
}

/** Derruba todas as sessões de uma conta. Usado ao desativar ou trocar senha. */
export async function destroyAccountSessions(accountId: string) {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.accountId, accountId));
}

export async function purgeExpiredSessions() {
  const db = getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
}

export function unauthorized(message = "Não autorizado") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Acesso negado") {
  return Response.json({ error: message }, { status: 403 });
}

/** Exige uma sessão com um dos papéis informados. */
export async function requireRole(request: Request, roles: Role[]) {
  const session = await getSession(request);
  if (!session) return { session: null, response: unauthorized() };
  if (!roles.includes(session.role)) return { session: null, response: forbidden() };
  return { session, response: null };
}
