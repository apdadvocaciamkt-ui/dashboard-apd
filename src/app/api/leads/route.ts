import { NextRequest, NextResponse } from "next/server";
import { FUNNEL_STAGES, stageOrder, stageName, isContrato } from "@/lib/accounts";
import { getDB, getLiderhubContacts } from "@/lib/db";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

// Dia no fuso de Brasília (createdAt vem em UTC — subtrair 3h antes de truncar,
// senão lead de madrugada cai no dia errado; aprendido no projeto da planilha).
function brDay(isoUtc: string | null): string {
  if (!isoUtc) return "";
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCHours(d.getUTCHours() - 3);
  return d.toISOString().slice(0, 10);
}

function periodDates(req: NextRequest): { since: string; until: string } {
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

export async function GET(req: NextRequest) {
  try {
    const { since, until } = periodDates(req);
    const db = getDB();
    // Busca com 1 dia de folga em UTC e filtra com precisão pelo dia de Brasília.
    const fetchSince = `${fmtDate(new Date(new Date(`${since}T00:00:00Z`).getTime() - 86400000))}T00:00:00Z`;
    const all = await getLiderhubContacts(db, fetchSince);
    const contacts = all.filter((c) => {
      const day = brDay(c.created_at);
      return day >= since && day <= until;
    });

    // Funil cumulativo: cada barra = quantos chegaram PELO MENOS até a etapa.
    // Sempre afunila (contato em Análise conta em Recepção e Triagem também).
    let perdas = 0;
    let semStatus = 0;
    const reached = new Array(FUNNEL_STAGES.length).fill(0);
    const dailyNew = new Map<string, number>();
    const creatives = new Map<string, { leads: number; contratos: number }>();

    for (const c of contacts) {
      const order = stageOrder(c.status_id);
      if (order === 0) perdas++;
      if (!c.status_id) semStatus++;
      for (let i = 0; i < FUNNEL_STAGES.length; i++) {
        if (order >= FUNNEL_STAGES[i].order) reached[i]++;
      }
      // Desqualificado/sem status contam no topo (foram conversas que existiram).
      if (order === 0) reached[0]++;

      const day = brDay(c.created_at);
      if (day) dailyNew.set(day, (dailyNew.get(day) ?? 0) + 1);

      if (c.ad_title) {
        const agg = creatives.get(c.ad_title) ?? { leads: 0, contratos: 0 };
        agg.leads++;
        if (isContrato(c.status_id)) agg.contratos++;
        creatives.set(c.ad_title, agg);
      }
    }

    const funnel = FUNNEL_STAGES.map((s, i) => ({
      name: i === 0 ? "Nova conversa" : s.name,
      reached: reached[i],
    }));

    const dailyNewContacts = Array.from(dailyNew.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const topCreatives = Array.from(creatives.entries())
      .map(([title, v]) => ({ title, leads: v.leads, contratos: v.contratos }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 10);

    const recent = contacts.slice(0, 20).map((c) => ({
      id: c.id,
      name: c.contact_name,
      phone: c.contact_number,
      stage: stageName(c.status_id),
      createdAt: c.created_at,
      fromMetaAd: Boolean(c.ctwa_clid),
      adTitle: c.ad_title,
    }));

    return NextResponse.json({
      since,
      until,
      total: contacts.length,
      funnel,
      perdas,
      semStatus,
      // Compat com a planilha: "MQL" lá = status Proposta Aceita (ordem 4).
      mql: reached[3],
      contratos: reached[4],
      dailyNewContacts,
      topCreatives,
      recent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
