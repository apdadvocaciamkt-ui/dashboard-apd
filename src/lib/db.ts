// Camada de dados isolada sobre o D1 (Cloudflare). Conter aqui tudo que é
// específico do D1 reduz o lock-in: para trocar de banco, mexe-se só neste arquivo.

import { getCloudflareContext } from "@opennextjs/cloudflare";

// Tipos mínimos do D1 (evita depender de @cloudflare/workers-types).
interface D1PreparedStatement {
  bind(...vals: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface D1DB {
  prepare(sql: string): D1PreparedStatement;
  batch(stmts: D1PreparedStatement[]): Promise<unknown>;
  exec(sql: string): Promise<unknown>;
}

export function getDB(): D1DB {
  const { env } = getCloudflareContext();
  const db = (env as unknown as { DB?: D1DB }).DB;
  if (!db) throw new Error("Binding D1 'DB' não disponível");
  return db;
}

const CHUNK = 50;

export async function logSync(
  db: D1DB,
  row: { source: string; started_at: number; finished_at: number; rows_synced: number; entities_synced: number; status: string },
) {
  await db
    .prepare(
      `INSERT INTO sync_log (source, started_at, finished_at, rows_synced, entities_synced, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.source, row.started_at, row.finished_at, row.rows_synced, row.entities_synced, row.status)
    .run();
}

export async function lastSync(db: D1DB, source: string): Promise<number | null> {
  const row = await db
    .prepare(`SELECT MAX(finished_at) AS t FROM sync_log WHERE source = ? AND status = 'ok'`)
    .bind(source)
    .first<{ t: number | null }>();
  return row?.t ?? null;
}

/* ---------- Meta Ads ---------- */
export type MetaDailyRow = {
  account_id: string;
  date: string;
  campaign_id: string;
  campaign_name: string;
  objective: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  result: number;
};
export type MetaEntityRow = {
  account_id: string;
  level: string;
  id: string;
  name: string;
  parent_id: string | null;
  objective: string | null;
  effective_status: string | null;
};

export async function upsertMetaDaily(db: D1DB, rows: MetaDailyRow[], syncedAt: number) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const stmts = slice.map((r) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO meta_ad_daily
           (account_id, date, campaign_id, campaign_name, objective, adset_id, adset_name,
            ad_id, ad_name, spend, impressions, clicks, link_clicks, result, synced_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          r.account_id, r.date, r.campaign_id, r.campaign_name, r.objective, r.adset_id, r.adset_name,
          r.ad_id, r.ad_name, r.spend, r.impressions, r.clicks, r.link_clicks, r.result, syncedAt,
        ),
    );
    if (stmts.length) await db.batch(stmts);
  }
}

export async function upsertMetaEntities(db: D1DB, rows: MetaEntityRow[], syncedAt: number) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const stmts = slice.map((r) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO meta_entities
           (account_id, level, id, name, parent_id, objective, effective_status, synced_at)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .bind(r.account_id, r.level, r.id, r.name, r.parent_id, r.objective, r.effective_status, syncedAt),
    );
    if (stmts.length) await db.batch(stmts);
  }
}

export async function getMetaDaily(
  db: D1DB,
  accountId: string,
  sinceDate: string,
  untilDate: string | null,
): Promise<MetaDailyRow[]> {
  const sql = untilDate
    ? `SELECT * FROM meta_ad_daily WHERE account_id = ? AND date >= ? AND date <= ?`
    : `SELECT * FROM meta_ad_daily WHERE account_id = ? AND date >= ?`;
  const stmt = untilDate ? db.prepare(sql).bind(accountId, sinceDate, untilDate) : db.prepare(sql).bind(accountId, sinceDate);
  const res = await stmt.all<MetaDailyRow>();
  return res.results ?? [];
}

export async function getMetaEntities(db: D1DB, accountId: string): Promise<MetaEntityRow[]> {
  const res = await db.prepare(`SELECT * FROM meta_entities WHERE account_id = ?`).bind(accountId).all<MetaEntityRow>();
  return res.results ?? [];
}

/* ---------- LiderHub ---------- */
export type LiderhubContactRow = {
  id: string;
  contact_number: string | null;
  contact_name: string | null;
  status_id: string | null;
  department: string | null;
  source: string | null;
  ctwa_clid: string | null;
  ad_title: string | null;
  created_at: string | null;
};

export async function upsertLiderhubContacts(db: D1DB, rows: LiderhubContactRow[], syncedAt: number) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const stmts = slice.map((r) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO liderhub_contacts
           (id, contact_number, contact_name, status_id, department, source, ctwa_clid, ad_title, created_at, synced_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(r.id, r.contact_number, r.contact_name, r.status_id, r.department, r.source, r.ctwa_clid, r.ad_title, r.created_at, syncedAt),
    );
    if (stmts.length) await db.batch(stmts);
  }
}

// Foto anterior dos status (id -> status_id) para detectar transições no sync.
export async function getContactStatuses(db: D1DB): Promise<Map<string, string | null>> {
  const res = await db.prepare(`SELECT id, status_id FROM liderhub_contacts`).all<{ id: string; status_id: string | null }>();
  return new Map((res.results ?? []).map((r) => [r.id, r.status_id]));
}

export type StatusTransition = {
  contact_id: string;
  from_status: string | null;
  to_status: string | null;
};

export async function insertTransitions(db: D1DB, rows: StatusTransition[], detectedAt: number) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const stmts = slice.map((r) =>
      db
        .prepare(
          `INSERT INTO liderhub_status_transitions (contact_id, from_status, to_status, detected_at)
           VALUES (?,?,?,?)`,
        )
        .bind(r.contact_id, r.from_status, r.to_status, detectedAt),
    );
    if (stmts.length) await db.batch(stmts);
  }
}

export async function getLiderhubContacts(db: D1DB, sinceIso: string): Promise<LiderhubContactRow[]> {
  const res = await db
    .prepare(`SELECT * FROM liderhub_contacts WHERE created_at >= ? ORDER BY created_at DESC`)
    .bind(sinceIso)
    .all<LiderhubContactRow>();
  return res.results ?? [];
}

/* ---------- Google Ads ---------- */
export type GoogleAdsDailyRow = {
  customer_id: string;
  date: string;
  campaign_id: string;
  campaign_name: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

export async function upsertGoogleAdsDaily(db: D1DB, rows: GoogleAdsDailyRow[], syncedAt: number) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const stmts = slice.map((r) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO google_ads_daily
           (customer_id, date, campaign_id, campaign_name, cost, impressions, clicks, conversions, synced_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(r.customer_id, r.date, r.campaign_id, r.campaign_name, r.cost, r.impressions, r.clicks, r.conversions, syncedAt),
    );
    if (stmts.length) await db.batch(stmts);
  }
}

export async function getGoogleAdsDaily(
  db: D1DB,
  customerId: string,
  sinceDate: string,
  untilDate: string | null,
): Promise<GoogleAdsDailyRow[]> {
  const sql = untilDate
    ? `SELECT * FROM google_ads_daily WHERE customer_id = ? AND date >= ? AND date <= ?`
    : `SELECT * FROM google_ads_daily WHERE customer_id = ? AND date >= ?`;
  const stmt = untilDate ? db.prepare(sql).bind(customerId, sinceDate, untilDate) : db.prepare(sql).bind(customerId, sinceDate);
  const res = await stmt.all<GoogleAdsDailyRow>();
  return res.results ?? [];
}
