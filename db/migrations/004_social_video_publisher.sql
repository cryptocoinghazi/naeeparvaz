CREATE TABLE IF NOT EXISTS social_publisher_channels (
  platform TEXT PRIMARY KEY CHECK (platform IN ('instagram', 'facebook', 'youtube')),
  organization_id TEXT NOT NULL,
  buffer_channel_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  service TEXT NOT NULL,
  external_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  disconnected BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_video_assets (
  id UUID PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'video/mp4'),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 94371840),
  duration_seconds NUMERIC(8, 3),
  width INTEGER,
  height INTEGER,
  video_codec TEXT,
  audio_codec TEXT,
  status TEXT NOT NULL DEFAULT 'staging' CHECK (status IN ('staging', 'validated', 'retained', 'discarded')),
  validated_at TIMESTAMPTZ,
  delete_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_publish_batches (
  id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES social_video_assets(id),
  publish_mode TEXT NOT NULL CHECK (publish_mode IN ('now', 'scheduled')),
  scheduled_for TIMESTAMPTZ,
  shared_text TEXT NOT NULL,
  instagram_caption TEXT,
  facebook_caption TEXT,
  youtube_title TEXT,
  youtube_description TEXT,
  client_request_id UUID NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'submitting' CHECK (state IN ('submitting', 'partial', 'scheduled', 'published', 'failed', 'cancelled', 'ambiguous')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (publish_mode = 'now' AND scheduled_for IS NULL)
    OR (publish_mode = 'scheduled' AND scheduled_for IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS social_publish_targets (
  batch_id UUID NOT NULL REFERENCES social_publish_batches(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'youtube')),
  buffer_channel_id TEXT NOT NULL,
  buffer_post_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitting', 'scheduled', 'published', 'failed', 'cancelled', 'ambiguous')),
  published_url TEXT,
  provider_due_at TIMESTAMPTZ,
  provider_sent_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  last_refreshed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id, platform),
  UNIQUE (buffer_post_id)
);

CREATE INDEX IF NOT EXISTS idx_social_publish_batches_created
  ON social_publish_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_publish_targets_status
  ON social_publish_targets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_video_assets_cleanup
  ON social_video_assets(status, delete_after);
