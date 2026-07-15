import { NextRequest, NextResponse } from "next/server";
import { fetchContactsAll, ctwaClidOf, adTitleOf } from "@/lib/liderhub";
import {
  getDB, upsertLiderhubContacts, getContactStatuses, insertTransitions,
  logSync, LiderhubContactRow, StatusTransition,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

// Sincroniza LiderHub -> D1, janela móvel. Além do snapshot, compara o status
// de cada contato com o da foto anterior e grava a transição — a API não dá
// histórico, mas o sync diário constrói um daqui pra frente.
export async function GET(req: NextRequest) {
  const secret = (process.env.SYNC_SECRET ?? "").trim();
  if (!secret || req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const started = Math.floor(Date.now() / 1000);
  const days = Number(req.nextUrl.searchParams.get("days") ?? "35");
  const since = req.nextUrl.searchParams.get("since") ?? `${fmtDate(new Date(Date.now() - days * 86400000))}T00:00:00Z`;
  const db = getDB();

  try {
    const previous = await getContactStatuses(db);
    const contacts = await fetchContactsAll(since);

    const rows: LiderhubContactRow[] = contacts.map((c) => ({
      id: c.id,
      contact_number: c.contactNumber ?? null,
      contact_name: c.contactName ?? null,
      status_id: c.status ?? null,
      department: c.department ?? null,
      source: c.source ?? null,
      ctwa_clid: ctwaClidOf(c),
      ad_title: adTitleOf(c),
      created_at: c.createdAt,
    }));

    // Transições: só para contatos que já existiam e mudaram de status
    // (contato novo entra pelo created_at + status atual, sem ruído aqui).
    const transitions: StatusTransition[] = [];
    for (const r of rows) {
      if (!previous.has(r.id)) continue;
      const before = previous.get(r.id) ?? null;
      if (before !== r.status_id) {
        transitions.push({ contact_id: r.id, from_status: before, to_status: r.status_id });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    await upsertLiderhubContacts(db, rows, now);
    if (transitions.length) await insertTransitions(db, transitions, now);

    const finished = Math.floor(Date.now() / 1000);
    await logSync(db, { source: "liderhub", started_at: started, finished_at: finished, rows_synced: rows.length, entities_synced: transitions.length, status: "ok" });
    return NextResponse.json({ ok: true, janelaDesde: since, contatos: rows.length, transicoes: transitions.length, duracaoSeg: finished - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro";
    await logSync(db, { source: "liderhub", started_at: started, finished_at: Math.floor(Date.now() / 1000), rows_synced: 0, entities_synced: 0, status: "erro" });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
