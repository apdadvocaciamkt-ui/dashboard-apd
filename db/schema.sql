-- Schema do dashboard APD (D1 / SQLite). Idempotente.

-- Log de sincronizações (todas as fontes).
CREATE TABLE IF NOT EXISTS sync_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source         TEXT,    -- 'meta' | 'liderhub' | 'googleads'
  started_at     INTEGER,
  finished_at    INTEGER,
  rows_synced    INTEGER DEFAULT 0,
  entities_synced INTEGER DEFAULT 0,
  status         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_log_source ON sync_log (source, finished_at);

/* ---------- Meta Ads ---------- */

-- Métricas diárias do Meta no nível ANÚNCIO (deriva campanha/objetivo/dia + árvore).
CREATE TABLE IF NOT EXISTS meta_ad_daily (
  account_id    TEXT,
  date          TEXT,          -- 'YYYY-MM-DD'
  campaign_id   TEXT,
  campaign_name TEXT,
  objective     TEXT,
  adset_id      TEXT,
  adset_name    TEXT,
  ad_id         TEXT,
  ad_name       TEXT,
  spend         REAL DEFAULT 0,
  impressions   INTEGER DEFAULT 0,
  clicks        INTEGER DEFAULT 0,
  link_clicks   INTEGER DEFAULT 0,   -- cliques no link (inline_link_clicks)
  result        INTEGER DEFAULT 0,   -- métrica principal do objetivo (pré-calculada)
  synced_at     INTEGER,
  PRIMARY KEY (account_id, date, ad_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_daily_acc_date ON meta_ad_daily (account_id, date);

-- Entidades do Meta (nomes + status atual) para a árvore Campanha▸Conjunto▸Anúncio.
CREATE TABLE IF NOT EXISTS meta_entities (
  account_id       TEXT,
  level            TEXT,   -- 'campaign' | 'adset' | 'ad'
  id               TEXT,
  name             TEXT,
  parent_id        TEXT,   -- campanha do adset / adset do ad
  objective        TEXT,
  effective_status TEXT,
  synced_at        INTEGER,
  PRIMARY KEY (account_id, id)
);

/* ---------- LiderHub (CRM) ---------- */

-- Snapshot atual de cada contato (foto: em qual etapa está agora).
CREATE TABLE IF NOT EXISTS liderhub_contacts (
  id             TEXT PRIMARY KEY,   -- uuid do contato na LiderHub
  contact_number TEXT,
  contact_name   TEXT,
  status_id      TEXT,               -- uuid da etapa atual do funil
  department     TEXT,
  source         TEXT,
  ctwa_clid      TEXT,               -- id do clique em anúncio Meta (quando existe)
  ad_title       TEXT,               -- título do criativo (metadata.externalAdReply.title)
  created_at     TEXT,               -- ISO 8601 original da LiderHub
  synced_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_liderhub_status  ON liderhub_contacts (status_id);
CREATE INDEX IF NOT EXISTS idx_liderhub_created ON liderhub_contacts (created_at);

-- Histórico de mudanças de etapa, construído por nós a cada sync (a API só dá
-- a foto atual; comparando com a foto anterior, o filme nasce daqui pra frente).
CREATE TABLE IF NOT EXISTS liderhub_status_transitions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  TEXT,
  from_status TEXT,
  to_status   TEXT,
  detected_at INTEGER   -- unix do sync que percebeu a mudança (granularidade = cadência do sync)
);
CREATE INDEX IF NOT EXISTS idx_transitions_contact ON liderhub_status_transitions (contact_id, detected_at);
CREATE INDEX IF NOT EXISTS idx_transitions_to      ON liderhub_status_transitions (to_status, detected_at);

/* ---------- Google Ads (pronto para quando aprovar Basic Access) ---------- */

CREATE TABLE IF NOT EXISTS google_ads_daily (
  customer_id   TEXT,
  date          TEXT,          -- 'YYYY-MM-DD'
  campaign_id   TEXT,
  campaign_name TEXT,
  cost          REAL DEFAULT 0,   -- já convertido de micros
  impressions   INTEGER DEFAULT 0,
  clicks        INTEGER DEFAULT 0,
  conversions   REAL DEFAULT 0,
  synced_at     INTEGER,
  PRIMARY KEY (customer_id, date, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_google_daily ON google_ads_daily (customer_id, date);
