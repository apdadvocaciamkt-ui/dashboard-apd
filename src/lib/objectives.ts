// Mapa de objetivo de campanha (Meta) -> métrica principal ("resultado"),
// imitando a coluna "Resultados" do Gerenciador de Anúncios.

export type ObjectiveKey =
  | "LEADS"
  | "ENGAGEMENT"
  | "TRAFFIC"
  | "AWARENESS"
  | "SALES"
  | "OTHER";

export type ObjectiveDef = {
  key: ObjectiveKey;
  label: string; // rótulo amigável do objetivo
  resultLabel: string; // nome da métrica principal (ex.: "Leads")
  // action_types em ordem de prioridade; usamos o primeiro presente na linha.
  actionTypes: string[];
  useImpressions?: boolean; // objetivos sem "action" (reconhecimento) usam impressões
};

const MAP: Record<string, ObjectiveDef> = {
  OUTCOME_LEADS: {
    key: "LEADS",
    label: "Leads",
    resultLabel: "Leads",
    actionTypes: ["onsite_conversion.lead_grouped", "lead"],
  },
  LEAD_GENERATION: {
    key: "LEADS",
    label: "Leads",
    resultLabel: "Leads",
    actionTypes: ["onsite_conversion.lead_grouped", "lead"],
  },
  OUTCOME_ENGAGEMENT: {
    key: "ENGAGEMENT",
    label: "Conversas (WhatsApp)",
    resultLabel: "Conversas iniciadas",
    actionTypes: ["onsite_conversion.messaging_conversation_started_7d"],
  },
  POST_ENGAGEMENT: {
    key: "ENGAGEMENT",
    label: "Engajamento",
    resultLabel: "Engajamentos",
    actionTypes: ["post_engagement"],
  },
  LINK_CLICKS: {
    key: "TRAFFIC",
    label: "Tráfego",
    resultLabel: "Cliques no link",
    actionTypes: ["link_click"],
  },
  OUTCOME_TRAFFIC: {
    key: "TRAFFIC",
    label: "Tráfego",
    resultLabel: "Cliques no link",
    actionTypes: ["link_click"],
  },
  OUTCOME_AWARENESS: {
    key: "AWARENESS",
    label: "Reconhecimento",
    resultLabel: "Impressões",
    actionTypes: [],
    useImpressions: true,
  },
  BRAND_AWARENESS: {
    key: "AWARENESS",
    label: "Reconhecimento",
    resultLabel: "Impressões",
    actionTypes: [],
    useImpressions: true,
  },
  REACH: {
    key: "AWARENESS",
    label: "Reconhecimento",
    resultLabel: "Impressões",
    actionTypes: [],
    useImpressions: true,
  },
  OUTCOME_SALES: {
    key: "SALES",
    label: "Vendas",
    resultLabel: "Compras",
    actionTypes: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
  },
  CONVERSIONS: {
    key: "SALES",
    label: "Vendas",
    resultLabel: "Compras",
    actionTypes: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
  },
};

export function defForObjective(objective: string | undefined): ObjectiveDef {
  if (objective && MAP[objective]) return MAP[objective];
  return {
    key: "OTHER",
    label: objective ?? "Outros",
    resultLabel: "Resultados",
    actionTypes: [],
  };
}

type Action = { action_type: string; value: string };

// Extrai o "resultado" de uma linha de insight conforme o objetivo.
export function resultFromActions(
  actions: Action[] | undefined,
  def: ObjectiveDef,
  impressions: number,
): number {
  if (def.useImpressions) return impressions;
  if (!actions) return 0;
  for (const t of def.actionTypes) {
    const found = actions.find((a) => a.action_type === t);
    if (found) return Number(found.value ?? 0);
  }
  return 0;
}
