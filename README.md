# Naee Parvaz News

Production-oriented Astro website for **Naee Parvaz News**. It serves English and Hindi pages, a link-based video desk, a real email contact flow and a protected editor for contact details, social identities and video publishing.

The site targets Cloudflare Workers with D1. It does not store video files or contact-form messages.

## Start locally

Node.js 22.12 or newer is required. From this folder, run:

```bash
./start-local.sh
```

The script installs dependencies when needed, applies pending local D1 migrations and starts:

- English site: `http://127.0.0.1:4321/en/`
- Hindi site: `http://127.0.0.1:4321/hi/`
- Local editor: `http://127.0.0.1:4321/editor/`

Stop the server with `Ctrl+C`. The editor bypasses Cloudflare Access only during Astro development on `localhost` or `127.0.0.1`; a production build never permits that bypass.

Manual equivalents:

```bash
npm install
npm run db:migrate:local
npm run dev
```

## Public routes

Each route exists under `/en/` and `/hi/`:

- `/en/` — institutional homepage and newsroom foundation
- `/en/about/` — organizational introduction and editorial approach
- `/en/vision-mission/` — vision, mission and eight objectives
- `/en/videos/` — published video desk
- `/en/contact/` — exact contact details and email form

`/` remembers the visitor's last selected language and otherwise redirects to English. The old unprefixed institutional URLs permanently redirect to their English counterparts.

## Editor and data

The protected `/editor/` interface can:

- update Mohd. Asim Ali's name, English/Hindi role, editorial email and phone;
- update, enable or disable Instagram, YouTube, Facebook and X identities;
- add and edit YouTube, Instagram and Facebook video links;
- maintain English and Hindi video titles/descriptions;
- keep videos as drafts, publish/unpublish them and select one featured published video.

Only validated HTTPS links on approved provider domains are accepted. Public video cards use click-to-load embeds and retain a direct link to the original platform as a fallback. Media remains on the social platform; D1 stores only URLs and editorial metadata.

D1 schema changes live in `migrations/`. Apply them with:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Before using the remote command, create the production database and replace the placeholder `database_id` in `wrangler.jsonc`:

```bash
npx wrangler d1 create naee-parvaz
```

## Production authentication

For the complete beginner-friendly DNS, Resend, Turnstile, Cloudflare Access and Worker-variable procedure, follow [Production services setup](docs/production-services-setup.md). The guide includes the safe GoDaddy-to-Cloudflare DNS order and the final production acceptance checklist.

Create a Cloudflare Access self-hosted application that covers both `/editor/*` and `/api/editor/*`. Permit only the administrator's verified email. Configure the same values in the Worker environment:

- `ADMIN_EMAIL` — defaults to `editor@naeeparvaz.com` but should still be set explicitly;
- `CF_ACCESS_AUD` — the Access application audience tag;
- `CF_ACCESS_TEAM_DOMAIN` — for example `your-team.cloudflareaccess.com`.

The application checks the Access JWT signature, issuer, audience and exact email on every editor request. Cloudflare Access should remain the outer enforcement layer.

For production-bundle testing on a loopback address only, `LOCAL_ADMIN_TOKEN` may be set in `.dev.vars` and sent in the `X-Naee-Local-Admin` request header. It is ignored on non-loopback hostnames, is not used by the browser editor, and must never be configured as a production secret. Normal local `npm run dev` use does not need it.

## Contact email

The contact page posts to `/api/contact/`. The handler validates the fields, checks Cloudflare Turnstile in production and sends the message through Resend directly to the editable editorial email. The visitor's address is set as `reply_to`; the form content is not written to D1.

Copy `.dev.vars.example` to `.dev.vars` for local integration testing and fill in:

- `RESEND_API_KEY`
- `CONTACT_FROM_EMAIL` — a sender on a domain verified in Resend
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- the three Cloudflare Access values above

Never commit `.dev.vars`. For production, store sensitive values with `wrangler secret put`. Resend can be used within its available free allowance, but account limits and domain verification are controlled by Resend and may change.

If the purchased `editor@naeeparvaz.com` mailbox is read through Gmail, that routing is configured with the email provider—not in this code. The obsolete `naeeparvaznews@gmail.com` address is never rendered or used for delivery.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Playwright uses the built Cloudflare preview and covers canonical metadata, English/Hindi routes, redirects, internal links, JSON-LD, the exact contact values, Gmail-address absence, sitemap/robots output, provider URL safety, production admin denial, WCAG A/AA checks, mobile-menu keyboard behavior and horizontal overflow. It also captures all public routes at 1440, 1280, 768, 390 and 320 pixels.

## Branding and legacy reference

- `src/assets/naee-parvaz-primary-banner.png` is the approved main banner processed by Astro.
- `public/assets/naee-parvaz-footer-logo.png` is the latest transparent-background footer logo.
- `public/assets/naee-parvaz-masthead.png` is the publisher logo/favicon and is not artificially enlarged in page content.
- `reference/legacy-mock/` preserves the former mock and old supplied assets because this directory has no Git history. Astro excludes that folder from deployment.

## Deployment boundary

`npm run build` creates the Cloudflare bundle in `dist/`. Production deployment, DNS changes, Access policy creation, D1 creation, Turnstile setup, Resend/domain verification and email routing require separate review and are not performed automatically.
