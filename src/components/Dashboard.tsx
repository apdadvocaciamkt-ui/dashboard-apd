"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ThemeToggle from "./ThemeToggle";

/* ── tipos ── */
type ObjectiveSummary = {
  key: string; label: string; resultLabel: string;
  spend: number; result: number; costPerResult: number;
  impressions: number; clicks: number; linkClicks: number;
  ctr: number; cpc: number; cpm: number;
};
type TreeCampaign = {
  id: string; name: string; objectiveKey: string; resultLabel: string; status: string;
  spend: number; result: number; costPerResult: number;
};
type InsightsResponse = {
  account: string; updatedAt: string;
  totals: { spend: number; impressions: number; clicks: number; link_clicks: number; ctr: number; cpc: number; cpm: number };
  objectives: ObjectiveSummary[];
  dailyTotalSpend: { date: string; spend: number }[];
  tree: TreeCampaign[];
  error?: string;
};
type LeadsResponse = {
  since: string; until: string; total: number;
  funnel: { name: string; reached: number }[];
  perdas: number;
  semStatus: number;
  mql: number;
  contratos: number;
  dailyNewContacts: { date: string; count: number }[];
  topCreatives: { title: string; leads: number; contratos: number }[];
  recent: { id: string; name: string | null; phone: string | null; stage: string; createdAt: string | null; fromMetaAd: boolean; adTitle: string | null }[];
  error?: string;
};
type GoogleAdsResponse =
  | { status: "pendente"; motivo: string }
  | { status: "ok"; customerId: string; totals: { cost: number; impressions: number; clicks: number; conversions: number }; dailyCost: { date: string; cost: number }[] }
  | { error: string };

type Period = { type: "today" | "this_month" | "last_month" | "last_7d" | "last_30d" | "custom"; since: string; until: string };
type View = "resumo" | "meta" | "google" | "liderhub";

/* ── formatadores ── */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numFmt = new Intl.NumberFormat("pt-BR");
const fmtMoney = (v: number) => brl.format(Number.isFinite(v) ? v : 0);
const fmtNum = (v: number) => numFmt.format(Number.isFinite(v) ? Math.round(v) : 0);
const fmtDateBR = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const fmtDayMonth = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}` : iso; };

const PERIOD_LABELS: Record<Period["type"], string> = {
  today: "hoje", this_month: "mês atual", last_month: "mês anterior",
  last_7d: "últimos 7 dias", last_30d: "últimos 30 dias", custom: "personalizado",
};
function periodQuery(p: Period): string {
  if (p.type === "custom" && p.since && p.until) return `period=custom&since=${p.since}&until=${p.until}`;
  return `period=${p.type}`;
}

const NAV: { key: View; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "meta", label: "Meta Ads" },
  { key: "google", label: "Google Ads" },
  { key: "liderhub", label: "LiderHub" },
];

const REFRESH_MS = 10 * 60 * 1000;

/* ══════════════════════════════════════
   COMPONENTES VISUAIS
══════════════════════════════════════ */

function Kpi({ label, value, sub, pending }: { label: string; value: string; sub?: ReactNode; pending?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${pending ? "border-dashed border-brand-border bg-brand-gold/[0.06]" : "border-brand-border bg-brand-surface"}`}>
      <div className="mb-2 text-[11px] uppercase tracking-wide text-brand-muted">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-brand-text">{value}</div>
      {sub && <div className="mt-1.5 text-xs">{sub}</div>}
    </div>
  );
}

