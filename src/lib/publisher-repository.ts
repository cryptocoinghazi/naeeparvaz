import type { PoolClient } from "pg";
import type {
  DiscoveredBufferChannel,
  PublishBatch,
  PublisherAsset,
  PublisherChannel,
  PublishMode,
  PublishState,
  PublishTargetStatus,
  SocialPlatform,
} from "../types/publisher";
import { socialPlatforms } from "../types/publisher";
import { getDatabase, timestamp, withTransaction } from "./database";
import type { ValidatedVideoMetadata } from "./publisher-r2";

interface ChannelRow {
  platform: SocialPlatform;
  organization_id: string;
  buffer_channel_id: string;
  display_name: string;
  service: string;
  external_url: string | null;
  enabled: boolean;
  disconnected: boolean;
  locked: boolean;
  updated_at: Date | string;
}

interface BatchRow {
  batch_id: string;
  asset_id: string;
  object_key: string;
  original_filename: string;
  mime_type: "video/mp4";
  byte_size: string | number;
  duration_seconds: string | number | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  asset_status: PublisherAsset["status"];
  validated_at: Date | string | null;
  delete_after: Date | string | null;
  asset_created_at: Date | string;
  asset_updated_at: Date | string;
  publish_mode: PublishMode;
  scheduled_for: Date | string | null;
  shared_text: string;
  instagram_caption: string | null;
  facebook_caption: string | null;
  youtube_title: string | null;
  youtube_description: string | null;
  client_request_id: string;
  batch_state: PublishState;
  created_by: string;
  batch_created_at: Date | string;
  batch_updated_at: Date | string;
  platform: SocialPlatform;
  buffer_channel_id: string;
  buffer_post_id: string | null;
  target_status: PublishTargetStatus;
  published_url: string | null;
  provider_due_at: Date | string | null;
  provider_sent_at: Date | string | null;
  error_code: string | null;
  error_message: string | null;
  last_refreshed_at: Date | string | null;
}

function channelFromRow(row: ChannelRow): PublisherChannel {
  return {
    platform: row.platform,
    organizationId: row.organization_id,
    channelId: row.buffer_channel_id,
    displayName: row.display_name,
    service: row.service,
    externalUrl: row.external_url ?? undefined,
    enabled: row.enabled,
    disconnected: row.disconnected,
    locked: row.locked,
    updatedAt: timestamp(row.updated_at),
  };
}

export async function getPublisherChannels(locals: App.Locals): Promise<PublisherChannel[]> {
  const db = getDatabase(locals);
  if (!db) return [];
  const result = await db.query<ChannelRow>("SELECT * FROM social_publisher_channels ORDER BY platform");
  return result.rows.map(channelFromRow);
}

function platformForService(service: string): SocialPlatform | undefined {
  const normalized = service.toLowerCase();
  if (normalized.includes("instagram")) return "instagram";
  if (normalized.includes("facebook")) return "facebook";
  if (normalized.includes("youtube")) return "youtube";
  return undefined;
}

export async function savePublisherChannels(locals: App.Locals, discovered: DiscoveredBufferChannel[], selectedIds: Record<SocialPlatform, string | undefined>): Promise<void> {
  await withTransaction(locals, async (client) => {
    for (const platform of socialPlatforms) {
      const selectedId = selectedIds[platform];
      if (!selectedId) {
        await client.query("DELETE FROM social_publisher_channels WHERE platform = $1", [platform]);
        continue;
      }
      const channel = discovered.find((candidate) => candidate.id === selectedId && platformForService(candidate.service) === platform);
      if (!channel) throw new Error(`The selected ${platform} channel was not returned by Buffer.`);
      await client.query(`
        INSERT INTO social_publisher_channels (
          platform, organization_id, buffer_channel_id, display_name, service, external_url,
          enabled, disconnected, locked, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT(platform) DO UPDATE SET
          organization_id = excluded.organization_id,
          buffer_channel_id = excluded.buffer_channel_id,
          display_name = excluded.display_name,
          service = excluded.service,
          external_url = excluded.external_url,
          enabled = TRUE,
          disconnected = excluded.disconnected,
          locked = excluded.locked,
          updated_at = CURRENT_TIMESTAMP
      `, [platform, channel.organizationId, channel.id, channel.displayName, channel.service, channel.externalUrl ?? null, channel.disconnected, channel.locked]);
    }
  });
}

