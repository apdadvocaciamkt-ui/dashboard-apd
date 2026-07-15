// Cliente mínimo da API da LiderHub (CRM onde caem os contatos vindos dos
// anúncios). O token vive só no servidor — o navegador fala apenas com as
// nossas rotas /api/*. Doc de referência: STATUS.md.

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function getConfig() {
  const base = env("LIDERHUB_BASE_URL") || "https://api.liderhub.com.br/v1";
  const token = env("LIDERHUB_TOKEN_APD");
  const headerName = env("LIDERHUB_AUTH_HEADER") || "x-company-key";
  if (!token) throw new Error("LIDERHUB_TOKEN_APD não configurado (.env.local)");
  return { base, token, headerName };
}

export type LiderhubContact = {
  id: string;
  contactNumber: string | null;
  contactName?: string | null;
  status: string | null;
  department?: string | null;
  createdAt: string;
  source: string | null;
  metadata?: {
    // Formato antigo: campos aninhados em externalAdReply.
    externalAdReply?: { ctwaClid?: string; title?: string };
    // Formato novo (contatos recentes): campos direto em metadata.
    ctwaClid?: string;
    title?: string;
  };
};

// Prova de origem paga: `source` costuma vir null até para contato de anúncio.
export function ctwaClidOf(c: LiderhubContact): string | null {
  return c.metadata?.externalAdReply?.ctwaClid ?? c.metadata?.ctwaClid ?? null;
}

export function adTitleOf(c: LiderhubContact): string | null {
  return c.metadata?.externalAdReply?.title ?? c.metadata?.title ?? null;
}

const PAGE_LIMIT = 100;
const MAX_PAGES = 200; // guard — 200 * 100 = 20k contatos por sync no máximo

// Busca todos os contatos criados desde `sinceIso`, seguindo a paginação até
// a página vir vazia ou menor que o limite (ver doc da LiderHub em STATUS.md).
export async function fetchContactsAll(sinceIso: string): Promise<LiderhubContact[]> {
  const { base, token, headerName } = getConfig();
  const out: LiderhubContact[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = `${base}/contacts?limit=${PAGE_LIMIT}&page=${page}&createdAfter=${encodeURIComponent(sinceIso)}`;
    let res: Response | null = null;
    // Retry de 429 com Retry-After (aprendido no projeto da planilha).
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, { headers: { [headerName]: token }, cache: "no-store" });
      if (res.status !== 429) break;
      const waitSec = Number(res.headers.get("Retry-After") ?? 30);
      await new Promise((r) => setTimeout(r, Math.min(waitSec, 60) * 1000));
    }
    if (!res || !res.ok) {
      throw new Error(`LiderHub API respondeu ${res?.status ?? "sem resposta"}`);
    }
    const json = (await res.json()) as unknown;
    const batch: LiderhubContact[] = Array.isArray(json)
      ? (json as LiderhubContact[])
      : ((json as { contacts?: LiderhubContact[] }).contacts ?? []);

    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    page++;
  }

  return out;
}
