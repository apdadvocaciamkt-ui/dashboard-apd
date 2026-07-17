# Status — Missão 1 (Inventário e obtenção de credenciais)

Última atualização: 2026-07-10

## Meta Ads — ✅ funcional (provisório)
- Ad Account: **APD Trabalhista** (`act_865556772643777`), moeda BRL.
- Token validado com leitura real de insights (`ads_read`, `public_profile`).
- ⚠️ **Não é o padrão final**: é um token de USER (app "Dash TLC"), não um
  System User "Never expire". **Expira em 2026-07-21.**
- Próximo passo: trocar pelo token do System User "Never expire" da agência
  (mesmo padrão do Dashboard Ceci) quando disponível — troca é só substituir
  `META_ACCESS_TOKEN` no `.env.local`, sem mexer em código.

## Google Ads — 🟡 credenciais completas, bloqueado por aprovação do Google
Todas as 4 credenciais foram obtidas e o fluxo OAuth foi validado
ponta-a-ponta (token exchange + chamada autenticada à API v23):
- Developer Token: obtido, em modo **Test Account**.
- OAuth Client ID + Secret: criados no Cloud Console (projeto "Google Ads API Rugido").
- Refresh Token: gerado com sucesso via fluxo OAuth local.
- login-customer-id (MCC): `6814043713`.

**Bloqueio atual**: pedido de **Basic Access** para o Developer Token foi
enviado em 2026-07-10 e está em análise pelo Google Ads API Compliance team
(costuma levar 1–3 dias úteis). Até aprovar, só é possível acessar contas de
teste — chamadas a contas reais retornam `DEVELOPER_TOKEN_NOT_APPROVED`.

**Pendente para quando aprovar**: identificar qual dos Customer IDs abaixo
(encontrados via `listAccessibleCustomers` na MCC `6814043713`) é a conta do
cliente CC/APD — os nomes só ficam visíveis via API depois do Basic Access:
- `1752611820`
- `8826586344` — retornou `CUSTOMER_NOT_ENABLED`, conferir se está certa
- `1722997766` — retornou `USER_PERMISSION_DENIED` (erro diferente dos outros,
  pode não estar vinculada como cliente direto desta MCC)

Ação: conferir no próprio Google Ads (dentro da MCC) qual desses IDs
corresponde à conta CC/APD, e setar em `GOOGLE_ADS_CUSTOMER_ID` no `.env.local`.

## Ferramenta externa — ✅ credenciais e doc completas
Ferramenta: **LiderHub** (CRM onde caem os contatos vindos dos anúncios e
avançam pelas etapas do funil até ganho/perda). Mesmo workspace do APD usado
em outro projeto (planilha) do usuário — dados reaproveitáveis.
Credenciais em `.env.local` (`LIDERHUB_TOKEN_APD`,
`LIDERHUB_AUTH_HEADER=x-company-key`,
`LIDERHUB_BASE_URL=https://api.liderhub.com.br/v1`).

Doc do endpoint:
- `GET /v1/contacts` — params `limit`, `page`, `createdAfter`, `createdBefore`.
- Paginação: percorrer páginas até vir vazia ou `batch.length < limit`.
- Campos: `id`, `contactNumber`, `status` (UUID), `createdAt`, `source`,
  `metadata.externalAdReply.ctwaClid` (só existe se veio de Meta Ads —
  possível ponte de atribuição com o Meta).

Status UUIDs do funil (workspace APD — mapeamento COMPLETO vindo do projeto
da planilha em 2026-07-12; UUIDs valem para qualquer projeto com este token):
| UUID | Etapa | Papel no funil |
|---|---|---|
| `2920168b-683e-4afa-bd81-9c495aa91284` | Recepção | topo (etapa inicial) |
| `1b41c7cd-2786-486b-8306-441088f56d0c` | Triagem | meio |
| `03175825-61bb-44bb-82d3-6ac64b061844` | Análise | meio |
| `00fab89c-3f9e-47a5-8189-3d7d8655fde8` | Proposta Aceita | usada como MQL na planilha |
| `593c7289-ce54-4801-a396-2cbf9445e8ca` | Contrato Assinado | ganho (confirmado via contato "Roseli") |
| `7a317be7-db6a-4120-8af8-bfd276bf3d31` | Desqualificado | perdas (fora do funil linear) |
| `104a7ebc-cbee-48a4-9ef4-326ca1509832` | ⚠️ ainda sem nome | 3 contatos; conferir no Kanban |
| *(null)* | sem status | ~8% dos contatos, nunca triados no Kanban |

Ordem do funil: Recepção → Triagem → Análise → Proposta Aceita → Contrato
Assinado. Desqualificado à parte. Aprendizados herdados da planilha:
- Agrupar por dia usando fuso Brasília (createdAt vem UTC: subtrair 3h).
- `source` vem null até para contato de anúncio — prova de origem paga é
  `metadata.externalAdReply.ctwaClid` (e `title` traz o nome do criativo).
- LiderHub pode responder 429: retry com Retry-After (fallback 30s, 3x).
- Meta: action_type correto é `onsite_conversion.messaging_conversation_started_7d`
  (não confundir com `total_messaging_connection`); atribuição 7d é retroativa,
  por isso re-puxar a janela inteira a cada sync é necessário, não desperdício.