export async function createPublisherAsset(locals: App.Locals, input: { id: string; objectKey: string; filename: string; byteSize: number }): Promise<void> {
  const db = getDatabase(locals);
  if (!db) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  await db.query(`
    INSERT INTO social_video_assets (id, object_key, original_filename, mime_type, byte_size)
    VALUES ($1, $2, $3, 'video/mp4', $4)
  `, [input.id, input.objectKey, input.filename, input.byteSize]);
}

export async function getPublisherAsset(locals: App.Locals, id: string): Promise<PublisherAsset | undefined> {
  const db = getDatabase(locals);
  if (!db) return undefined;
  const result = await db.query<BatchRow>(`
    SELECT id AS asset_id, object_key, original_filename, mime_type, byte_size, duration_seconds,
      width, height, video_codec, audio_codec, status AS asset_status, validated_at, delete_after,
      created_at AS asset_created_at, updated_at AS asset_updated_at
    FROM social_video_assets WHERE id = $1
  `, [id]);
  const row = result.rows[0];
  if (!row) return undefined;
  return assetFromRow(row);
}

function assetFromRow(row: BatchRow): PublisherAsset {
  return {
    id: row.asset_id,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    durationSeconds: row.duration_seconds === null ? undefined : Number(row.duration_seconds),
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    videoCodec: row.video_codec ?? undefined,
    audioCodec: row.audio_codec ?? undefined,
    status: row.asset_status,
    validatedAt: row.validated_at ? timestamp(row.validated_at) : undefined,
    deleteAfter: row.delete_after ? timestamp(row.delete_after) : undefined,
    createdAt: timestamp(row.asset_created_at),
    updatedAt: timestamp(row.asset_updated_at),
  };
}

export async function validatePublisherAssetRecord(locals: App.Locals, id: string, activeKey: string, metadata: ValidatedVideoMetadata): Promise<void> {
  const db = getDatabase(locals);
  if (!db) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  await db.query(`
    UPDATE social_video_assets SET object_key = $1, byte_size = $2, duration_seconds = $3,
      width = $4, height = $5, video_codec = $6, audio_codec = $7, status = 'validated',
      validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $8 AND status = 'staging'
  `, [activeKey, metadata.byteSize, metadata.durationSeconds, metadata.width, metadata.height, metadata.videoCodec, metadata.audioCodec, id]);
}

export interface CreatePublishBatchInput {
  id: string;
  assetId: string;
  mode: PublishMode;
  scheduledFor?: string;
  sharedText: string;
  instagramCaption?: string;
  facebookCaption?: string;
  youtubeTitle?: string;
  youtubeDescription?: string;
  clientRequestId: string;
  createdBy: string;
  targets: Array<{ platform: SocialPlatform; channelId: string }>;
}

export async function createPublishBatch(locals: App.Locals, input: CreatePublishBatchInput): Promise<{ id: string; created: boolean }> {
  return withTransaction(locals, async (client) => {
    const existing = await client.query<{ id: string }>("SELECT id FROM social_publish_batches WHERE client_request_id = $1", [input.clientRequestId]);
    if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
    const lockedAsset = await client.query<{ status: string }>("SELECT status FROM social_video_assets WHERE id = $1 FOR UPDATE", [input.assetId]);
    if (lockedAsset.rows[0]?.status !== "validated") throw new Error("Choose a validated video upload.");
    await client.query(`
      INSERT INTO social_publish_batches (
        id, asset_id, publish_mode, scheduled_for, shared_text, instagram_caption,
        facebook_caption, youtube_title, youtube_description, client_request_id, state, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'submitting', $11)
    `, [input.id, input.assetId, input.mode, input.scheduledFor ?? null, input.sharedText, input.instagramCaption ?? null, input.facebookCaption ?? null, input.youtubeTitle ?? null, input.youtubeDescription ?? null, input.clientRequestId, input.createdBy]);
    for (const target of input.targets) {
      await client.query(`
        INSERT INTO social_publish_targets (batch_id, platform, buffer_channel_id, status)
        VALUES ($1, $2, $3, 'pending')
      `, [input.id, target.platform, target.channelId]);
    }
    return { id: input.id, created: true };
  });
}

