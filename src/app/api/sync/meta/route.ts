import { NextRequest, NextResponse } from "next/server";
import { fetchInsightsAll, fetchEdge } from "@/lib/meta";
import { META_ACCOUNT_ID } from "@/lib/accounts";
import { defForObjective, resultFromActions } from "@/lib/objectives";
import { getDB, upsertMetaDaily, upsertMetaEntities, logSync, MetaDailyRow, MetaEntityRow } from "@/lib/db";

export const dynamic = "force-dynamic";

type Action = { action_type: string; value: string };
const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

// Sincroniza Meta Ads -> D1, janela móvel. Análise é "de ontem pra frente",
// então re-puxar os últimos N dias e fazer upsert basta (sem tempo real).
export async function GET(req: NextRequest) {
  const secret = (process.env.SYNC_SECRET ?? "").trim();
  if (!secret || req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const started = Math.floor(Date.now() / 1000);
  const days = Number(req.nextUrl.searchParams.get("days") ?? "35");
  const since = req.nextUrl.searchParams.get("since") ?? fmtDate(new Date(Date.now() - days * 86400000));
  const until = req.nextUrl.searchParams.get("until") ?? fmtDate(new Date());
  const timeRange = JSON.stringify({ since, until });
  const db = getDB();

  try {
    const rows = await fetchInsightsAll(META_ACCOUNT_ID, {
      level: "ad",
      fields:
        "campaign_id,campaign_name,objective,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions",
      time_increment: "1",
      time_range: timeRange,
      limit: "500",
    });
    const dailyRows: MetaDailyRow[] = rows.map((r) => {
      const def = defForObjective(r.objective as string | undefined);
      const impressions = n(r.impressions);
      const result = resultFromActions(r.actions as unknown as Action[] | undefined, def, impressions);
      return {
        account_id: META_ACCOUNT_ID,
        date: String(r.date_start),
        campaign_id: String(r.campaign_id ?? ""),
        campaign_name: String(r.campaign_name ?? ""),
        objective: String(r.objective ?? ""),
        adset_id: String(r.adset_id ?? ""),
        adset_name: String(r.adset_name ?? ""),
        ad_id: String(r.ad_id ?? ""),
        ad_name: String(r.ad_name ?? ""),
        spend: n(r.spend),
        impressions,
        clicks: n(r.clicks),
        link_clicks: n(r.inline_link_clicks),
        result,
      };
    });

    const ads = await fetchEdge(META_ACCOUNT_ID, "ads", {
      fields:
        "id,name,effective_status,adset{id,name,effective_status},campaign{id,name,objective,effective_status}",
      limit: "500",
    });
    const ents = new Map<string, MetaEntityRow>();
    for (const a of ads) {
      const adset = a.adset as { id?: string; name?: string; effective_status?: string } | undefined;
      const camp = a.campaign as { id?: string; name?: string; objective?: string; effective_status?: string } | undefined;
      ents.set(String(a.id), {
        account_id: META_ACCOUNT_ID, level: "ad", id: String(a.id), name: String(a.name ?? ""),
        parent_id: adset?.id ? String(adset.id) : null, objective: null, effective_status: String(a.effective_status ?? ""),
      });
      if (adset?.id && !ents.has(`as:${adset.id}`)) {
        ents.set(`as:${adset.id}`, {
          account_id: META_ACCOUNT_ID, level: "adset", id: String(adset.id), name: String(adset.name ?? ""),
          parent_id: camp?.id ? String(camp.id) : null, objective: null, effective_status: String(adset.effective_status ?? ""),
        });
      }
      if (camp?.id && !ents.has(`c:${camp.id}`)) {
        ents.set(`c:${camp.id}`, {
          account_id: META_ACCOUNT_ID, level: "campaign", id: String(camp.id), name: String(camp.name ?? ""),
          parent_id: null, objective: String(camp.objective ?? ""), effective_status: String(camp.effective_status ?? ""),
        });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    await upsertMetaDaily(db, dailyRows, now);
    await upsertMetaEntities(db, Array.from(ents.values()), now);

    const finished = Math.floor(Date.now() / 1000);
    await logSync(db, { source: "meta", started_at: started, finished_at: finished, rows_synced: dailyRows.length, entities_synced: ents.size, status: "ok" });
    return NextResponse.json({ ok: true, janelaDias: days, since, until, linhas_diarias: dailyRows.length, entidades: ents.size, duracaoSeg: finished - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro";
    await logSync(db, { source: "meta", started_at: started, finished_at: Math.floor(Date.now() / 1000), rows_synced: 0, entities_synced: 0, status: "erro" });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
