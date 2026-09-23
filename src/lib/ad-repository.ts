import type { AdPlacement, Advertisement, Locale, PublishingStatus, ResolvedAdvertisement } from "../types/content";
import { getDatabase, timestamp } from "./database";

interface AdRow {
  deleted_at: Date | string | null;
  id: string;
  client_name: string;
  headline_en: string | null;
  headline_hi: string | null;
  body_en: string | null;
  body_hi: string | null;
  creative_drive_id: string | null;
  creative_source_url: string | null;
  creative_alt_en: string | null;
  creative_alt_hi: string | null;
  destination_url: string | null;
  placement: AdPlacement;
  priority: number;
  starts_at: Date | string;
  ends_at: Date | string | null;
  status: PublishingStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AdvertisementInput {
  id?: string;
  clientName: string;
  headlineEn?: string;
  headlineHi?: string;
  bodyEn?: string;
  bodyHi?: string;
  creativeDriveId?: string;
  creativeSourceUrl?: string;
  creativeAltEn?: string;
  creativeAltHi?: string;
  destinationUrl?: string;
  placement: AdPlacement;
  priority: number;
  startsAt: string;
  endsAt?: string;
  status: PublishingStatus;
}

function fromRow(row: AdRow): Advertisement {
  return {
    deletedAt: row.deleted_at ? timestamp(row.deleted_at) : undefined,
    id: row.id,
    clientName: row.client_name,
    headlineEn: row.headline_en ?? undefined,
    headlineHi: row.headline_hi ?? undefined,
    bodyEn: row.body_en ?? undefined,
    bodyHi: row.body_hi ?? undefined,
    creativeDriveId: row.creative_drive_id ?? undefined,
    creativeSourceUrl: row.creative_source_url ?? undefined,
    creativeAltEn: row.creative_alt_en ?? undefined,
    creativeAltHi: row.creative_alt_hi ?? undefined,
    destinationUrl: row.destination_url ?? undefined,
    placement: row.placement,
    priority: row.priority,
    startsAt: timestamp(row.starts_at),
    endsAt: row.ends_at ? timestamp(row.ends_at) : undefined,
    status: row.status,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

export function resolveAdvertisement(ad: Advertisement, locale: Locale): ResolvedAdvertisement {
  const headline = locale === "hi" ? ad.headlineHi ?? ad.headlineEn : ad.headlineEn ?? ad.headlineHi;
  const body = locale === "hi" ? ad.bodyHi ?? ad.bodyEn : ad.bodyEn ?? ad.bodyHi;
  const creativeAlt = locale === "hi" ? ad.creativeAltHi ?? ad.creativeAltEn : ad.creativeAltEn ?? ad.creativeAltHi;
  return { ...ad, headline, body, creativeAlt };
}

export async function getAdminAdvertisements(locals: App.Locals): Promise<Advertisement[]> {
  const database = getDatabase(locals);
  if (!database) return [];
  try {
    const result = await database.query<AdRow>("SELECT * FROM advertisements ORDER BY created_at DESC");
    return result.rows.map(fromRow);
  } catch (error) {
    console.error("Unable to read advertisements", error);
    return [];
  }
}

export async function getActiveAdvertisements(locals: App.Locals, locale: Locale): Promise<ResolvedAdvertisement[]> {
  const database = getDatabase(locals);
  if (!database) return [];
  try {
    const result = await database.query<AdRow>(`
      SELECT * FROM advertisements
      WHERE deleted_at IS NULL AND status = 'published'
        AND starts_at <= CURRENT_TIMESTAMP
        AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
      ORDER BY priority DESC, created_at ASC, id ASC
    `);
    return result.rows.map((row) => resolveAdvertisement(fromRow(row), locale));
  } catch (error) {
    console.error("Unable to select advertisement", error);
    return [];
  }
}

export function advertisementState(ad: Advertisement, now = Date.now()): string {
  if (ad.deletedAt) return 'deleted';
  if (ad.status !== 'published') return 'draft';
  if (ad.endsAt && Date.parse(ad.endsAt) <= now) return 'expired';
  return Date.parse(ad.startsAt) > now ? 'scheduled' : 'active';
}

export async function deleteAdvertisement(locals: App.Locals, id: string, restore: boolean): Promise<void> {
  const db = getDatabase(locals);
  if (!db) throw new Error('Database unavailable');
  await db.query(`UPDATE advertisements SET deleted_at = ${restore ? 'NULL' : 'now()'}, status = 'draft', updated_at = now() WHERE id = $1`, [id]);
}

export async function saveAdvertisement(locals: App.Locals, input: AdvertisementInput): Promise<string> {
  const database = getDatabase(locals);
  if (!database) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  const id = input.id ?? crypto.randomUUID();
  await database.query(`
    INSERT INTO advertisements (
      id, client_name, headline_en, headline_hi, body_en, body_hi, creative_drive_id, creative_source_url,
      creative_alt_en, creative_alt_hi, destination_url, placement, priority, starts_at, ends_at, status,
      created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      client_name = excluded.client_name,
      headline_en = excluded.headline_en,
      headline_hi = excluded.headline_hi,
      body_en = excluded.body_en,
      body_hi = excluded.body_hi,
      creative_drive_id = excluded.creative_drive_id,
      creative_source_url = excluded.creative_source_url,
      creative_alt_en = excluded.creative_alt_en,
      creative_alt_hi = excluded.creative_alt_hi,
      destination_url = excluded.destination_url,
      placement = excluded.placement,
      priority = excluded.priority,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `, [
    id, input.clientName, input.headlineEn || null, input.headlineHi || null, input.bodyEn || null, input.bodyHi || null,
    input.creativeDriveId || null, input.creativeSourceUrl || null, input.creativeAltEn || null, input.creativeAltHi || null,
    input.destinationUrl || null, input.placement, input.priority, input.startsAt, input.endsAt || null, input.status,
  ]);
  return id;
}

export async function setAdvertisementStatus(locals: App.Locals, id: string, status: PublishingStatus): Promise<void> {
  const database = getDatabase(locals);
  if (!database) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  await database.query("UPDATE advertisements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [status, id]);
}