function Pill({ children, color = "gold" }: { children: ReactNode; color?: "gold" | "accent" | "danger" }) {
  const map = { gold: "text-brand-gold bg-brand-gold/15", accent: "text-brand-accent bg-brand-accent/15", danger: "text-brand-danger bg-brand-danger/15" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${map[color]}`}>{children}</span>;
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-border bg-brand-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function SpendChart({ data }: { data: { date: string; spend: number }[] }) {
  if (data.length === 0) return <p className="py-8 text-center text-xs text-brand-muted">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#34a869" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#34a869" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#85998c" }} axisLine={false} tickLine={false} tickFormatter={fmtDayMonth} />
        <YAxis tick={{ fontSize: 11, fill: "#85998c" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `R$${v}`} width={56} />
        <Tooltip
          formatter={(v: number) => fmtMoney(v)}
          labelFormatter={(d) => fmtDateBR(String(d))}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }}
          labelStyle={{ color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}
          itemStyle={{ color: "var(--text)" }}
        />
        <Area type="monotone" dataKey="spend" name="Investimento" stroke="#34a869" strokeWidth={2.5} fill="url(#gradSpend)" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Funil cumulativo ("chegou pelo menos até aqui") — sempre afunila, do verde
// mais neutro no topo ao mais vibrante no ganho.
const FUNNEL_COLORS = ["var(--stage-aberto)", "#4f8a63", "var(--stage-mql)", "#2ca568", "var(--stage-ganho)"];

/* Funil de silhueta FIXA: o desenho é só uma representação visual de funil —
   quem carrega o dado são os números e percentuais ao lado, que acompanham o
   período filtrado. A forma não muda (senão, com poucos leads no período, o
   desenho deformava). Bordas retas em diagonal, base de cada faixa emendando
   no topo da seguinte, divisórias finas na cor do card. */
const FUNNEL_HALF_WIDTHS = [96, 76, 58, 42, 28, 16];

function FunnelPanel({ data }: { data: LeadsResponse }) {
  const max = Math.max(...data.funnel.map((r) => r.reached), 1);
  const n = data.funnel.length;
  const BAND_H = 44;
  const H = BAND_H * n;
  const W = 200;
  const CX = W / 2;
  const bounds = FUNNEL_HALF_WIDTHS;

  // Cada faixa é um trapézio de bordas retas: topo com a largura da etapa
  // atual, base com a largura exata do topo da etapa seguinte. Empilhados,
  // formam um funil contínuo em diagonal, sem "relevo" entre camadas.
  const bandPath = (i: number) => {
    const yTop = i * BAND_H;
    const yBot = yTop + BAND_H;
    const a = bounds[i];
    const b = bounds[i + 1];
    return [
      `M ${(CX - a).toFixed(2)},${yTop}`,
      `L ${(CX + a).toFixed(2)},${yTop}`,
      `L ${(CX + b).toFixed(2)},${yBot}`,
      `L ${(CX - b).toFixed(2)},${yBot}`,
      "Z",
    ].join(" ");
  };

  return (
    <div>
      {/* Largura limitada e centralizada: em containers largos (aba LiderHub)
          o SVG esticava e deformava o funil. */}
      <div className="mx-auto flex w-full max-w-lg items-stretch gap-2.5">
        <div className="flex w-32 shrink-0 flex-col">
          {data.funnel.map((r) => (
            <div key={r.name} className="flex items-center text-xs text-brand-muted" style={{ height: BAND_H }}>{r.name}</div>
          ))}
        </div>

        <svg className="min-w-0 flex-1" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Funil de leads">
          {data.funnel.map((_, i) => (
            <path key={i} d={bandPath(i)} fill={FUNNEL_COLORS[i] ?? "var(--stage-mql)"} opacity={0.9} />
          ))}
          {/* divisórias finas entre as camadas, na cor do card */}
          {data.funnel.slice(1).map((_, i) => {
            const y = (i + 1) * BAND_H;
            const hw = bounds[i + 1];
            return <line key={i} x1={CX - hw} y1={y} x2={CX + hw} y2={y} stroke="var(--surface)" strokeWidth={2.5} />;
          })}
        </svg>

        <div className="flex w-10 shrink-0 flex-col">
          {data.funnel.map((r) => (
            <div key={r.name} className="flex items-center justify-end text-xs font-bold tabular-nums text-brand-text" style={{ height: BAND_H }}>{r.reached}</div>
          ))}
        </div>
        <div className="flex w-12 shrink-0 flex-col">
          {data.funnel.map((r, i) => (
            <div key={r.name} className="flex items-center justify-end text-[11px] tabular-nums text-brand-muted" style={{ height: BAND_H }}>
              {i === 0 ? "100%" : `${((r.reached / max) * 100).toFixed(1)}%`}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-2 border-t border-brand-border pt-2.5 text-[11px] text-brand-muted">
        + {data.perdas} <span className="font-semibold" style={{ color: "var(--stage-perda)" }}>desqualificados</span>
        {data.semStatus > 0 && <> · {data.semStatus} sem status (não triados no Kanban)</>}
      </p>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "border border-brand-accent/60 bg-brand-accent/10 text-brand-accent" : "border border-transparent text-brand-muted hover:text-brand-text"
      }`}
    >
      {label}
    </button>
  );
}

