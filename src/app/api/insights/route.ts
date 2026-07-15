import { NextRequest, NextResponse } from "next/server";
import { META_ACCOUNT_ID } from "@/lib/accounts";
import { defForObjective, ObjectiveKey } from "@/lib/objectives";
import { getDB, getMetaDaily, getMetaEntities, MetaDailyRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

function periodDates(req: NextRequest): { since: string; until: string | null } {
  const period = req.nextUrl.searchParams.get("period") ?? "last_30d";
  if (period === "custom") {
    const s = req.nextUrl.searchParams.get("since") ?? "";
    const u = req.nextUrl.searchParams.get("until") ?? "";
    if (DATE_RE.test(s) && DATE_RE.test(u)) return { since: s, until: u };
  }
  const d = new Date();
  const today = fmtDate(d);
  if (period === "today") return { since: today, until: today };
  if (period === "this_month") return { since: fmtDate(new Date(d.getFullYear(), d.getMonth(), 1)), until: today };
  if (period === "last_month") {
    return {
      since: fmtDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
      until: fmtDate(new Date(d.getFullYear(), d.getMonth(), 0)),
    };
  }
  const days = period === "last_7d" ? 7 : 30;
  return { since: fmtDate(new Date(Date.now() - (days - 1) * 86400000)), until: today };
}

function statusDot(effective?: string): "active" | "paused" | "ended" {
  if (!effective) return "ended";
  if (effective === "ACTIVE") return "active";
  if (["DELETED", "ARCHIVED"].includes(effective)) return "ended";
  return "paused";
}

export async function GET(req: NextRequest) {
  try {
    const { since, until } = periodDates(req);

    const db = getDB();
    const rows = await getMetaDaily(db, META_ACCOUNT_ID, since, until);
    const entities = await getMetaEntities(db, META_ACCOUNT_ID);
    const statusById = new Map(entities.map((e) => [String(e.id), statusDot(e.effective_status ?? undefined)]));

    const totals = { spend: 0, impressions: 0, clicks: 0, link_clicks: 0 };
    type ObjAcc = { key: ObjectiveKey; label: string; resultLabel: string; spend: number; result: number; impressions: number; clicks: number; link_clicks: number };
    const byObjective = new Map<ObjectiveKey, ObjAcc>();
    const dailySpend = new Map<string, number>();

    type Ad = { id: string; name: string; status: string; spend: number; result: number };
    type AdSet = { id: string; name: string; status: string; spend: number; result: number; ads: Map<string, Ad> };
    type Camp = { id: string; name: string; objectiveKey: ObjectiveKey; resultLabel: string; status: string; spend: number; result: number; adsets: Map<string, AdSet> };
    const tree = new Map<string, Camp>();

    for (const r of rows as MetaDailyRow[]) {
      const def = defForObjective(r.objective);
      const linkc = r.link_clicks ?? 0;
      totals.spend += r.spend;
      totals.impressions += r.impressions;
      totals.clicks += r.clicks;
      totals.link_clicks += linkc;

      const oa = byObjective.get(def.key) ?? { key: def.key, label: def.label, resultLabel: def.resultLabel, spend: 0, result: 0, impressions: 0, clicks: 0, link_clicks: 0 };
      oa.spend += r.spend; oa.result += r.result; oa.impressions += r.impressions; oa.clicks += r.clicks; oa.link_clicks += linkc;
      byObjective.set(def.key, oa);

      dailySpend.set(r.date, (dailySpend.get(r.date) ?? 0) + r.spend);

      const camp = tree.get(r.campaign_id) ?? {
        id: r.campaign_id, name: r.campaign_name, objectiveKey: def.key, resultLabel: def.resultLabel,
        status: statusById.get(r.campaign_id) ?? "ended", spend: 0, result: 0, adsets: new Map(),
      };
      camp.spend += r.spend; camp.result += r.result;
      const adset = camp.adsets.get(r.adset_id) ?? { id: r.adset_id, name: r.adset_name, status: statusById.get(r.adset_id) ?? "ended", spend: 0, result: 0, ads: new Map() };
      adset.spend += r.spend; adset.result += r.result;
      const ad = adset.ads.get(r.ad_id) ?? { id: r.ad_id, name: r.ad_name, status: statusById.get(r.ad_id) ?? "ended", spend: 0, result: 0 };
      ad.spend += r.spend; ad.result += r.result;
      adset.ads.set(r.ad_id, ad);
      camp.adsets.set(r.adset_id, adset);
      tree.set(r.campaign_id, camp);
    }

    const ctr = (c: number, i: number) => (i > 0 ? (c / i) * 100 : 0);
    const costPer = (s: number, r: number) => (r > 0 ? s / r : 0);
    const cpm = (s: number, i: number) => (i > 0 ? (s / i) * 1000 : 0);
    const cpc = (s: number, lc: number) => (lc > 0 ? s / lc : 0);

    const objectives = Array.from(byObjective.values())
      .map((o) => ({
        key: o.key, label: o.label, resultLabel: o.resultLabel,
        spend: o.spend, result: o.result, costPerResult: costPer(o.spend, o.result),
        impressions: o.impressions, clicks: o.clicks, linkClicks: o.link_clicks,
        ctr: ctr(o.link_clicks, o.impressions), cpc: cpc(o.spend, o.link_clicks), cpm: cpm(o.spend, o.impressions),
      }))
      .sort((a, b) => b.spend - a.spend);

    const dailyTotalSpend = Array.from(dailySpend.entries()).map(([date, spend]) => ({ date, spend })).sort((a, b) => a.date.localeCompare(b.date));

    const treeOut = Array.from(tree.values())
      .map((c) => ({
        id: c.id, name: c.name, objectiveKey: c.objectiveKey, resultLabel: c.resultLabel, status: c.status,
        spend: c.spend, result: c.result, costPerResult: costPer(c.spend, c.result),
        adsets: Array.from(c.adsets.values())
          .map((s) => ({
            id: s.id, name: s.name, status: s.status, spend: s.spend, result: s.result, costPerResult: costPer(s.spend, s.result),
            ads: Array.from(s.ads.values())
              .map((a) => ({ id: a.id, name: a.name, status: a.status, spend: a.spend, result: a.result, costPerResult: costPer(a.spend, a.result) }))
              .sort((x, y) => y.spend - x.spend),
          }))
          .sort((x, y) => y.spend - x.spend),
      }))
      .sort((a, b) => b.spend - a.spend);

    return NextResponse.json({
      account: META_ACCOUNT_ID,
      updatedAt: new Date().toISOString(),
      totals: {
        ...totals,
        ctr: ctr(totals.link_clicks, totals.impressions),
        cpc: cpc(totals.spend, totals.link_clicks),
        cpm: cpm(totals.spend, totals.impressions),
      },
      objectives,
      dailyTotalSpend,
      tree: treeOut,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
