ALTER TABLE advertisements ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE TABLE tv_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), enabled BOOLEAN NOT NULL DEFAULT FALSE,
  channel_input TEXT NOT NULL DEFAULT '', channel_id TEXT, uploads_id TEXT,
  sync_cursor TEXT, sync_generation UUID, synced_at TIMESTAMPTZ, last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO tv_settings (id) VALUES (1);
CREATE TABLE tv_videos (
  video_id TEXT PRIMARY KEY, title TEXT NOT NULL, published_at TIMESTAMPTZ NOT NULL,
  generation UUID NOT NULL, channel_id TEXT NOT NULL
);
CREATE TABLE tv_sync_items (LIKE tv_videos INCLUDING ALL);

CREATE TABLE reporter_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), settings JSONB NOT NULL DEFAULT '{}',
  next_number BIGINT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO reporter_settings (id) VALUES (1);
CREATE TABLE reporter_templates (
  id UUID PRIMARY KEY, object_key TEXT, layout JSONB NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reporter_applications (
  id UUID PRIMARY KEY, locale TEXT NOT NULL CHECK (locale IN ('en','hi')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under-review','changes-requested','rejected','approved')),
  profile JSONB NOT NULL, payment_terms JSONB NOT NULL, payment_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ, purged_at TIMESTAMPTZ
);
CREATE TABLE reporter_upload_sessions (
  id UUID PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, email TEXT NOT NULL,
  application_id UUID REFERENCES reporter_applications(id), expires_at TIMESTAMPTZ NOT NULL,
  submitted_id UUID REFERENCES reporter_applications(id), terms JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reporter_files (
  id UUID PRIMARY KEY, session_id UUID REFERENCES reporter_upload_sessions(id),
  application_id UUID REFERENCES reporter_applications(id), kind TEXT NOT NULL,
  object_key TEXT UNIQUE NOT NULL, mime TEXT NOT NULL, byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  validated BOOLEAN NOT NULL DEFAULT FALSE, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reporter_corrections (
  token_hash TEXT PRIMARY KEY, application_id UUID NOT NULL REFERENCES reporter_applications(id),
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
);
CREATE TABLE reporter_events (
  id BIGSERIAL PRIMARY KEY, application_id UUID NOT NULL REFERENCES reporter_applications(id),
  actor TEXT NOT NULL, action TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reporter_cards (
  id UUID PRIMARY KEY, application_id UUID UNIQUE NOT NULL REFERENCES reporter_applications(id),
  number BIGINT UNIQUE NOT NULL, designation TEXT NOT NULL, joined_on DATE NOT NULL, expires_on DATE NOT NULL,
  template_id UUID NOT NULL REFERENCES reporter_templates(id), layout JSONB NOT NULL,
  image_key TEXT NOT NULL, pdf_key TEXT NOT NULL, revoked_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reporter_previews (
  id UUID PRIMARY KEY, application_id UUID NOT NULL REFERENCES reporter_applications(id),
  input JSONB NOT NULL, application_version TIMESTAMPTZ NOT NULL, template_id UUID NOT NULL REFERENCES reporter_templates(id),
  image_key TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE reporter_emails (
  id UUID PRIMARY KEY, application_id UUID NOT NULL REFERENCES reporter_applications(id),
  kind TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','unknown')),
  attempts INTEGER NOT NULL DEFAULT 0, last_attempt_at TIMESTAMPTZ, sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reporter_rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX reporter_applications_status ON reporter_applications(status,created_at DESC);
CREATE INDEX reporter_files_application ON reporter_files(application_id);
