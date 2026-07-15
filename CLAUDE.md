# Projeto: Dashboard CC — Meta Ads + Google Ads + ferramenta externa

## O que é
Dashboard visual de métricas para o cliente **CC**, no mesmo molde do projeto
**Dashboard Ceci** (`C:\Users\Joaoalisson\Downloads\Dashboard Ceci`), que é a
referência de arquitetura comprovada. Diferenças deste projeto:

1. Além de **Meta Ads**, busca dados de **Google Ads**.
2. Integra também **uma ferramenta externa** (tokens dessa ferramenta o usuário já tem).
3. **Nem todas as credenciais existem ainda** — a primeira missão deste projeto é
   guiar o usuário na obtenção do que falta (ver "Missão 1" abaixo).

## Missão 1 — Inventário e obtenção de credenciais
Antes de escrever código de dashboard, montar com o usuário um checklist do que
existe e do que falta, e guiá-lo passo a passo para obter o que falta:

### Meta Ads (padrão já validado na agência)
- **Um único System User** no Business Manager + **um único token "Never expire"**.
- Escopos: `ads_read`, `read_insights` (dashboard é leitura; só incluir
  `ads_management` se este projeto também for criar/editar campanhas).
- O alcance sobre contas é por **asset assignment**, não pelo token: conta nova de
  cliente = Partner Access no BM + atribuir a conta ao mesmo System User.
  **Nunca regenerar token para adicionar conta.**
- Perguntar ao usuário: o token do System User já existente cobre a conta do CC?
  Se sim, reutilizar; se não, só atribuir o asset.

### Google Ads (provavelmente o que falta — guiar com calma)
A API do Google Ads exige 4 credenciais, todas server-side:
1. **Developer Token** — obtido no **API Center** de uma conta de administrador
   (MCC) em ads.google.com. Começa em modo teste; solicitar **Basic Access** para
   ler contas de produção (formulário simples, aprovação em poucos dias).
2. **OAuth Client ID + Secret** — criar projeto no Google Cloud Console, ativar a
   "Google Ads API", criar credencial OAuth 2.0 (tipo Desktop ou Web).
3. **Refresh Token** — gerar uma vez via fluxo OAuth com escopo
   `https://www.googleapis.com/auth/adwords`; não expira em uso regular.
4. **login-customer-id** — o ID da MCC (sem hífens) que tem acesso à conta do cliente.
- Consultas via REST: `POST https://googleads.googleapis.com/vXX/customers/{id}/googleAds:searchStream`
  com **GAQL** (ex.: `SELECT segments.date, metrics.cost_micros, metrics.impressions FROM campaign ...`).
  Custos vêm em **micros** (dividir por 1.000.000).
- Fixar a versão da API explicitamente e conferir se ainda é suportada (Google
  desativa versões ~1 ano após lançamento).

### Ferramenta externa
- O usuário diz já ter os tokens. Perguntar qual é a ferramenta, pedir a doc da
  API (ou URL base + exemplo de chamada) e seguir o mesmo padrão dos outros
  clientes: um `src/lib/<ferramenta>.ts` isolado.
- **Identificada: LiderHub** (CRM de WhatsApp — `src/lib/liderhub.ts`). Mapeamento
  completo do funil e aprendizados de API em `STATUS.md`.
- ⚠️ **Regra permanente, não uma pendência**: a LiderHub é **somente leitura**
  neste projeto — nunca alterar/mover/apagar contato ou status via API. Existe
  um projeto irmão (planilha + n8n) que lê o mesmo workspace e **já envia
  eventos CAPI** (Lead/Purchase) para o Meta com deduplicação própria. Este
  dashboard **nunca deve enviar CAPI** — duplicar esses eventos quebra a
  atribuição de anúncios do cliente no Meta Ads Manager.

## Identidade visual — "Amazônia"
O **visual não é copiado do Ceci** (só a arquitetura é, ver seção abaixo). Este
projeto estreia um novo padrão visual da agência, de uso previsto em outros
clientes futuros: verde-floresta profundo + dourado como acento de
resultado/atenção (nunca decorativo), tipografia serifada para títulos, sans
para interface, `rounded-sm` interno / `rounded` externo. Tokens em
`src/app/globals.css` (CSS variables `--bg`, `--accent`, `--gold` etc., com
variante clara e escura via `data-theme`) e `tailwind.config.ts` (`brand-*`,
`stage-*`). Antes de estilizar algo novo, seguir esses tokens — não introduzir
paleta nova nem copiar o roxo/violeta do Ceci.

## Arquitetura de referência (copiada do Dashboard Ceci — funciona em produção)
- **Stack**: Next.js 15 (App Router, TypeScript) + Tailwind CSS + Recharts.
- **Deploy**: Cloudflare Workers via `@opennextjs/cloudflare` + `wrangler`
  (`npm run cf:deploy` = `opennextjs-cloudflare build && deploy`). Banco **D1**.
- **Segredo nunca no browser**: o frontend só chama rotas internas
  (`/api/insights`, `/api/crm`); os tokens vivem em env vars lidas no servidor.
- **Camadas**:
  - `src/lib/<fonte>.ts` — um cliente mínimo por fonte de dados (meta.ts,
    googleads.ts, etc.), com paginação e tratamento de erro da API.
  - `src/lib/db.ts` — única camada que conhece o D1 (upserts em chunks de 50,
    tipos das linhas). Trocar de banco = mexer só aqui.
  - `src/app/api/sync/<fonte>/route.ts` — rotas de sincronização protegidas por
    `?secret=` comparado com env `SYNC_SECRET`. Janela móvel (~35 dias) com
    upsert: análise é "de ontem pra trás", re-puxar a janela basta.
  - `src/app/api/...` de leitura — servem o frontend a partir do D1/APIs.
  - `src/components/Dashboard.tsx` + componentes de bloco (KPIs, funil, resumo).
- **Contas** registradas em `src/lib/accounts.ts` (id + metadados), o sync itera.
- **wrangler.jsonc**: `account_id` da conta Cloudflare do cliente, binding `DB`
  do D1, `vars` para IDs não-sensíveis. Tokens sensíveis via
  `wrangler secret put` (nunca em `vars` nem no repo).

## Armadilhas conhecidas (aprendidas no projeto Ceci)
- **Windows/PowerShell**: env vars podem vir com BOM (U+FEFF) ou espaços —
  sempre `.trim()` ao ler `process.env` (ver `env()` em `src/lib/meta.ts` do Ceci).
- `.env.local` para dev local; `.env.example` versionado só com placeholders.
  **Nunca commitar token real.**
- Respostas da Graph API paginam (`paging.next`) — seguir até o fim com um
  guard de iterações (ver `fetchInsightsAll` do Ceci).
- Métricas de resultado do Meta vêm em `actions` (array de
  `{action_type, value}`) e o tipo relevante depende do objetivo da campanha —
  o Ceci resolve isso em `src/lib/objectives.ts`; copiar a abordagem.

## Fluxo de trabalho combinado com o usuário
- Projeto passa pelo **GitHub** (repo privado na conta do usuário, depois
  transferido/centralizado no GitHub do cliente) antes do deploy na Cloudflare
  do cliente.
- Começar pelo checklist de credenciais (Missão 1), depois esqueleto do projeto,
  depois uma fonte de dados por vez: Meta primeiro (padrão conhecido), Google
  Ads em seguida, ferramenta externa por último.
- Usuário é gestor de tráfego: explicar termos técnicos quando necessário e
  responder em português.
