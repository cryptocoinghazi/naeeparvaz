# Social Video Publisher production setup

This runbook connects the protected Naee Parvaz editor to Buffer and a private Cloudflare R2 bucket. The website and PostgreSQL remain on DigitalOcean, and GoDaddy remains authoritative DNS. No nameserver or website DNS change is required.

Never paste credentials into Git, screenshots, support messages or this document. Enter production secrets only in the DigitalOcean and Cloudflare dashboards.

## Architecture and retention

1. The authenticated editor requests a 15-minute presigned R2 `PUT` URL.
2. The browser uploads the MP4 directly to `staging/`; DigitalOcean does not receive the video body.
3. The website checks R2 metadata and ranged MP4 metadata, then moves a valid object to `active/`.
4. The website signs a stable media path, and Buffer fetches that path from the `workers.dev` Worker.
5. The Worker validates the HMAC path and streams only `GET`, `HEAD` and byte ranges from private R2.
6. After every selected target is confirmed published, the object moves to `retention/` for seven days. Scheduled, failed and uncertain jobs remain in `active/` until resolved.

R2 free-tier allowances are usage limits, not a guarantee against charges. Review current [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) before enabling production publishing. Buffer billing is separate.

## 1. Create the private R2 buckets

In Cloudflare Dashboard:

1. Open **Storage & databases → R2 Object Storage → Create bucket**.
2. Create `naeeparvaz-social-videos-prod` with the Standard storage class and a suitable nearby location hint. Do not enable public access or `r2.dev`.
3. Open the production bucket's **Settings → Object lifecycle rules**.
4. Add a rule for prefix `staging/` that deletes objects after one day.
5. Add a second rule for prefix `retention/` that deletes objects after seven days.
6. Do not add an automatic deletion rule for `active/`; it contains scheduled and unresolved publishing jobs.

These rules follow Cloudflare's [R2 lifecycle documentation](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

## 2. Restrict browser upload CORS

Open the production bucket's **Settings → CORS policy**, choose to add a policy, and use:

```json
[
  {
    "AllowedOrigins": [
      "https://naeeparvaz.com",
      "https://www.naeeparvaz.com",
      "http://127.0.0.1:4321"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

`http://127.0.0.1:4321` is the documented local origin; do not add wildcard origins. If local Astro is deliberately run on a different origin, add that exact origin temporarily and remove it afterward.

## 3. Create limited R2 API credentials

1. In **R2 Object Storage → Overview**, open **Manage R2 API tokens**.
2. Create an account API token named `naee-parvaz-social-publisher`.
3. Grant **Object Read & Write** only to `naeeparvaz-social-videos-prod`. Do not grant account administration or access to unrelated buckets.
4. Copy the **Access Key ID** and **Secret Access Key** once into the encrypted DigitalOcean variables described below.
5. Copy the Cloudflare account ID from the R2 overview.

Use these server-only values:

- `R2_ACCESS_KEY_ID` — encrypted DigitalOcean secret.
- `R2_SECRET_ACCESS_KEY` — encrypted DigitalOcean secret.
- `R2_ACCOUNT_ID` — DigitalOcean runtime value.
- `R2_BUCKET=naeeparvaz-social-videos-prod` — DigitalOcean runtime value.
- `R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` — DigitalOcean runtime value. It may be left blank locally because the application derives it from the account ID.

## 4. Configure and deploy the media Worker

The Worker source is in `media-worker/`. It provides no upload or listing endpoint and accepts only signed `active/<UUID>.mp4` object paths.

Generate one HMAC secret locally:

```bash
openssl rand -hex 32
```

Store the same value in two places:

1. Cloudflare Worker secret `MEDIA_URL_SIGNING_SECRET`.
2. Encrypted DigitalOcean runtime secret `MEDIA_URL_SIGNING_SECRET`.

Do not expose or rotate this value while posts are scheduled: changing it invalidates previously supplied Buffer media URLs.

From a Node 22 terminal at the repository root:

```bash
npx wrangler login
npx wrangler secret put MEDIA_URL_SIGNING_SECRET --config media-worker/wrangler.jsonc
npm run media:deploy
```

Wrangler displays a URL similar to `https://naee-parvaz-social-media.<subdomain>.workers.dev`. Copy the origin without a trailing slash into DigitalOcean as `R2_MEDIA_BASE_URL`. Keep `workers_dev: true`; no custom domain or Naee Parvaz DNS record is needed.

