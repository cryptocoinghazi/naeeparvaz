import type {
  ArticleRecord,
  ArticleSourceType,
  ArticleTranslation,
  ContentLabel,
  Locale,
  PublishingStatus,
  ResolvedArticle,
} from "../types/content";
import { getDatabase, timestamp, withTransaction } from "./database";
import { getPublishedVideos } from "./video-repository";

interface ArticleRow {
  id: string;
  slug: string;
  byline: string;
  published_at: Date | string;
  featured: boolean;
  status: PublishingStatus;
  source_type: ArticleSourceType;
  source_name: string | null;
  source_url: string | null;
  cover_drive_id: string | null;
  cover_source_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  locale: Locale | null;
  title: string | null;
  summary: string | null;
  body_markdown: string | null;
  cover_alt: string | null;
}

interface ArticleLabelRow {
  article_id: string;
  id: string;
  kind: ContentLabel["kind"];
  name_en: string;
  name_hi: string;
  display_order: number;
}

interface ArticleVideoRow { article_id: string; video_id: string; display_order: number }

export interface ArticleInput {
  id?: string;
  slug: string;
  byline: string;
  publishedAt: string;
  featured: boolean;
  status: PublishingStatus;
  sourceType: ArticleSourceType;
  sourceName?: string;
  sourceUrl?: string;
  coverDriveId?: string;
  coverSourceUrl?: string;
  labelIds: string[];
  videoIds: string[];
  translations: Partial<Record<Locale, ArticleTranslation>>;
}

function groupArticleRows(rows: ArticleRow[]): ArticleRecord[] {
  const records = new Map<string, ArticleRecord>();
  for (const row of rows) {
    let article = records.get(row.id);
    if (!article) {
      article = {
        id: row.id,
        slug: row.slug,
        byline: row.byline,
        publishedAt: timestamp(row.published_at),
        featured: row.featured,
        status: row.status,
        sourceType: row.source_type,
        sourceName: row.source_name ?? undefined,
        sourceUrl: row.source_url ?? undefined,
        coverDriveId: row.cover_drive_id ?? undefined,
        coverSourceUrl: row.cover_source_url ?? undefined,
        labels: [],
        videoIds: [],
        translations: {},
        createdAt: timestamp(row.created_at),
        updatedAt: timestamp(row.updated_at),
      };
      records.set(row.id, article);
    }
    if (row.locale && row.title && row.summary && row.body_markdown) {
      article.translations[row.locale] = {
        title: row.title,
        summary: row.summary,
        bodyMarkdown: row.body_markdown,
        coverAlt: row.cover_alt ?? undefined,
      };
    }
  }
  return [...records.values()];
}

async function queryArticles(locals: App.Locals, publishedOnly: boolean): Promise<ArticleRecord[]> {
  const database = getDatabase(locals);
  if (!database) return [];
  try {
    const where = publishedOnly ? "WHERE a.status = 'published' AND a.published_at <= CURRENT_TIMESTAMP" : "";
    const baseResult = await database.query<ArticleRow>(`
      SELECT a.*, t.locale, t.title, t.summary, t.body_markdown, t.cover_alt
      FROM articles a
      LEFT JOIN article_translations t ON t.article_id = a.id
      ${where}
      ORDER BY a.featured DESC, a.published_at DESC, a.created_at DESC
    `);
    const articles = groupArticleRows(baseResult.rows);
    if (!articles.length) return [];
    const ids = articles.map((article) => article.id);
    const [labelsResult, videosResult] = await Promise.all([
      database.query<ArticleLabelRow>(`
        SELECT al.article_id, cl.*
        FROM article_labels al
        JOIN content_labels cl ON cl.id = al.label_id
        WHERE al.article_id = ANY($1::uuid[])
        ORDER BY cl.display_order
      `, [ids]),
      database.query<ArticleVideoRow>(`
        SELECT article_id, video_id, display_order
        FROM article_videos
        WHERE article_id = ANY($1::uuid[])
        ORDER BY article_id, display_order
      `, [ids]),
    ]);
    const byId = new Map(articles.map((article) => [article.id, article]));
    for (const row of labelsResult.rows) {
      byId.get(row.article_id)?.labels.push({
        id: row.id,
        kind: row.kind,
        nameEn: row.name_en,
        nameHi: row.name_hi,
        displayOrder: row.display_order,
      });
    }
    for (const row of videosResult.rows) byId.get(row.article_id)?.videoIds.push(row.video_id);
    return articles;
  } catch (error) {
    console.error("Unable to read articles", error);
    return [];
  }
}

export function resolveArticle(article: ArticleRecord, locale: Locale): Omit<ResolvedArticle, "relatedVideos"> {
  const fallbackLocale: Locale = locale === "en" ? "hi" : "en";
  const translation = article.translations[locale] ?? article.translations[fallbackLocale];
  if (!translation) throw new Error(`Article ${article.id} has no usable translation.`);
  return { ...article, ...translation, translationLocale: article.translations[locale] ? locale : fallbackLocale };
}

