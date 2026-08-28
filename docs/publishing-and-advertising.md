# Publishing and advertising guide

This guide covers the new editor features. Production data is not changed until the reviewed code is deployed and the application startup applies migration `003_publishing_analytics_ads.sql`.

## Open the publishing editor

1. Sign in at `/editor/` with `editor@naeeparvaz.com` and the emailed one-time code.
2. Use **Articles**, **Advertisements**, **Analytics**, or **Settings & videos** in the protected header.
3. Draft records never appear on the public website. Publish only after preview and editorial review.

## Publish an article

1. Open **Articles → Create article**.
2. Set a lowercase stable slug such as `nagpur-public-meeting`. The slug cannot change after creation, protecting links and search indexing.
3. Choose exactly one coverage label: Local Area, State, Country or Other.
4. Add any useful topic labels. Podcast is a label only; it does not upload or host audio.
5. Complete the English article, Hindi article, or both. If a translation is absent, the available language appears transparently on both localized routes.
6. Write the body with safe Markdown. Supported formatting includes level 2–4 headings, paragraphs, blockquotes, ordered/unordered lists, bold, italics, inline code, root-relative links and HTTPS links. Raw HTML is escaped.
7. For externally sourced reporting, select **External source** and provide the exact publisher name and HTTPS source URL.
8. Optionally attach up to three videos. Only published videos can be newly attached. If an attached video is later unpublished, its relationship remains stored but it is hidden publicly until republished.
9. Save as Draft, use **Preview**, and publish when ready.

Published articles appear at `/en/news/` and `/hi/news/`. Their detail pages include canonical/Open Graph metadata and `NewsArticle` structured data. The runtime `/sitemap.xml` includes published slugs without a rebuild.

## Use a Google Drive image

Google Drive is accepted only for public JPEG, PNG or WebP images up to 5 MB.

1. Upload the image file to Google Drive. Do not use a folder, Google Doc or Drive web page.
2. Open **Share** and set **General access → Anyone with the link → Viewer**.
3. Copy the file-sharing link and paste it into the article cover, video thumbnail or advertisement image field.
4. Save the record. The server checks the host, extracts the file ID, downloads at most 5 MB and rejects non-image or inaccessible content.

Only the validated file ID is used by the public same-origin `/media/drive/[id]/` stream. The application never writes the image to local disk or PostgreSQL. If Drive later removes access or throttles the file, the proxy returns a branded placeholder. YouTube keeps its automatic thumbnail unless a Drive thumbnail override is supplied.

Public Drive assets are not confidential. Google may expose normal file and ownership information to viewers, and availability remains dependent on Google Drive.

## Label and filter videos

The video editor now uses visible label chips instead of a category dropdown. Choose exactly one coverage label and optional topic labels. Existing `local`, `maharashtra` and `india` records are migrated to Local Area, State and Country; topic-only older records receive Other as coverage.

Public video filters combine in shareable URLs, for example:

```text
/en/videos/?platform=facebook&label=local-area&page=2
```

News uses the same labels with `?label=…&page=…`.

## Schedule an advertisement

1. Open **Advertisements** and enter the client name.
2. Choose Homepage, News listing, Video listing or Article end.
3. Set start/end times in India time, priority and Draft/Published status.
4. Provide a public Drive image, bilingual text creative, or both. A Drive image requires useful alternative text in at least one language.
5. Add an optional HTTPS destination URL.

Every public placement is labeled **Advertisement / विज्ञापन**, links open with `rel="sponsored noopener"`, and the responsibility notice states that advertiser claims are not editorial endorsement. HTML, JavaScript, iframes and tracking pixels are never accepted. Expired ads stop automatically. If several active ads share the highest priority in one placement, the displayed client rotates deterministically every ten minutes. No container renders when no campaign is eligible.

## Understand website visits

The footer shows all-time **Website visits**. The Analytics editor shows today, 7-day, 30-day and all-time totals plus aggregate landing pages.

A visit means the first public HTML request in one 30-minute browser session. Editor/API/static requests and recognized crawlers are excluded. This is not an identified person or a guaranteed unique visitor. The visit tables store only date, landing path and aggregate count—never names, emails, raw IP addresses or persistent fingerprints.

## Source responsibility

The bilingual disclaimer is linked in every footer. External articles and the video library also show concise source notices. Third-party material remains attributable to its named publisher; Naee Parvaz remains responsible for its own headlines, summaries, reporting, context and editorial presentation.
