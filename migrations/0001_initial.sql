PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  editor_name TEXT NOT NULL,
  editor_title_en TEXT NOT NULL,
  editor_title_hi TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_display TEXT NOT NULL,
  phone_href TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_settings (
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
);

CREATE TABLE IF NOT EXISTS social_links (
  platform TEXT PRIMARY KEY CHECK (platform IN ('instagram', 'youtube', 'facebook', 'x')),
  identity TEXT NOT NULL,
  url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  display_order INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO social_links (platform, identity, url, enabled, display_order) VALUES
  ('instagram', 'naeeparvaznewsofficial', NULL, 1, 1),
  ('youtube', '@NaeeParvazNews', NULL, 1, 2),
  ('facebook', 'Naee Parvaz News', NULL, 1, 3),
  ('x', '@Naee Parvaz News', NULL, 1, 4);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('youtube', 'instagram', 'facebook')),
  provider_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  category TEXT NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS video_translations (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'hi')),
  title TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (video_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_videos_public ON videos(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_featured ON videos(status, featured, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(status, category, published_at DESC);
