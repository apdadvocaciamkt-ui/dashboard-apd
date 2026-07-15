import { NextRequest, NextResponse } from "next/server";
import { searchStream } from "@/lib/googleads";
import { GOOGLE_ADS_CUSTOMER_ID } from "@/lib/accounts";
import { getDB, upsertGoogleAdsDaily, logSync, GoogleAdsDailyRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

// Sincroniza Google Ads -> D1. Ainda bloqueado pela aprovação de Basic Access
// do Developer Token (ver STATUS.md) — enquanto isso, a rota responde com
// status "pendente" em vez de erro, para o dashboard mostrar isso com clareza.
export async function GET(req: NextRequest) {
  const secret = (process.env.SYNC_SECRET ?? "").trim();
  if (!secret || req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  if (!GOOGLE_ADS_CUSTOMER_ID) {
    return NextResponse.json({ ok: false, status: "pendente", motivo: "GOOGLE_ADS_CUSTOMER_ID ainda não definido (aguardando Basic Access para identificar a conta)" });
  }

  const started = Math.floor(Date.now() / 1000);
  const days = Number(req.nextUrl.searchParams.get("days") ?? "35");
  const since = req.nextUrl.searchParams.get("since") ?? fmtDate(new Date(Date.now() - days * 86400000));
  const until = req.nextUrl.searchParams.get("until") ?? fmtDate(new Date());
  const db = getDB();

  const query = `
    SELECT segments.date, campaign.id, campaign.name,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `;

  try {
    const results = await searchStream(GOOGLE_ADS_CUSTOMER_ID, query);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: GoogleAdsDailyRow[] = results.map((r: any) => ({
      customer_id: GOOGLE_ADS_CUSTOMER_ID,
      date: String(r.segments.date),
      campaign_id: String(r.campaign.id),
      campaign_name: String(r.campaign.name ?? ""),
      cost: n(r.metrics.costMicros) / 1_000_000,
      impressions: n(r.metrics.impressions),
      clicks: n(r.metrics.clicks),
      conversions: n(r.metrics.conversions),
    }));

    const now = Math.floor(Date.now() / 1000);
    await upsertGoogleAdsDaily(db, rows, now);

    const finished = Math.floor(Date.now() / 1000);
    await logSync(db, { source: "googleads", started_at: started, finished_at: finished, rows_synced: rows.length, entities_synced: 0, status: "ok" });
    return NextResponse.json({ ok: true, since, until, linhas: rows.length, duracaoSeg: finished - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro";
    const pendente = /DEVELOPER_TOKEN_NOT_APPROVED/i.test(message);
    await logSync(db, { source: "googleads", started_at: started, finished_at: Math.floor(Date.now() / 1000), rows_synced: 0, entities_synced: 0, status: pendente ? "pendente" : "erro" });
    return NextResponse.json(
      { ok: false, status: pendente ? "pendente" : "erro", motivo: message },
      { status: pendente ? 200 : 500 },
    );
  }
}