function groupBatches(rows: BatchRow[]): PublishBatch[] {
  const batches = new Map<string, PublishBatch>();
  for (const row of rows) {
    let batch = batches.get(row.batch_id);
    if (!batch) {
      batch = {
        id: row.batch_id,
        asset: assetFromRow(row),
        publishMode: row.publish_mode,
        scheduledFor: row.scheduled_for ? timestamp(row.scheduled_for) : undefined,
        sharedText: row.shared_text,
        instagramCaption: row.instagram_caption ?? undefined,
        facebookCaption: row.facebook_caption ?? undefined,
        youtubeTitle: row.youtube_title ?? undefined,
        youtubeDescription: row.youtube_description ?? undefined,
        clientRequestId: row.client_request_id,
        state: row.batch_state,
        createdBy: row.created_by,
        createdAt: timestamp(row.batch_created_at),
        updatedAt: timestamp(row.batch_updated_at),
        targets: [],
      };
      batches.set(row.batch_id, batch);
    }
    batch.targets.push({
      platform: row.platform,
      channelId: row.buffer_channel_id,
      bufferPostId: row.buffer_post_id ?? undefined,
      status: row.target_status,
      publishedUrl: row.published_url ?? undefined,
      providerDueAt: row.provider_due_at ? timestamp(row.provider_due_at) : undefined,
      providerSentAt: row.provider_sent_at ? timestamp(row.provider_sent_at) : undefined,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
      lastRefreshedAt: row.last_refreshed_at ? timestamp(row.last_refreshed_at) : undefined,
    });
  }
  return [...batches.values()];
}

const batchSelect = `
  SELECT b.id AS batch_id, b.publish_mode, b.scheduled_for, b.shared_text, b.instagram_caption,
    b.facebook_caption, b.youtube_title, b.youtube_description, b.client_request_id,
    b.state AS batch_state, b.created_by, b.created_at AS batch_created_at, b.updated_at AS batch_updated_at,
    a.id AS asset_id, a.object_key, a.original_filename, a.mime_type, a.byte_size, a.duration_seconds,
    a.width, a.height, a.video_codec, a.audio_codec, a.status AS asset_status, a.validated_at,
    a.delete_after, a.created_at AS asset_created_at, a.updated_at AS asset_updated_at,
    t.platform, t.buffer_channel_id, t.buffer_post_id, t.status AS target_status, t.published_url,
    t.provider_due_at, t.provider_sent_at, t.error_code, t.error_message, t.last_refreshed_at
  FROM social_publish_batches b
  JOIN social_video_assets a ON a.id = b.asset_id
  JOIN social_publish_targets t ON t.batch_id = b.id
`;

export async function getPublishBatches(locals: App.Locals, limit = 30): Promise<PublishBatch[]> {
  const db = getDatabase(locals);
  if (!db) return [];
  const result = await db.query<BatchRow>(`${batchSelect}
    WHERE b.id IN (SELECT id FROM social_publish_batches ORDER BY created_at DESC LIMIT $1)
    ORDER BY b.created_at DESC, t.platform
  `, [limit]);
  return groupBatches(result.rows);
}

export async function getPublishBatch(locals: App.Locals, id: string): Promise<PublishBatch | undefined> {
  const db = getDatabase(locals);
  if (!db) return undefined;
  const result = await db.query<BatchRow>(`${batchSelect} WHERE b.id = $1 ORDER BY t.platform`, [id]);
  return groupBatches(result.rows)[0];
}

