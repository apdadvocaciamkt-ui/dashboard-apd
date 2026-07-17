import { NextResponse } from "next/server";
import { getDB, lastSyncAny } from "@/lib/db";

export const dynamic = "force-dynamic";

// Horário real da última sincronização bem-sucedida (Meta/LiderHub) — usado
// pelo dashboard pra mostrar "atualizado em..." em vez de um botão de
// atualizar sem função (o dado só muda 1x por dia, via cron).
export async function GET() {
  try {
    const db = getDB();
    const lastSyncedAt = await lastSyncAny(db);
    return NextResponse.json({ lastSyncedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
