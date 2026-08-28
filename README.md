# Naee Parvaz News

Production-oriented Astro website for **Naee Parvaz News**. It serves English and Hindi news and institutional pages, a link-based video desk, a real email contact flow and a protected publishing editor.

The production architecture is an Astro Node service on DigitalOcean App Platform with PostgreSQL. GoDaddy remains the domain registrar and DNS provider. The application does not use Cloudflare Workers, D1, Access, DNS or the `cloudflared` tunnel program. Cloudflare Turnstile remains an independent anti-spam widget.

## Start locally

Prerequisites:

- Node.js 22.12.0 or a newer Node 22 release;
- Docker with Docker Compose; and
- npm 10.8.2 or newer.

Run:

```bash
./start-local.sh
```

On the first run, the script:

1. creates an ignored `.env` with a random local editor code and session secret;
2. starts PostgreSQL through `compose.yaml`;
3. applies pending database migrations; and
4. starts the Astro development server.

It prints the local one-time editor code and these addresses:

- English site: `http://127.0.0.1:4321/en/`
- Hindi site: `http://127.0.0.1:4321/hi/`
- Editor sign-in: `http://127.0.0.1:4321/editor/`

Stop the website with `Ctrl+C`. PostgreSQL remains available for the next run. Stop it separately with `docker compose down`; add `--volumes` only if you deliberately want to erase all local editor data.

Manual equivalents:

```bash
npm install
npm run local:credentials
docker compose up -d database
npm run db:migrate
npm run dev
```

## Public routes

Each route exists under `/en/` and `/hi/`:

- `/en/` — institutional homepage and newsroom foundation
- `/en/about/` — organizational introduction and editorial approach
- `/en/vision-mission/` — vision, mission and eight objectives
- `/en/videos/` — filterable and paginated video library
- `/en/news/` — filterable and paginated article library
- `/en/news/[slug]/` — bilingual article with related published videos
- `/en/disclaimer/` — source, embedded-video and advertising responsibility notice
- `/en/contact/` — exact contact details and email form

`/` remembers the visitor's last selected language and otherwise redirects to English. The old unprefixed institutional URLs permanently redirect to their English counterparts.

## Editor and data

The protected `/editor/` interface can:

- update Mohd. Asim Ali's name, English/Hindi role, editorial email and phone;
- update, enable or disable Instagram, YouTube, Facebook and X identities;
- add and edit YouTube, Instagram and Facebook video links;
- assign one coverage label and multiple topic labels, including Podcast;
- create, preview, publish and unpublish bilingual news articles;
- connect up to three published library videos to an article;
- add public Google Drive covers, video thumbnails and advertising creatives;
- create, schedule, prioritize, publish and unpublish direct-client advertisements;
- review aggregate visit totals and landing-page counts;
- maintain English and Hindi video titles/descriptions; and
- keep videos as drafts, publish/unpublish them and select one featured published video.

Production sign-in uses a short-lived one-time code sent only to `editor@naeeparvaz.com` through Resend. Challenges are hashed, limited to five attempts, expire after ten minutes and are rate-limited per DigitalOcean client IP. Successful sign-in creates a random, hashed PostgreSQL session lasting eight hours. The browser receives only an HttpOnly, Secure, SameSite=Strict cookie.

PostgreSQL stores settings, social links, article/video metadata, labels, relationships, advertisement schedules, aggregate visit counts, temporary login challenges and sessions. It does not store media files, raw visitor IP addresses or individual visitor profiles. Video files remain on the social platforms, public editorial images remain in Google Drive, and contact messages are sent directly through Resend rather than stored.

Database schema changes live in `db/migrations/`. `npm start` applies pending migrations before starting the production server. Run them locally with:

```bash
npm run db:migrate
```

The second migration preserves the two published videos and verified social URLs already entered in the former local D1 editor. The third migration adds publishing data without deleting those records and maps older video categories into the fixed label taxonomy. The ignored `.wrangler` state is not deleted.

See [Publishing and advertising guide](docs/publishing-and-advertising.md) for editor workflows, safe Markdown, Google Drive sharing, label behavior, advertising schedules and the visit metric.

## DigitalOcean deployment

Follow [DigitalOcean production deployment](docs/digitalocean-deployment.md). It covers:

- connecting this GitHub repository to App Platform;
- the paid App Platform and PostgreSQL components declared in `.do/app.yaml`;
- every environment variable and secret;
- Resend and Turnstile setup;
- preserving Google Workspace records at GoDaddy;
- pointing only the website DNS records to DigitalOcean; and
- testing contact delivery and editor OTP authentication before the DNS cutover.

The main production values are:

| Name | Storage | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | DigitalOcean bindable secret | Private PostgreSQL connection used by the site and migration runner. |
| `ADMIN_EMAIL` | General runtime value | Exact address permitted to receive editor codes. |
| `SESSION_SECRET` | Encrypted runtime secret | HMAC key for OTP and rate-limit identifiers. |
| `RESEND_API_KEY` | Encrypted runtime secret | Sends contact messages and editor codes. |
| `CONTACT_FROM_EMAIL` | General runtime value | Resend sender identity. |
| `TURNSTILE_SITE_KEY` | General runtime value | Public contact/login widget key. |
| `TURNSTILE_SECRET_KEY` | Encrypted runtime secret | Server-side Turnstile verification key. |
| `LOCAL_ADMIN_CODE` | Local `.env` only | Local browser sign-in code; never configure in production. |

No real credential belongs in this repository. DigitalOcean supplies `DATABASE_URL` from the PostgreSQL component, and encrypted variables are entered only in the App Platform dashboard.

## Contact email

The contact page posts to `/api/contact/`. The handler validates fields, verifies Turnstile in production and sends through Resend to the editable editorial email. The visitor address is set as `reply_to`.

If `editor@naeeparvaz.com` is read through Gmail/Google Workspace, that mailbox routing stays in GoDaddy DNS. Do not replace its MX records when adding Resend's separate `send.naeeparvaz.com` records.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

The full Playwright suite covers the original routes and viewport matrix. For publishing changes, `tests/publishing.spec.ts` provides focused desktop/mobile checks for news, disclaimers, safe Markdown, Drive URL parsing, label pagination, sitemap output, accessibility and horizontal overflow.

## Branding and legacy reference

- `src/assets/naee-parvaz-primary-banner.png` is the approved main banner processed by Astro.
- `public/assets/naee-parvaz-footer-logo.png` is the latest transparent-background footer logo.
- `public/assets/naee-parvaz-masthead.png` is the publisher logo/favicon.
- `reference/legacy-mock/` preserves the former mock and old supplied assets. Astro excludes that folder from deployment.

## Deployment boundary

The repository is configured for DigitalOcean, but creating paid resources, entering secrets and changing GoDaddy DNS remain deliberate dashboard steps. Pushing code does not automatically change DNS or deploy an app until App Platform has been connected to the repository.