export async function setPublishTarget(locals: App.Locals, batchId: string, platform: SocialPlatform, update: {
  status: PublishTargetStatus;
  bufferPostId?: string;
  publishedUrl?: string;
  providerDueAt?: string;
  providerSentAt?: string;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  await withTransaction(locals, async (client) => {
    await client.query(`
      UPDATE social_publish_targets SET status = $1, buffer_post_id = COALESCE($2, buffer_post_id),
        published_url = COALESCE($3, published_url), provider_due_at = COALESCE($4, provider_due_at),
        provider_sent_at = COALESCE($5, provider_sent_at), error_code = $6, error_message = $7,
        last_refreshed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE batch_id = $8 AND platform = $9
    `, [update.status, update.bufferPostId ?? null, update.publishedUrl ?? null, update.providerDueAt ?? null, update.providerSentAt ?? null, update.errorCode ?? null, update.errorMessage ?? null, batchId, platform]);
    await recomputeBatchState(client, batchId);
  });
}

export async function resetPublishTargetForRetry(locals: App.Locals, batchId: string, platform: SocialPlatform): Promise<void> {
  await withTransaction(locals, async (client) => {
    const result = await client.query<{ status: PublishTargetStatus }>(`
      UPDATE social_publish_targets SET status = 'pending', buffer_post_id = NULL, published_url = NULL,
        provider_due_at = NULL, provider_sent_at = NULL, error_code = NULL, error_message = NULL,
        last_refreshed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE batch_id = $1 AND platform = $2 AND status = 'failed'
      RETURNING status
    `, [batchId, platform]);
    if (!result.rows[0]) throw new Error("Only a confirmed failed target can be retried.");
    await recomputeBatchState(client, batchId);
  });
}

async function recomputeBatchState(client: PoolClient, batchId: string): Promise<void> {
  const result = await client.query<{ status: PublishTargetStatus }>("SELECT status FROM social_publish_targets WHERE batch_id = $1", [batchId]);
  const statuses = result.rows.map((row) => row.status);
  let state: PublishState;
  if (statuses.every((status) => status === "published")) state = "published";
  else if (statuses.some((status) => status === "ambiguous")) state = "ambiguous";
  else if (statuses.every((status) => status === "cancelled")) state = "cancelled";
  else if (statuses.every((status) => status === "failed" || status === "cancelled")) state = "failed";
  else if (statuses.some((status) => status === "failed" || status === "published" || status === "cancelled")) state = "partial";
  else if (statuses.every((status) => status === "scheduled")) state = "scheduled";
  else state = "submitting";
  await client.query("UPDATE social_publish_batches SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [state, batchId]);
}

export async function recomputePublishBatch(locals: App.Locals, batchId: string): Promise<void> {
  await withTransaction(locals, async (client) => {
    await client.query("SELECT id FROM social_publish_batches WHERE id = $1 FOR UPDATE", [batchId]);
    await recomputeBatchState(client, batchId);
  });
}

export async function publisherAssetCanBeDiscarded(locals: App.Locals, assetId: string): Promise<boolean> {
  const db = getDatabase(locals);
  if (!db) return false;
  const result = await db.query<{ used: boolean }>(`
    SELECT EXISTS(SELECT 1 FROM social_publish_batches WHERE asset_id = $1) AS used
  `, [assetId]);
  return !result.rows[0]?.used;
}

export async function markPublisherAssetRetained(locals: App.Locals, assetId: string, objectKey: string): Promise<void> {
  const db = getDatabase(locals);
  if (!db) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  await db.query(`
    UPDATE social_video_assets SET object_key = $1, status = 'retained',
      delete_after = CURRENT_TIMESTAMP + INTERVAL '7 days', updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND status = 'validated'
  `, [objectKey, assetId]);
}

export async function markPublisherAssetDiscarded(locals: App.Locals, assetId: string): Promise<void> {
  const db = getDatabase(locals);
  if (!db) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  await db.query("UPDATE social_video_assets SET status = 'discarded', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [assetId]);
}
