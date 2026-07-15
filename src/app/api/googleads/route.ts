import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_ADS_CUSTOMER_ID } from "@/lib/accounts";
import { getDB, getGoogleAdsDaily } from "@/lib/db";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

function periodDates(req: NextRequest): { since: string; until: string } {
  const period = req.nextUrl.searchParams.get("period") ?? "last_30d";
  const days = period === "last_7d" ? 7 : period === "today" ? 1 : 30;
  const today = fmtDate(new Date());
  return { since: fmtDate(new Date(Date.now() - (days - 1) * 86400000)), until: today };
}

export async function GET(req: NextRequest) {
  if (!GOOGLE_ADS_CUSTOMER_ID) {
    return NextResponse.json({
      status: "pendente",
      motivo: "Aguardando aprovação de Basic Access do Developer Token (ver STATUS.md).",
    });
  }

  try {
    const { since, until } = periodDates(req);
    const db = getDB();
    const rows = await getGoogleAdsDaily(db, GOOGLE_ADS_CUSTOMER_ID, since, until);

    const totals = { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
    const dailyMap = new Map<string, number>();
    for (const r of rows) {
      totals.cost += r.cost;
      totals.impressions += r.impressions;
      totals.clicks += r.clicks;
      totals.conversions += r.conversions;
      dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + r.cost);
    }
    const dailyCost = Array.from(dailyMap.entries()).map(([date, cost]) => ({ date, cost })).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ status: "ok", customerId: GOOGLE_ADS_CUSTOMER_ID, totals, dailyCost });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