/* ══════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════ */
export default function Dashboard() {
  const [view, setView] = useState<View>("resumo");
  const [period, setPeriod] = useState<Period>({ type: "last_30d", since: "", until: "" });
  const [showCustom, setShowCustom] = useState(false);
  const [draftSince, setDraftSince] = useState("");
  const [draftUntil, setDraftUntil] = useState("");

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [leads, setLeads] = useState<LeadsResponse | null>(null);
  const [google, setGoogle] = useState<GoogleAdsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = periodQuery(period);
      const [i, l, g] = await Promise.all([
        fetch(`/api/insights?${qs}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/leads?${qs}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/googleads?${qs}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      setInsights(i);
      setLeads(l);
      setGoogle(g);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const PERIODS = [
    { key: "today" as const, label: "Hoje" },
    { key: "this_month" as const, label: "Mês atual" },
    { key: "last_month" as const, label: "Mês anterior" },
    { key: "last_7d" as const, label: "7 dias" },
    { key: "last_30d" as const, label: "30 dias" },
  ];

  const googlePending = google && "status" in google && google.status === "pendente";
  const googleOk = google && "status" in google && google.status === "ok" ? google : null;

  return (
    <div className="flex min-h-screen bg-brand-bg">
      {/* ── Sidebar ── */}
      <aside className="sticky top-0 flex h-screen w-44 shrink-0 flex-col gap-1 overflow-hidden border-r border-brand-border bg-brand-surface2 p-4">
        <div className="mb-6 flex items-center gap-2 font-serif text-base font-semibold text-brand-text">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand-accent" />
          APD
        </div>
        <div className="mb-1 px-1.5 text-[10px] uppercase tracking-wide text-brand-muted">Visão geral</div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className={`rounded-md border-l-2 px-2.5 py-2 text-left text-[13px] transition-colors ${
                view === n.key ? "border-brand-accent bg-brand-accent/10 font-semibold text-brand-text" : "border-transparent text-brand-muted hover:text-brand-text"
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-4">
          <ThemeToggle />
        </div>
      </aside>

      {/* ── Área principal ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-brand-border bg-brand-surface/90 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 className="font-serif text-lg font-semibold text-brand-text">{NAV.find((n) => n.key === view)?.label}</h1>
              <p className="text-xs text-brand-muted">{PERIOD_LABELS[period.type]}{loading ? " · atualizando…" : ""}</p>
            </div>
            <button onClick={load} className="rounded-lg border border-brand-border px-3 py-1.5 text-xs text-brand-muted transition-colors hover:border-brand-accent hover:text-brand-text">
              Atualizar
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-brand-border bg-brand-surface/50 px-6 py-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand-muted">Período</span>
          {PERIODS.map(({ key, label }) => (
            <Chip key={key} label={label} active={period.type === key && !showCustom} onClick={() => { setShowCustom(false); setPeriod({ type: key, since: "", until: "" }); }} />
          ))}
          <Chip label="Personalizado" active={showCustom || period.type === "custom"} onClick={() => setShowCustom(true)} />
          {showCustom && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={draftSince} onChange={(e) => setDraftSince(e.target.value)} className="rounded-lg border border-brand-border bg-brand-surface px-2 py-1 text-xs text-brand-text" />
              <span className="text-brand-muted">→</span>
              <input type="date" value={draftUntil} onChange={(e) => setDraftUntil(e.target.value)} className="rounded-lg border border-brand-border bg-brand-surface px-2 py-1 text-xs text-brand-text" />
              <button
                disabled={!draftSince || !draftUntil}
                onClick={() => { if (draftSince && draftUntil) { setPeriod({ type: "custom", since: draftSince, until: draftUntil }); setShowCustom(false); } }}
                className="rounded-lg bg-brand-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>

        <main className="flex-1 px-6 py-6">
          {view === "resumo" && (() => {
            const spend = insights?.totals.spend ?? 0;
            const conversas = insights?.objectives
              .filter((o) => o.key === "ENGAGEMENT")
              .reduce((acc, o) => acc + o.result, 0) ?? 0;
            const mql = leads?.mql ?? 0;
            const contratos = leads?.contratos ?? 0;
            const totalLeads = leads?.total ?? 0;
            const ratio = (num: number, den: number) => (den > 0 ? num / den : null);
            const money = (v: number | null) => (v == null ? "—" : fmtMoney(v));
            const cpl = ratio(spend, conversas);
            const custoMql = ratio(spend, mql);
            const cac = ratio(spend, contratos);
            const qualif = ratio(mql, totalLeads);
            return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Investimento Meta Ads" value={fmtMoney(spend)} />
                {googlePending ? (
                  <Kpi label="Investimento Google Ads" value="—" pending sub={<Pill color="gold">Aguardando aprovação</Pill>} />
                ) : (
                  <Kpi label="Investimento Google Ads" value={fmtMoney(googleOk?.totals.cost ?? 0)} />
                )}
                <Kpi label="Leads (LiderHub)" value={fmtNum(totalLeads)} />
                <Kpi label="Contratos assinados" value={fmtNum(contratos)} />
              </div>

              {/* Métricas cruzadas: investimento ÷ funil (fórmulas validadas na planilha) */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Custo por conversa (CPL)" value={money(cpl)} sub={<span className="text-brand-muted">{fmtNum(conversas)} conversas iniciadas</span>} />
                <Kpi label="Custo por MQL" value={money(custoMql)} sub={<span className="text-brand-muted">{fmtNum(mql)} propostas aceitas</span>} />
                <Kpi label="Custo por contrato (CAC)" value={money(cac)} />
                <Kpi label="% Qualificação" value={qualif == null ? "—" : `${(qualif * 100).toFixed(1)}%`} sub={<span className="text-brand-muted">MQL ÷ leads</span>} />
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
                <Panel title="Investimento Meta Ads por dia">
                  <div style={{ width: "100%" }}>
                    <SpendChart data={insights?.dailyTotalSpend ?? []} />
                  </div>
                </Panel>
                <Panel title="Funil de leads (LiderHub)">
                  {leads ? <FunnelPanel data={leads} /> : <p className="text-xs text-brand-muted">Carregando…</p>}
                </Panel>
              </div>
            </div>
            );
          })()}

          {view === "meta" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Investimento" value={fmtMoney(insights?.totals.spend ?? 0)} />
                <Kpi label="Impressões" value={fmtNum(insights?.totals.impressions ?? 0)} />
                <Kpi label="Cliques no link" value={fmtNum(insights?.totals.link_clicks ?? 0)} />
                <Kpi label="CTR" value={`${(insights?.totals.ctr ?? 0).toFixed(2)}%`} />
              </div>

              <Panel title="Investimento diário">
                <div style={{ width: "100%" }}>
                  <SpendChart data={insights?.dailyTotalSpend ?? []} />
                </div>
              </Panel>

              <Panel title="Campanhas">
                {!insights || insights.tree.length === 0 ? (
                  <p className="text-xs text-brand-muted">Nenhuma campanha com veiculação neste período (rode o sync ou aguarde dados).</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-brand-muted">
                          <th className="pb-2">Campanha</th>
                          <th className="pb-2 text-right">Investimento</th>
                          <th className="pb-2 text-right">{insights.objectives[0]?.resultLabel ?? "Resultado"}</th>
                          <th className="pb-2 text-right">Custo/result.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insights.tree.map((c) => (
                          <tr key={c.id} className="border-t border-brand-border">
                            <td className="py-2 text-brand-text">{c.name}</td>
                            <td className="py-2 text-right tabular-nums text-brand-text">{fmtMoney(c.spend)}</td>
                            <td className="py-2 text-right tabular-nums text-brand-text">{fmtNum(c.result)}</td>
                            <td className="py-2 text-right tabular-nums text-brand-text">{fmtMoney(c.costPerResult)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
          )}

          {view === "google" && (
            <div className="space-y-4">
              {googlePending ? (
                <Panel title="Status">
                  <div className="flex items-center gap-3">
                    <Pill color="gold">Aguardando aprovação</Pill>
                    <p className="text-xs text-brand-muted">{(google as { motivo: string }).motivo}</p>
                  </div>
                </Panel>
              ) : googleOk ? (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Kpi label="Investimento" value={fmtMoney(googleOk.totals.cost)} />
                    <Kpi label="Impressões" value={fmtNum(googleOk.totals.impressions)} />
                    <Kpi label="Cliques" value={fmtNum(googleOk.totals.clicks)} />
                    <Kpi label="Conversões" value={fmtNum(googleOk.totals.conversions)} />
                  </div>
                  <Panel title="Investimento diário">
                    <div style={{ width: "100%" }}>
                      <SpendChart data={googleOk.dailyCost.map((d) => ({ date: d.date, spend: d.cost }))} />
                    </div>
                  </Panel>
                </>
              ) : (
                <p className="text-xs text-brand-muted">Carregando…</p>
              )}
            </div>
          )}

          {view === "liderhub" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Total de leads" value={fmtNum(leads?.total ?? 0)} />
                <Kpi label="MQL (Proposta Aceita)" value={fmtNum(leads?.mql ?? 0)} />
                <Kpi label="Contratos assinados" value={fmtNum(leads?.contratos ?? 0)} />
                <Kpi label="Desqualificados" value={fmtNum(leads?.perdas ?? 0)} />
              </div>

              <Panel title="Funil (quem chegou pelo menos até cada etapa)">
                {leads ? <FunnelPanel data={leads} /> : <p className="text-xs text-brand-muted">Carregando…</p>}
              </Panel>

              <Panel title="Leads por criativo (anúncios Meta)">
                {!leads || leads.topCreatives.length === 0 ? (
                  <p className="text-xs text-brand-muted">Nenhum lead com criativo identificado no período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-brand-muted">
                          <th className="pb-2">Criativo</th>
                          <th className="pb-2 text-right">Leads</th>
                          <th className="pb-2 text-right">Contratos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.topCreatives.map((c) => (
                          <tr key={c.title} className="border-t border-brand-border">
                            <td className="py-2 text-brand-text">{c.title}</td>
                            <td className="py-2 text-right tabular-nums text-brand-text">{fmtNum(c.leads)}</td>
                            <td className="py-2 text-right tabular-nums text-brand-text">{c.contratos > 0 ? fmtNum(c.contratos) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="Leads recentes">
                {!leads || leads.recent.length === 0 ? (
                  <p className="text-xs text-brand-muted">Nenhum lead no período (rode o sync ou aguarde dados).</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-brand-muted">
                          <th className="pb-2">Nome</th>
                          <th className="pb-2">Telefone</th>
                          <th className="pb-2">Etapa</th>
                          <th className="pb-2">Origem</th>
                          <th className="pb-2 text-right">Criado em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.recent.map((c) => (
                          <tr key={c.id} className="border-t border-brand-border">
                            <td className="py-2 text-brand-text">{c.name ?? "—"}</td>
                            <td className="py-2 tabular-nums text-brand-text">{c.phone ?? "—"}</td>
                            <td className="py-2 text-brand-text">{c.stage}</td>
                            <td className="py-2 text-brand-text">{c.fromMetaAd ? "Meta Ads" : "—"}</td>
                            <td className="py-2 text-right text-brand-muted">{c.createdAt ? fmtDateBR(c.createdAt) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
