// Contas/credenciais do cliente APD por fonte de dados. IDs não são segredo
// (o segredo é o token) — ver .env.local / STATUS.md para o inventário completo.

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export const META_ACCOUNT_ID = env("META_AD_ACCOUNT_ID") || "act_865556772643777";

export const GOOGLE_ADS_CUSTOMER_ID = env("GOOGLE_ADS_CUSTOMER_ID");
export const GOOGLE_ADS_LOGIN_CUSTOMER_ID = env("GOOGLE_ADS_LOGIN_CUSTOMER_ID");

/* ---------- Funil LiderHub ----------
   Mapeamento completo confirmado em 2026-07-12 (herdado do projeto da
   planilha, mesmo workspace). `order` é a posição no funil linear:
   Recepção → Triagem → Análise → Proposta Aceita → Contrato Assinado.
   Contato numa etapa obrigatoriamente passou pelas anteriores — é isso que
   permite o funil cumulativo ("chegou pelo menos até aqui"), sempre afunilando. */

export type FunnelStage = {
  id: string;
  name: string;
  order: number; // 1 = topo
};

export const FUNNEL_STAGES: FunnelStage[] = [
  { id: "2920168b-683e-4afa-bd81-9c495aa91284", name: "Recepção", order: 1 },
  { id: "1b41c7cd-2786-486b-8306-441088f56d0c", name: "Triagem", order: 2 },
  { id: "03175825-61bb-44bb-82d3-6ac64b061844", name: "Análise", order: 3 },
  { id: "00fab89c-3f9e-47a5-8189-3d7d8655fde8", name: "Proposta Aceita", order: 4 },
  { id: "593c7289-ce54-4801-a396-2cbf9445e8ca", name: "Contrato Assinado", order: 5 },
];

export const STAGE_DESQUALIFICADO = "7a317be7-db6a-4120-8af8-bfd276bf3d31";

// 3 contatos apareceram com este status e o nome ainda não foi conferido no
// Kanban da LiderHub — até lá, conta só como "nova conversa" (ordem 1).
export const STAGE_SEM_NOME = "104a7ebc-cbee-48a4-9ef4-326ca1509832";

const STAGE_BY_ID = new Map(FUNNEL_STAGES.map((s) => [s.id, s]));

// Posição do contato no funil: 1..5 para etapas conhecidas; 1 para status
// null/sem nome (contato existe, logo "chegou" ao topo); 0 para desqualificado
// (fora do funil linear — contado à parte como perda).
export function stageOrder(statusId: string | null): number {
  if (statusId === STAGE_DESQUALIFICADO) return 0;
  const stage = statusId ? STAGE_BY_ID.get(statusId) : undefined;
  return stage?.order ?? 1;
}

export function stageName(statusId: string | null): string {
  if (statusId === STAGE_DESQUALIFICADO) return "Desqualificado";
  if (!statusId) return "Sem status";
  return STAGE_BY_ID.get(statusId)?.name ?? "Etapa sem nome";
}

export function isContrato(statusId: string | null): boolean {
  return statusId === "593c7289-ce54-4801-a396-2cbf9445e8ca";
}
