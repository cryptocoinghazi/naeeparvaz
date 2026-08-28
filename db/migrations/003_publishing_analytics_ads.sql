CREATE TABLE IF NOT EXISTS content_labels (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('coverage', 'topic')),
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  display_order INTEGER NOT NULL UNIQUE
);

INSERT INTO content_labels (id, kind, name_en, name_hi, display_order) VALUES
  ('local-area', 'coverage', 'Local Area', 'स्थानीय क्षेत्र', 1),
  ('state', 'coverage', 'State', 'राज्य', 2),
  ('country', 'coverage', 'Country', 'देश', 3),
  ('other', 'coverage', 'Other', 'अन्य', 4),
  ('politics', 'topic', 'Politics & Public Affairs', 'राजनीति और सार्वजनिक मामले', 10),
  ('society', 'topic', 'Society', 'समाज', 11),
  ('education', 'topic', 'Education', 'शिक्षा', 12),
  ('economy-business', 'topic', 'Economy & Business', 'अर्थव्यवस्था और व्यवसाय', 13),
  ('technology', 'topic', 'Technology', 'प्रौद्योगिकी', 14),
  ('culture', 'topic', 'Culture', 'संस्कृति', 15),
  ('opinion', 'topic', 'Opinion', 'विचार', 16),
  ('interviews', 'topic', 'Interviews', 'साक्षात्कार', 17),
  ('explainers', 'topic', 'Explainers', 'व्याख्या', 18),
  ('investigations', 'topic', 'Investigations', 'खोजी रिपोर्ट', 19),
  ('ground-reports', 'topic', 'Ground Reports', 'ग्राउंड रिपोर्ट', 20),
  ('video-reports', 'topic', 'Video Reports', 'वीडियो रिपोर्ट', 21),
  ('podcast', 'topic', 'Podcast', 'पॉडकास्ट', 22)
ON CONFLICT (id) DO UPDATE SET
  kind = excluded.kind,
  name_en = excluded.name_en,
  name_hi = excluded.name_hi,
  display_order = excluded.display_order;

ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_drive_id TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_source_url TEXT;

CREATE TABLE IF NOT EXISTS video_labels (
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES content_labels(id),
  PRIMARY KEY (video_id, label_id)
);

INSERT INTO video_labels (video_id, label_id)
SELECT id,
  CASE category
    WHEN 'local' THEN 'local-area'
    WHEN 'maharashtra' THEN 'state'
    WHEN 'india' THEN 'country'
    WHEN 'politics' THEN 'politics'
    WHEN 'society' THEN 'society'
    WHEN 'education' THEN 'education'
    WHEN 'interviews' THEN 'interviews'
    WHEN 'explainers' THEN 'explainers'
    WHEN 'ground-reports' THEN 'ground-reports'
    WHEN 'video-reports' THEN 'video-reports'
    ELSE 'other'
  END
FROM videos
ON CONFLICT DO NOTHING;

INSERT INTO video_labels (video_id, label_id)
SELECT v.id, 'other'
FROM videos v
WHERE NOT EXISTS (
  SELECT 1
  FROM video_labels vl
  JOIN content_labels cl ON cl.id = vl.label_id
  WHERE vl.video_id = v.id AND cl.kind = 'coverage'
)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  byline TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  source_type TEXT NOT NULL DEFAULT 'original' CHECK (source_type IN ('original', 'external')),
  source_name TEXT,
  source_url TEXT,
  cover_drive_id TEXT,
  cover_source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_type = 'original' OR source_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS article_translations (
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'hi')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  cover_alt TEXT,
  PRIMARY KEY (article_id, locale)
);

CREATE TABLE IF NOT EXISTS article_labels (
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES content_labels(id),
  PRIMARY KEY (article_id, label_id)
);

CREATE TABLE IF NOT EXISTS article_videos (
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  display_order SMALLINT NOT NULL CHECK (display_order BETWEEN 1 AND 3),
  PRIMARY KEY (article_id, video_id),
  UNIQUE (article_id, display_order)
);

CREATE INDEX IF NOT EXISTS idx_articles_public ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(status, featured, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_labels_label ON article_labels(label_id, article_id);
CREATE INDEX IF NOT EXISTS idx_video_labels_label ON video_labels(label_id, video_id);

CREATE TABLE IF NOT EXISTS advertisements (
  id UUID PRIMARY KEY,
  client_name TEXT NOT NULL,
  headline_en TEXT,
  headline_hi TEXT,
  body_en TEXT,
  body_hi TEXT,
  creative_drive_id TEXT,
  creative_source_url TEXT,
  creative_alt_en TEXT,
  creative_alt_hi TEXT,
  destination_url TEXT,
  placement TEXT NOT NULL CHECK (placement IN ('home', 'news-listing', 'video-listing', 'article-end')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 1000),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (creative_drive_id IS NOT NULL OR headline_en IS NOT NULL OR headline_hi IS NOT NULL OR body_en IS NOT NULL OR body_hi IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_advertisements_active
  ON advertisements(placement, status, starts_at, ends_at, priority DESC);

CREATE TABLE IF NOT EXISTS visit_daily_counts (
  visit_date DATE NOT NULL,
  landing_path TEXT NOT NULL,
  visits BIGINT NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (visit_date, landing_path)
);

CREATE INDEX IF NOT EXISTS idx_visit_daily_counts_date ON visit_daily_counts(visit_date DESC);
