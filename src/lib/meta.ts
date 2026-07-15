// Cliente mínimo da API do Meta Ads (Graph API).
// O token vive apenas no servidor (lido de variável de ambiente) e nunca é
// exposto ao frontend — o navegador só fala com as nossas rotas /api/*.

const GRAPH = "https://graph.facebook.com/v19.0";

// .trim() é proposital: variáveis geradas no Windows/PowerShell podem vir com
// BOM (U+FEFF) ou espaços e quebrar a chamada silenciosamente.
function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getToken(): string {
  const token = env("META_ACCESS_TOKEN");
  if (!token) throw new Error("META_ACCESS_TOKEN não configurado (.env.local)");
  return token;
}

export type Insight = Record<string, string>;

// accountId no formato act_XXXX (ou só os dígitos — normalizamos).
export async function fetchInsights(
  accountId: string,
  params: Record<string, string>,
): Promise<Insight[]> {
  const token = getToken();
  const acct = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const qs = new URLSearchParams({ ...params, access_token: token });
  const url = `${GRAPH}/${acct}/insights?${qs.toString()}`;

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (!res.ok || json.error) {
    const msg = json?.error?.message ?? `Meta API respondeu ${res.status}`;
    throw new Error(msg);
  }
  return (json.data ?? []) as Insight[];
}

// Igual a fetchInsights, mas segue a paginação (paging.next) até o fim.
// Usado no sync (nível anúncio com quebra diária pode paginar).
export async function fetchInsightsAll(
  accountId: string,
  params: Record<string, string>,
): Promise<Insight[]> {
  const token = getToken();
  const acct = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const qs = new URLSearchParams({ ...params, access_token: token });
  let url: string | null = `${GRAPH}/${acct}/insights?${qs.toString()}`;
  const out: Insight[] = [];
  let guard = 0;
  while (url && guard < 50) {
    guard++;
    const res: Response = await fetch(url, { cache: "no-store" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json?.error?.message ?? `Meta API respondeu ${res.status}`);
    }
    out.push(...((json.data ?? []) as Insight[]));
    url = (json.paging?.next as string | undefined) ?? null;
  }
  return out;
}

// Busca uma "edge" do nó da conta (ex.: campaigns, adsets, ads), seguindo a
// paginação até o fim. Usado para status (effective_status) e criativos.
export async function fetchEdge(
  accountId: string,
  edge: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const token = getToken();
  const acct = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const qs = new URLSearchParams({ ...params, access_token: token });
  let url: string | null = `${GRAPH}/${acct}/${edge}?${qs.toString()}`;

  const out: Record<string, unknown>[] = [];
  while (url) {
    const res: Response = await fetch(url, { cache: "no-store" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    if (!res.ok || json.error) {
      const msg = json?.error?.message ?? `Meta API respondeu ${res.status}`;
      throw new Error(msg);
    }
    out.push(...((json.data ?? []) as Record<string, unknown>[]));
    url = (json.paging?.next as string | undefined) ?? null;
  }
  return out;
}
