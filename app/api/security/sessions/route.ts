import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { purgeExpiredSessions, requireRole } from "@/server/session";

/**
 * Aparelhos da equipe, para o proprietário derrubar o que não reconhece.
 *
 * O login do cliente não expira, então a lista traria um registro por cliente
 * e viraria ruído. Aqui entram só barbeiros e proprietário — que é onde
 * revogar acesso importa — e os clientes viram uma contagem.
 */
export async function GET(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  await purgeExpiredSessions();
  const db = getDb();

  const rows = await db
    .select({
      id: sessions.id,
      role: sessions.role,
      displayName: sessions.displayName,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions);

  const staff = rows
    .filter(row => row.role !== "client")
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

  return Response.json({
    sessions: staff.map(row => ({ ...row, current: row.id === session.id })),
    clientCount: rows.length - staff.length,
  });
}

export async function DELETE(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const payload = (await request.json()) as { id?: string };
  if (!payload.id) return Response.json({ error: "Informe a sessão." }, { status: 400 });
  if (payload.id === session.id) {
    return Response.json({ error: "Use Sair para encerrar a sessão atual." }, { status: 400 });
  }

  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, payload.id));
  return Response.json({ ok: true });
}