Confirm the Worker binding in **Workers & Pages → naee-parvaz-social-media → Settings → Bindings**:

- variable name: `VIDEO_BUCKET`
- R2 bucket: `naeeparvaz-social-videos-prod`

A random or forged path should return `404`, and `POST` should return `405`. A valid URL is generated only by the protected website after validation. Buffer requires a direct stable media URL as described in its [media hosting requirements](https://developers.buffer.com/guides/hosting-media.html).

## 5. Connect Buffer channels

1. Create or open the official Naee Parvaz Buffer organization.
2. Connect the official Instagram professional account. Its Instagram account must be professional and connected to the correct Facebook Page in Meta.
3. Connect the official Facebook Page; do not select a personal profile.
4. Connect the official YouTube channel and approve the required publishing scopes.
5. Publish one harmless test directly from Buffer to each channel and confirm the account links are correct.
6. In Buffer's developer/API settings, create a production API access token for the Naee Parvaz organization.
7. Save it only as encrypted DigitalOcean secret `BUFFER_API_KEY`.
8. After deployment, sign in at `/editor/publisher/`, click **Discover Buffer channels**, and select exactly one official channel for each platform.

The application stores only Buffer organization/channel IDs and display metadata in PostgreSQL. It never sends the API key to the browser. Revoke the Buffer token immediately if it is ever exposed.

## 6. Add DigitalOcean variables

Open **DigitalOcean → Apps → naee-parvaz → Settings → web → Environment Variables → Edit**. Use runtime scope.

| Key | DigitalOcean type | Value/purpose |
| --- | --- | --- |
| `BUFFER_API_KEY` | Encrypted | Buffer production API token. |
| `R2_ACCESS_KEY_ID` | Encrypted | Limited R2 access key. |
| `R2_SECRET_ACCESS_KEY` | Encrypted | Limited R2 secret. |
| `MEDIA_URL_SIGNING_SECRET` | Encrypted | Exact same HMAC secret configured on the Worker. |
| `R2_ACCOUNT_ID` | General | Cloudflare account ID. |
| `R2_BUCKET` | General | `naeeparvaz-social-videos-prod` |
| `R2_ENDPOINT` | General | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_MEDIA_BASE_URL` | General | Deployed `https://…workers.dev` origin, without trailing slash. |

Save and deploy. `npm start` applies migration `004_social_video_publisher.sql` before starting the application. Do not run destructive schema commands or edit an applied migration.

## 7. Local setup

Copy only non-production/test credentials into the ignored `.env`. Create a separate test bucket and Buffer test organization if exercising real publishing locally. Never point local tests at the production bucket or official channels.

```dotenv
BUFFER_API_KEY=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
MEDIA_URL_SIGNING_SECRET=
R2_ACCOUNT_ID=
R2_BUCKET=naeeparvaz-social-videos-prod
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_MEDIA_BASE_URL=http://127.0.0.1:8787
```

Run the website and Worker in separate Node 22 terminals:

```bash
./start-local.sh
npm run media:dev
```

## 8. Production acceptance checks

- `/editor/publisher/` and every `/api/editor/publisher/*` route redirect unauthenticated users to editor sign-in.
- A valid MP4 uploads directly to R2 and moves from `staging/` to `active/` only after server validation.
- Wrong MIME, over 90 MB, missing AAC, non-H.264, non-9:16, over 1080p, under 5 seconds and over 90 seconds are rejected.
- An expired upload URL, forged asset UUID, mismatched size and completion request from another origin are rejected.
- The private bucket has no public or `r2.dev` access.
- Worker `HEAD`, full `GET` and `Range: bytes=0-1023` return correct MP4 headers for a signed active object.
- Buffer can still fetch a scheduled media URL after a delay.
- Publish-now and scheduled tests succeed independently for Instagram, Facebook and YouTube.
- Partial failure does not resubmit successful targets. An uncertain response is marked **Needs review** and cannot be retried automatically.
- Cancellation is offered only for scheduled Buffer posts; retry is offered only for confirmed failures.
- A successful platform result can create one draft in the existing website video library, but nothing is imported automatically.
- Completed assets move to `retention/`; scheduled, failed and uncertain assets remain in `active/`.
- Existing articles, advertisements, visits, contact email, public videos and editor sign-in continue to work.
- No Buffer, R2 or HMAC secret appears in tracked files or application logs.