export async function getPublishedArticles(locals: App.Locals, locale: Locale, limit?: number): Promise<ResolvedArticle[]> {
  const articles = await queryArticles(locals, true);
  const resolved = articles.flatMap((article) => {
    try { return [{ ...resolveArticle(article, locale), relatedVideos: [] }]; } catch { return []; }
  });
  return typeof limit === "number" ? resolved.slice(0, limit) : resolved;
}

export async function getPublishedArticleBySlug(locals: App.Locals, locale: Locale, slug: string): Promise<ResolvedArticle | undefined> {
  const article = (await queryArticles(locals, true)).find((record) => record.slug === slug);
  if (!article) return undefined;
  const allVideos = await getPublishedVideos(locals, locale);
  const videoMap = new Map(allVideos.map((video) => [video.id, video]));
  return {
    ...resolveArticle(article, locale),
    relatedVideos: article.videoIds.flatMap((id) => videoMap.get(id) ? [videoMap.get(id)!] : []),
  };
}

export async function getAdminArticles(locals: App.Locals): Promise<ArticleRecord[]> {
  return queryArticles(locals, false);
}

export async function getAdminArticle(locals: App.Locals, id: string): Promise<ArticleRecord | undefined> {
  return (await queryArticles(locals, false)).find((article) => article.id === id);
}

export async function saveArticle(locals: App.Locals, input: ArticleInput): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  await withTransaction(locals, async (client) => {
    let slug = input.slug;
    if (input.id) {
      const existing = await client.query<{ slug: string }>("SELECT slug FROM articles WHERE id = $1", [id]);
      if (!existing.rows[0]) throw new Error("Article not found.");
      slug = existing.rows[0].slug;
    }
    if (input.featured && input.status === "published") {
      await client.query("UPDATE articles SET featured = FALSE, updated_at = CURRENT_TIMESTAMP WHERE featured = TRUE");
    }
    await client.query(`
      INSERT INTO articles (
        id, slug, byline, published_at, featured, status, source_type, source_name, source_url,
        cover_drive_id, cover_source_url, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        byline = excluded.byline,
        published_at = excluded.published_at,
        featured = excluded.featured,
        status = excluded.status,
        source_type = excluded.source_type,
        source_name = excluded.source_name,
        source_url = excluded.source_url,
        cover_drive_id = excluded.cover_drive_id,
        cover_source_url = excluded.cover_source_url,
        updated_at = CURRENT_TIMESTAMP
    `, [
      id, slug, input.byline, input.publishedAt, input.featured, input.status, input.sourceType,
      input.sourceName || null, input.sourceUrl || null, input.coverDriveId || null, input.coverSourceUrl || null,
    ]);

    await client.query("DELETE FROM article_translations WHERE article_id = $1", [id]);
    for (const locale of ["en", "hi"] as const) {
      const translation = input.translations[locale];
      if (!translation?.title) continue;
      await client.query(`
        INSERT INTO article_translations (article_id, locale, title, summary, body_markdown, cover_alt)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [id, locale, translation.title, translation.summary, translation.bodyMarkdown, translation.coverAlt || null]);
    }

    await client.query("DELETE FROM article_labels WHERE article_id = $1", [id]);
    for (const labelId of input.labelIds) {
      await client.query("INSERT INTO article_labels (article_id, label_id) VALUES ($1, $2)", [id, labelId]);
    }

    const videoIds = [...new Set(input.videoIds)].slice(0, 3);
    if (videoIds.length) {
      const existing = await client.query<{ id: string }>(`
        SELECT v.id
        FROM videos v
        WHERE v.id = ANY($1::uuid[])
          AND (
            v.status = 'published'
            OR EXISTS (SELECT 1 FROM article_videos av WHERE av.article_id = $2 AND av.video_id = v.id)
          )
      `, [videoIds, id]);
      if (existing.rows.length !== videoIds.length) throw new Error("Choose only published related videos.");
    }
    await client.query("DELETE FROM article_videos WHERE article_id = $1", [id]);
    for (const [index, videoId] of videoIds.entries()) {
      await client.query("INSERT INTO article_videos (article_id, video_id, display_order) VALUES ($1,$2,$3)", [id, videoId, index + 1]);
    }
  });
  return id;
}

export async function setArticleStatus(locals: App.Locals, id: string, status: PublishingStatus): Promise<void> {
  const database = getDatabase(locals);
  if (!database) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  await database.query(`
    UPDATE articles
    SET status = $1, featured = CASE WHEN $1 = 'draft' THEN FALSE ELSE featured END, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [status, id]);
}

export async function getPublishedArticleSlugs(locals?: App.Locals): Promise<Array<{ slug: string; updatedAt: string }>> {
  const database = getDatabase(locals);
  if (!database) return [];
  const result = await database.query<{ slug: string; updated_at: Date | string }>(`
    SELECT slug, updated_at FROM articles WHERE status = 'published' AND published_at <= CURRENT_TIMESTAMP ORDER BY published_at DESC
  `);
  return result.rows.map((row) => ({ slug: row.slug, updatedAt: timestamp(row.updated_at) }));
}
