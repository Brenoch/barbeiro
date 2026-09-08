import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { shopSettings } from "@/db/schema";
import { requireRole } from "@/server/session";
import { clearDemoData } from "@/server/store";

export async function PATCH(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const payload = (await request.json()) as {
    shopName?: string;
    neighborhood?: string;
    ownerPhone?: string;
    notifyOwnerAll?: boolean;
    clearDemo?: boolean;
  };

  if (payload.clearDemo) {
    await clearDemoData();
    return Response.json({ ok: true, cleared: true });
  }

  const changes: Record<string, unknown> = {};
  if (payload.shopName?.trim()) changes.shopName = payload.shopName.trim();
  if (typeof payload.ownerPhone === "string") changes.ownerPhone = payload.ownerPhone.trim().slice(0, 30);
  if (typeof payload.notifyOwnerAll === "boolean") changes.notifyOwnerAll = payload.notifyOwnerAll;
  if (payload.neighborhood?.trim()) changes.neighborhood = payload.neighborhood.trim();
  if (Object.keys(changes).length === 0) return Response.json({ ok: true });

  const db = getDb();
  await db.update(shopSettings).set(changes).where(eq(shopSettings.id, "shop"));
  return Response.json({ ok: true });
}
