import type { Locale, ResolvedVideo, VideoRecord, VideoStatus, VideoTranslation } from "../types/content";
import { getDatabase, timestamp, withTransaction } from "./database";
import { resolveVideo } from "./video";

interface VideoJoinRow {
  id: string;
  source_url: string;
  canonical_url: string;
  provider: VideoRecord["provider"];
  provider_id: string;
  published_at: Date | string;
  category: string;
  featured: boolean;
  status: VideoStatus;
  created_at: Date | string;
  updated_at: Date | string;
  locale: Locale | null;
  title: string | null;
  description: string | null;
}

export interface VideoInput {
  id?: string;
  sourceUrl: string;
  canonicalUrl: string;
  provider: VideoRecord["provider"];
  providerId: string;
  publishedAt: string;
  category: string;
  featured: boolean;
  status: VideoStatus;
  translations: Partial<Record<Locale, VideoTranslation>>;
}

function groupVideos(rows: VideoJoinRow[]): VideoRecord[] {
  const videos = new Map<string, VideoRecord>();
  for (const row of rows) {
    let video = videos.get(row.id);
    if (!video) {
      video = {
        id: row.id,
        sourceUrl: row.source_url,
        canonicalUrl: row.canonical_url,
        provider: row.provider,
        providerId: row.provider_id,
        publishedAt: timestamp(row.published_at),
        category: row.category,
        featured: row.featured,
        status: row.status,
        translations: {},
        createdAt: timestamp(row.created_at),
        updatedAt: timestamp(row.updated_at),
      };
      videos.set(row.id, video);
    }
    if (row.locale && row.title) {
      video.translations[row.locale] = { title: row.title, description: row.description ?? undefined };
    }
  }
  return [...videos.values()];
}

async function queryVideos(locals: App.Locals, publishedOnly: boolean): Promise<VideoRecord[]> {
  const db = getDatabase(locals);
  if (!db) return [];
  const where = publishedOnly ? "WHERE v.status = 'published'" : "";
  try {
    const result = await db.query<VideoJoinRow>(`
      SELECT v.*, t.locale, t.title, t.description
      FROM videos v
      LEFT JOIN video_translations t ON t.video_id = v.id
      ${where}
      ORDER BY v.featured DESC, v.published_at DESC, v.created_at DESC
    `);
    return groupVideos(result.rows);
  } catch (error) {
    console.error("Unable to read videos", error);
    return [];
  }
}

export async function getPublishedVideos(locals: App.Locals, locale: Locale, limit?: number): Promise<ResolvedVideo[]> {
  const videos = await queryVideos(locals, true);
  const resolved = videos.flatMap((video) => {
    try { return [resolveVideo(video, locale)]; } catch { return []; }
  });
  return typeof limit === "number" ? resolved.slice(0, limit) : resolved;
}

export async function getAdminVideos(locals: App.Locals): Promise<VideoRecord[]> {
  return queryVideos(locals, false);
}

export async function saveVideo(locals: App.Locals, input: VideoInput): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  await withTransaction(locals, async (client) => {
    if (input.featured && input.status === "published") {
      await client.query("UPDATE videos SET featured = FALSE, updated_at = CURRENT_TIMESTAMP WHERE featured = TRUE");
    }
    await client.query(`
      INSERT INTO videos (
        id, source_url, canonical_url, provider, provider_id, published_at, category, featured, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        source_url = excluded.source_url,
        canonical_url = excluded.canonical_url,
        provider = excluded.provider,
        provider_id = excluded.provider_id,
        published_at = excluded.published_at,
        category = excluded.category,
        featured = excluded.featured,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `, [
      id,
      input.sourceUrl,
      input.canonicalUrl,
      input.provider,
      input.providerId,
      input.publishedAt,
      input.category,
      input.featured,
      input.status,
    ]);
    await client.query("DELETE FROM video_translations WHERE video_id = $1", [id]);
    for (const locale of ["en", "hi"] as const) {
      const translation = input.translations[locale];
      if (!translation?.title) continue;
      await client.query(
        "INSERT INTO video_translations (video_id, locale, title, description) VALUES ($1, $2, $3, $4)",
        [id, locale, translation.title, translation.description || null],
      );
    }
  });
  return id;
}

export async function setVideoStatus(locals: App.Locals, id: string, status: VideoStatus): Promise<void> {
  const db = getDatabase(locals);
  if (!db) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  await db.query(`
    UPDATE videos
    SET status = $1, featured = CASE WHEN $2 = 'draft' THEN FALSE ELSE featured END, updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
  `, [status, status, id]);
}
