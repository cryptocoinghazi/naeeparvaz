CREATE TABLE IF NOT EXISTS site_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  editor_name TEXT NOT NULL,
  editor_title_en TEXT NOT NULL,
  editor_title_hi TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_display TEXT NOT NULL,
  phone_href TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_settings (
  id,
  editor_name,
  editor_title_en,
  editor_title_hi,
  email,
  phone_display,
  phone_href
) VALUES (
  1,
  'Mohd. Asim Ali',
  'Editor-in-Chief, Naee Parvaz News',
  'मुख्य संपादक, नई परवाज न्यूज़',
  'editor@naeeparvaz.com',
  '+91 982 330 3222',
  '+919823303222'
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS social_links (
  platform TEXT PRIMARY KEY CHECK (platform IN ('instagram', 'youtube', 'facebook', 'x')),
  identity TEXT NOT NULL,
  url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO social_links (platform, identity, url, enabled, display_order) VALUES
  ('instagram', 'naeeparvaznewsofficial', NULL, TRUE, 1),
  ('youtube', '@NaeeParvazNews', NULL, TRUE, 2),
  ('facebook', 'Naee Parvaz News', NULL, TRUE, 3),
  ('x', '@Naee Parvaz News', NULL, TRUE, 4)
ON CONFLICT (platform) DO NOTHING;

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('youtube', 'instagram', 'facebook')),
  provider_id TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS video_translations (
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'hi')),
  title TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (video_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_videos_public ON videos(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_featured ON videos(status, featured, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(status, category, published_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_requests (
  id BIGSERIAL PRIMARY KEY,
  client_hash TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_login_requests_window
  ON admin_login_requests(client_hash, requested_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_challenges (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_login_challenges_expiry
  ON admin_login_challenges(expires_at);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
