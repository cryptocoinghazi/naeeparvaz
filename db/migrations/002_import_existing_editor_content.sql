INSERT INTO social_links (platform, identity, url, enabled, display_order) VALUES
  (
    'instagram',
    'naeeparvaznewsofficial',
    'https://www.instagram.com/naeeparvaznewsofficial?utm_source=qr&igsh=MWp4OW5mbGswem56Ng==&igsi=MWp4OW5mbGswem56Ng==',
    TRUE,
    1
  ),
  (
    'youtube',
    '@NaeeParvazNews',
    'https://youtube.com/@naeeparvaznews?si=AaIOJSF0wTJ9aqmJ',
    TRUE,
    2
  ),
  (
    'facebook',
    'Naee Parvaz News',
    'https://www.facebook.com/share/1Eg78TJzBm/',
    TRUE,
    3
  )
ON CONFLICT (platform) DO UPDATE SET
  identity = excluded.identity,
  url = excluded.url,
  enabled = excluded.enabled,
  display_order = excluded.display_order,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO videos (
  id,
  source_url,
  canonical_url,
  provider,
  provider_id,
  published_at,
  category,
  featured,
  status,
  created_at,
  updated_at
) VALUES
  (
    'ecb45be6-10eb-451e-b39e-0d367440fd3e',
    'https://youtu.be/C-SyGbe0zpg?si=jn44KPUAifqoLzoc',
    'https://www.youtube.com/watch?v=C-SyGbe0zpg',
    'youtube',
    'C-SyGbe0zpg',
    '2026-08-18T00:00:00+05:30',
    'maharashtra',
    FALSE,
    'published',
    '2026-08-18T12:29:39Z',
    '2026-08-18T12:36:25Z'
  ),
  (
    '9b0bbbaf-456d-46c7-a9fb-56f7887128c1',
    'https://youtu.be/g47XCeGtmz4?si=qGr2urzdaoC2dHDH',
    'https://www.youtube.com/watch?v=g47XCeGtmz4',
    'youtube',
    'g47XCeGtmz4',
    '2026-08-17T00:00:00+05:30',
    'maharashtra',
    TRUE,
    'published',
    '2026-08-18T12:36:25Z',
    '2026-08-18T12:36:25Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO video_translations (video_id, locale, title, description) VALUES
  (
    '9b0bbbaf-456d-46c7-a9fb-56f7887128c1',
    'hi',
    'नागपुर- NEP 2020 के तहत नई शैक्षणिक संरचना एवं पाठ्यक्रम पर नागपुर में एक दिवसीय कार्यशाला',
    NULL
  ),
  (
    'ecb45be6-10eb-451e-b39e-0d367440fd3e',
    'hi',
    'यवतमाल l संजीवनी निवासी मतिमंद शाला में कथित अनियमितताओं की शिकायत; विशेष जांच और कार्रवाई की मांग',
    NULL
  )
ON CONFLICT (video_id, locale) DO NOTHING;
