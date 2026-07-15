// Cliente mínimo da API do Google Ads (REST + GAQL). O Developer Token ainda
// está em modo Test Account (Basic Access pendente de aprovação — ver
// STATUS.md), então chamadas a contas reais retornam DEVELOPER_TOKEN_NOT_APPROVED
// até aprovar. O cliente já fica pronto para funcionar assim que aprovar.

const API_VERSION = "v23"; // fixar e revisar periodicamente (Google desativa versões ~1 ano após lançamento)
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function getConfig() {
  const developerToken = env("GOOGLE_ADS_DEVELOPER_TOKEN");
  const clientId = env("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = env("GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_ADS_REFRESH_TOKEN");
  const loginCustomerId = env("GOOGLE_ADS_LOGIN_CUSTOMER_ID");
  if (!developerToken || !clientId || !clientSecret || !refreshToken || !loginCustomerId) {
    throw new Error("Credenciais do Google Ads incompletas (.env.local)");
  }
  return { developerToken, clientId, clientSecret, refreshToken, loginCustomerId };
}

async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = getConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? `OAuth token respondeu ${res.status}`);
  }
  return json.access_token;
}

export type GoogleAdsRow = Record<string, unknown>;

// Executa uma consulta GAQL via searchStream numa conta de cliente (customerId
// sem hífens). Lança erro com a mensagem original do Google (ex.:
// DEVELOPER_TOKEN_NOT_APPROVED) para a rota de sync tratar com uma mensagem amigável.
export async function searchStream(customerId: string, query: string): Promise<GoogleAdsRow[]> {
  const { developerToken, loginCustomerId } = getConfig();
  const accessToken = await getAccessToken();
  const cleanId = customerId.replace(/-/g, "");

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanId}/googleAds:searchStream`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "login-customer-id": loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });

  const json = (await res.json()) as unknown;
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = json as any;
    const msg =
      err?.[0]?.error?.details?.[0]?.errors?.[0]?.errorCode
        ? JSON.stringify(err[0].error.details[0].errors[0].errorCode)
        : (err?.error?.message ?? err?.[0]?.error?.message ?? `Google Ads API respondeu ${res.status}`);
    throw new Error(msg);
  }

  // searchStream retorna um array de "chunks", cada um com { results: [...] }
  const chunks = json as { results?: GoogleAdsRow[] }[];
  const out: GoogleAdsRow[] = [];
  for (const chunk of chunks) {
    if (chunk.results) out.push(...chunk.results);
  }
  return out;
}

// Lista os customer IDs acessíveis pela MCC (login-customer-id) — útil para
// descobrir qual conta é a do cliente antes do Basic Access liberar os nomes.
export async function listAccessibleCustomers(): Promise<string[]> {
  const { developerToken } = getConfig();
  const accessToken = await getAccessToken();
  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${accessToken}`, "developer-token": developerToken },
    cache: "no-store",
  });
  const json = (await res.json()) as { resourceNames?: string[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Google Ads API respondeu ${res.status}`);
  return (json.resourceNames ?? []).map((r) => r.replace("customers/", ""));
}