- **LiderHub é somente leitura** — nunca alterar/mover/apagar nada no CRM.
- ⚠️ O projeto da planilha envia eventos CAPI (Lead/Purchase) com dedup em
  `poller_state`. O dashboard NÃO deve enviar CAPI — duplicaria eventos.

**Validado em 2026-07-12** com chamada real: `GET /v1/contacts?limit=5&page=1`
retornou HTTP 200, 280 contatos / 56 páginas no total. Token e header ok.
- Achado: contatos de teste vieram com `status = 2920168b-683e-4afa-bd81-9c495aa91284`,
  UUID ainda não mapeado (não é MQL/Perdas/Contrato Assinado) — provável
  estágio inicial ("Novo"/"Aberto", `ticketStatus` também veio `"Open"`).
  Mapear quando formos montar o funil completo.
- Resposta real tem mais campos que a doc: `contactName`, `department`,
  `connection`, `agent`, `ticketStatus`, `integration`, `tags`, e `metadata`
  mais rico (`sourceApp`, `sourceType`, `sourceID`, `mediaURL`,
  `clickToWhatsappCall`) além do `ctwaClid`.

Uso futuro combinado com o usuário: cruzar dados do LiderHub (funil de leads)
com investimento do Meta Ads e Google Ads.

## Dashboard — ✅ rodando em localhost com dados reais
Next.js + Tailwind + Recharts + Wrangler/D1 (molde do Ceci), identidade visual
"Amazônia" (verde-floresta + dourado). `npm run dev` → http://localhost:3000.

Implementado em 2026-07-12 (herdando lógica validada do projeto da planilha):
- Funil cumulativo de 5 etapas ("chegou pelo menos até aqui" — sempre afunila):
  Nova conversa 280 → Triagem 67 → Análise 39 → Proposta Aceita 15 → Contrato 1.
- Histórico de transições de status (`liderhub_status_transitions`): a cada
  sync, compara status atual vs anterior e grava a mudança. Começa vazio e
  constrói o "filme" daqui pra frente.
- Métricas cruzadas no Resumo: CPL (investimento ÷ conversas Meta), custo/MQL,
  CAC (custo/contrato), % qualificação.
- Leads por criativo: `ad_title` capturado do metadata (dois formatos: novo
  `metadata.title` e antigo `metadata.externalAdReply.title` — 263/280 contatos
  identificados). Ex.: "Cuidador também tem direitos" = 230 leads, 1 contrato.
- Agrupamento diário no fuso Brasília (UTC−3).
- ⚠️ O dashboard NÃO envia CAPI (isso é papel do projeto da planilha/n8n).

Pendências: nome do status `104a7ebc...` (conferir no Kanban), rotacionar
tokens quando o dashboard assumir.

## Produção — ✅ NO AR (deploy 2026-07-16, validado ponta a ponta)

**URL**: https://dashboard-apd.apd-advocacia-mkt.workers.dev

- **GitHub**: código no repositório do cliente,
  `apdadvocaciamkt-ui/dashboard-apd` (branch `main`), usuário como colaborador
  com push. Repo público (decisão consciente do usuário — sem token real
  commitado, `.env.local`/`.dev.vars` seguem fora do Git).
- **Cloudflare** (conta do cliente, id `cd587ed8a82f1d31f2910eb96201ed07`):
  Worker `dashboard-apd` deployado via `npm run cf:deploy` (wrangler direto;
  a conexão Git↔Cloudflare que o usuário estava configurando é opcional agora).
  D1 real `apd-db` (id `3d1bcef9-318f-4878-9bf4-5b8c4ea0edcf`) com schema
  aplicado e dados sincronizados.
- **Segredos em produção** (via `wrangler secret put`, 2026-07-16):
  `META_ACCESS_TOKEN`, `LIDERHUB_TOKEN_APD`, `SYNC_SECRET`,
  `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`,
  `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`.
  O `SYNC_SECRET` de produção é o mesmo do `.env.local` local.
- **Validação em produção (2026-07-16)**: página HTTP 200; sync Meta ok
  (166 linhas diárias, 42 entidades); sync LiderHub ok (337 contatos);
  `/api/insights` com R$ 1.178 de spend/35d; funil 306 → 76 → 46 → 17 → **2
  contratos assinados** (subiu de 1!); Google Ads respondendo "pendente"
  corretamente.
- **Cron automático configurado** (2026-07-17, mesmo padrão do Ceci): Worker
  separado `dashboard-apd-cron` (`cron/worker.js` + `cron/wrangler.jsonc`),
  agendado para **03h15 UTC (00h15 BRT)** todo dia — sincroniza o dia anterior
  já fechado (Meta + LiderHub + Google Ads) via `fetch()` nas rotas de sync.
  Confirmado registrado na Cloudflare via API (`GET .../schedules`).
  ⚠️ Nota: "hoje" no dashboard normalmente vem vazio/incompleto — Meta Ads
  atrasa horas pra consolidar o dia corrente. É esperado, não é bug.
