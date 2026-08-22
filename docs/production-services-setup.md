# Naee Parvaz production services setup

This guide explains how to obtain, store and verify every external-service value used by the Naee Parvaz website. It is written for the production site at `https://naeeparvaz.com` and the administrator `editor@naeeparvaz.com`.

Complete the sections in order. Do not paste real API keys, secret keys or local tokens into chat, screenshots, source files, `wrangler.jsonc` or Git.

## 0. Revoke the exposed Resend key first

The Resend API key visible in the earlier screenshot must be considered compromised, even if the screenshot was shared privately.

1. Sign in to [Resend](https://resend.com/api-keys).
2. Open **API Keys**.
3. Find the key shown in the screenshot.
4. Open its menu and select **Remove** or **Delete**.
5. Do not create the replacement until `send.naeeparvaz.com` has been verified in section 3. The new key will then be restricted to that sending domain.

Never reuse the exposed key or put it in `.dev.vars`.

## 1. Understand the required values

| Name | Production storage | Secret? | Used by this website |
| --- | --- | --- | --- |
| `ADMIN_EMAIL` | Worker variable | No | Allows only the exact authenticated email `editor@naeeparvaz.com` into the editor. |
| `CF_ACCESS_AUD` | Worker variable | No | Confirms that an Access JWT was issued for the Naee Parvaz editor application. |
| `CF_ACCESS_TEAM_DOMAIN` | Worker variable | No | Supplies the Access JWT issuer and the hostname used to download Cloudflare signing keys. |
| `CONTACT_FROM_EMAIL` | Worker variable | No | Sets the Resend sender to `website@send.naeeparvaz.com`. It is not the destination inbox. |
| `TURNSTILE_SITE_KEY` | Worker variable | Public | Renders the Cloudflare Turnstile widget on the English and Hindi contact forms. |
| `RESEND_API_KEY` | Worker secret | Yes | Authorizes the server-side request to the Resend email API. |
| `TURNSTILE_SECRET_KEY` | Worker secret | Yes | Verifies contact-form Turnstile tokens through Cloudflare Siteverify. |
| `LOCAL_ADMIN_TOKEN` | `.dev.vars` only | Yes | Allows header-authenticated production-preview requests on loopback only. It is never a production or browser password. |

The contact-form destination comes from the editable site settings in D1. Its initial value is `editor@naeeparvaz.com`. The visitor's email is sent to Resend as `reply_to`, so replying to a delivered enquiry addresses the visitor.

## 2. Move DNS hosting from GoDaddy to Cloudflare safely

The domain remains registered and paid for at GoDaddy. Only authoritative DNS hosting moves to Cloudflare. At the time this guide was prepared, the domain used GoDaddy nameservers and Google Workspace mail records.

### 2.1 Record the existing DNS configuration

1. Sign in to GoDaddy.
2. Open **My Products → Domains → naeeparvaz.com → DNS**.
3. Export the DNS zone if GoDaddy offers an export option.
4. Also take screenshots of every DNS record so values can be checked manually.
5. Record the current GoDaddy nameservers separately.

The Cloudflare copy must include all existing records, especially:

- all five Google Workspace MX records;
- the `google._domainkey` DKIM TXT record;
- the `_dmarc` TXT record;
- the Google site-verification TXT record;
- the apex website A records;
- the `www` record; and
- any other validation, mail, calendar or service records visible in GoDaddy.

Do not replace Google Workspace MX records with Resend MX records. Resend will use the isolated `send.naeeparvaz.com` subdomain, leaving mail reception for `editor@naeeparvaz.com` with Google Workspace.

### 2.2 Add the domain to Cloudflare

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Select **Add a domain** or **Onboard a domain**.
3. Enter `naeeparvaz.com`.
4. Choose the Free plan unless a paid Cloudflare feature is deliberately required later.
5. Allow Cloudflare to scan existing DNS records.
6. Compare the scan line-by-line with the GoDaddy export and screenshots.
7. Manually add anything the scan missed before changing nameservers.
8. Keep mail-related records **DNS only**. MX and TXT records are not proxied.
9. While the GoDaddy-built site is still live, keep its apex website records exactly as they are. They will be replaced only when the Worker custom domain is attached later.

Cloudflare explicitly recommends reviewing imported records before changing nameservers, particularly email records. See [Cloudflare's full DNS setup guide](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/) and [DNS quick-scan limitations](https://developers.cloudflare.com/dns/zone-setups/reference/dns-quick-scan/).

### 2.3 Change nameservers at GoDaddy

1. In the Cloudflare zone Overview, copy the two nameservers assigned to `naeeparvaz.com`.
2. In GoDaddy, open the domain's **Nameservers** setting.
3. Choose **Change nameservers** and enter only the two Cloudflare nameservers.
4. Save the change. Do not transfer the domain registration.
5. Wait until Cloudflare reports the zone as **Active**. DNS propagation may not be instant.

### 2.4 Verify the cutover before changing the website

1. Open both `https://naeeparvaz.com` and `https://www.naeeparvaz.com` and confirm the existing site still loads.
2. Send a message from `editor@naeeparvaz.com` to another mailbox.
3. Reply from that mailbox and confirm the reply reaches `editor@naeeparvaz.com`.
4. In Google Admin, confirm Gmail reports no domain or MX warning.
5. If email fails, restore any missing Google record in Cloudflare before continuing.

Do not proceed to the Worker custom-domain cutover until the existing site and Google Workspace email both work through Cloudflare DNS.

## 3. Verify the Resend sending subdomain

Resend should send website enquiries from an isolated subdomain so it does not interfere with Google Workspace mail at the root domain.

1. Sign in to [Resend](https://resend.com/domains).
2. Open **Domains** and select **Add Domain**.
3. Enter exactly `send.naeeparvaz.com`.
4. Choose a suitable sending region if Resend asks for one.
5. Resend will display SPF, DKIM and return-path records. Keep that page open.
6. In Cloudflare, open **naeeparvaz.com → DNS → Records → Add record**.
7. Add every record using the exact type, name, content and priority shown by Resend.
8. Any A, AAAA or CNAME verification record must be **DNS only**, not proxied.
9. Do not copy example values from a tutorial. The records shown inside your Resend account are authoritative for this domain.
10. Return to Resend and select **Verify DNS Records**.
11. Wait until the domain status is **Verified**.

Resend recommends using a subdomain for reputation isolation. See [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).

### 3.1 Create the replacement API key

1. In Resend, open **API Keys → Create API Key**.
2. Name it `naee-parvaz-contact-production`.
3. Select **Sending access**, not Full access.
4. Restrict it to `send.naeeparvaz.com`.
5. Create the key and copy it once into a password manager.
6. Do not show it in a screenshot and do not paste it into this document.

This value becomes `RESEND_API_KEY`. Resend only displays the value once. See [Resend API-key permissions](https://resend.com/docs/dashboard/api-keys/introduction).

`CONTACT_FROM_EMAIL` is not generated by Resend. Use this selected sender identity:

```text
website@send.naeeparvaz.com
```

Once a Resend domain is verified, Resend permits sending from addresses at that domain without separately creating a mailbox. The website sends mail **from** this address **to** the editorial address stored in D1.

## 4. Create the production Turnstile widget

1. In the Cloudflare dashboard, open **Turnstile**.
2. Select **Add widget**.
3. Set the widget name to `Naee Parvaz Contact Form`.
4. Add the production hostname `naeeparvaz.com`.
5. Select **Managed** mode.
6. Create the widget.
7. Copy the **site key**. This becomes `TURNSTILE_SITE_KEY`.
8. Copy the **secret key** into a password manager. This becomes `TURNSTILE_SECRET_KEY`.

The site key is intentionally public: the contact page places it in the widget's `data-sitekey`. The secret key is server-only: `/api/contact/` sends it to Cloudflare's Siteverify endpoint and checks the `contact` action before delivering email.

Do not add `localhost` or `127.0.0.1` to the production widget. Cloudflare recommends separate test credentials for local and automated testing. See [Turnstile setup](https://developers.cloudflare.com/turnstile/get-started/) and [hostname management](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/).

### Official local Turnstile test pair

The values below are published dummy credentials, not private production credentials. They always pass when used together and work on localhost:

```dotenv
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Never use this test pair in production. Cloudflare documents it at [Test your Turnstile implementation](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## 5. Set up Cloudflare Zero Trust and email OTP

### 5.1 Obtain `CF_ACCESS_TEAM_DOMAIN`

1. In the Cloudflare dashboard, select **Zero Trust**.
2. If prompted, create a Zero Trust organization.
3. Use `naeeparvaz` as the team name if it is available. If it is unavailable, choose a short recognizable alternative and record it.
4. Open **Zero Trust → Settings** and locate the team domain.
5. Copy only the hostname, for example:

```text
naeeparvaz.cloudflareaccess.com
```

Do not include `https://` or a trailing slash in `CF_ACCESS_TEAM_DOMAIN`. The application uses this hostname to validate the JWT issuer and download Cloudflare's rotating public signing keys. See [Cloudflare team domains](https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/).

### 5.2 Enable one-time PIN login

1. Open **Zero Trust → Integrations → Identity providers**.
2. Under **Your identity providers**, select **Add new identity provider**.
3. Select **One-time PIN**.
4. Save it.

Cloudflare sends a single-use code only when the requested email is allowed by the Access policy. Codes expire after ten minutes. See [Cloudflare one-time PIN login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

### 5.3 Create the protected editor application

1. Open **Zero Trust → Access controls → Applications**.
2. Select **Create new application**.
3. Choose **Self-hosted and private**.
4. Name it `Naee Parvaz Website Editor`.
5. Add these four public-hostname entries to the same application. In the dashboard's Path field, enter the value without an initial slash if the UI already displays one:

| Domain | Path | Protects |
| --- | --- | --- |
| `naeeparvaz.com` | `editor*` | `/editor`, `/editor/` and editor pages |
| `naeeparvaz.com` | `api/editor*` | all editor write APIs |
| `www.naeeparvaz.com` | `editor*` | the same editor paths on `www` |
| `www.naeeparvaz.com` | `api/editor*` | the same editor APIs on `www` |

6. Create a policy named `Allow Naee Parvaz Editor`.
7. Set the action to **Allow**.
8. Under **Include**, choose the exact **Emails** selector and enter only `editor@naeeparvaz.com`.
9. Do not use **Everyone**, **Emails ending in**, or **Login Methods → One-time PIN** as the sole Include rule; those would authorize more people than intended.
10. Enable only the One-time PIN identity provider for this application.
11. Set **Session Duration** to eight hours.
12. Create the application.

Cloudflare supports wildcard application paths, and every Access application is deny-by-default unless an Allow policy matches. See [self-hosted application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) and [Access policy safety](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).

### 5.4 Obtain `CF_ACCESS_AUD`

1. Return to **Zero Trust → Access controls → Applications**.
2. Select **Configure** for `Naee Parvaz Website Editor`.
3. Open **Additional settings**.
4. Copy the **Application Audience (AUD) Tag** exactly.
5. Store it as `CF_ACCESS_AUD`.

The AUD tag is not a password, but it must match the `aud` claim in the Access JWT. It remains stable unless the Access application is deleted and recreated. See [Cloudflare JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## 6. Prepare local development values

The tracked `.dev.vars.example` contains safe defaults and blank placeholders. Create the ignored local file from the project directory:

```bash
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars`. Never commit it.

For normal browser development with `./start-local.sh`, Cloudflare Access values and `LOCAL_ADMIN_TOKEN` are not required. The editor is automatically allowed only on `localhost` and `127.0.0.1` while Astro is in development mode.

### Generate `LOCAL_ADMIN_TOKEN` only when needed

`LOCAL_ADMIN_TOKEN` is for testing the production bundle on a loopback address with a custom request header. It is not the browser editor login and must not be configured in production.

1. Run:

```bash
openssl rand -hex 32
```

2. Copy the 64-character result into `.dev.vars` as `LOCAL_ADMIN_TOKEN`.
3. Send it only in the loopback-only header:

```text
X-Naee-Local-Admin: <your-generated-token>
```

Do not place the generated value in shell history examples, documentation or screenshots.

## 7. Deploy the Worker and connect the production domains

Deployment changes live traffic. Review the deployment separately before running these commands.

1. Authenticate Wrangler:

```bash
npx wrangler login
```

2. Create the production D1 database if it has not been created:

```bash
npx wrangler d1 create naee-parvaz
```

3. Copy the returned database ID into the `database_id` field in `wrangler.jsonc`.
4. Apply the remote migrations:

```bash
npm run db:migrate:remote
```

5. Build and deploy the Worker initially to its Cloudflare preview/Workers hostname:

```bash
npm run build
npx wrangler deploy
```

6. Configure the production variables and secrets in section 8.
7. Test the Worker hostname before replacing the old website.
8. In **Workers & Pages → naee-parvaz-news → Settings → Domains & Routes**, select **Add → Custom Domain**.
9. Add `naeeparvaz.com`.
10. To preserve `www`, remove its old GoDaddy CNAME only after the apex Worker is healthy, then add `www.naeeparvaz.com` as a second Worker custom domain.
11. Confirm Cloudflare has issued certificates for both hostnames.

Cloudflare Custom Domains create the required DNS records and certificates for a Worker. See [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## 8. Store production variables and secrets

The Worker must exist before using its dashboard settings.

### 8.1 Add non-secret variables

1. In Cloudflare, open **Workers & Pages → naee-parvaz-news → Settings → Variables and Secrets**.
2. Select **Add**.
3. Choose **Text** or **Variable**, not Secret.
4. Add these exact names and values:

```dotenv
ADMIN_EMAIL=editor@naeeparvaz.com
CF_ACCESS_AUD=<the-Application-Audience-tag>
CF_ACCESS_TEAM_DOMAIN=<your-team-name>.cloudflareaccess.com
CONTACT_FROM_EMAIL=website@send.naeeparvaz.com
TURNSTILE_SITE_KEY=<the-production-site-key>
```

5. Review every value for spaces, accidental quotes, `https://` or trailing slashes.
6. Select **Deploy** to apply the variables.

This project sets `keep_vars: true` in `wrangler.jsonc`, so later Wrangler deployments preserve variables managed through the dashboard. Cloudflare otherwise treats Wrangler configuration as the deployment source of truth. See [Workers environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/).

### 8.2 Add secrets

In the same **Variables and Secrets** screen:

1. Select **Add**.
2. Choose **Secret**.
3. Add `RESEND_API_KEY` using the replacement sending-only key.
4. Add `TURNSTILE_SECRET_KEY` using the production Turnstile secret.
5. Select **Deploy**.

Secret values become unreadable after saving. That is expected.

Equivalent Wrangler commands are interactive and do not place values in command history:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Paste each requested value only at Wrangler's hidden prompt. Do not set `LOCAL_ADMIN_TOKEN` on Cloudflare. See [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## 9. Production acceptance checklist

### DNS and email continuity

- [ ] Cloudflare reports `naeeparvaz.com` as Active.
- [ ] The Cloudflare DNS zone contains every former GoDaddy record required by Google Workspace.
- [ ] `editor@naeeparvaz.com` can send and receive mail.
- [ ] Resend reports `send.naeeparvaz.com` as Verified.
- [ ] The API key shown in the screenshot has been deleted.

### Contact form

- [ ] The English and Hindi contact pages show the production Turnstile widget.
- [ ] A valid submission reaches `editor@naeeparvaz.com`.
- [ ] The delivered message is from `website@send.naeeparvaz.com`.
- [ ] Replying addresses the visitor who submitted the form.
- [ ] Missing, invalid or expired Turnstile tokens do not send mail.
- [ ] Resend Logs show the successful request and no authentication/domain error.

### Editor protection

- [ ] Opening `https://naeeparvaz.com/editor/` in a private window shows Cloudflare Access login.
- [ ] `editor@naeeparvaz.com` receives a one-time PIN and can enter the editor.
- [ ] Another email address receives no usable PIN and cannot enter.
- [ ] A direct request to `/api/editor/settings/` without Access authentication is blocked.
- [ ] The editor page and editor API responses include `X-Robots-Tag: noindex, nofollow`.

### Repository safety

- [ ] `.dev.vars` remains ignored.
- [ ] No production Resend key, Turnstile secret or local token appears in tracked files.
- [ ] `LOCAL_ADMIN_TOKEN` is absent from Cloudflare production variables and secrets.
- [ ] The following checks pass before deployment:

```bash
npm run lint
npm run typecheck
npm run build
```

Run a repository secret-pattern review without printing secret values:

```bash
rg -l 're_[A-Za-z0-9_]{20,}|LOCAL_ADMIN_TOKEN=.+|TURNSTILE_SECRET_KEY=.+' --glob '!node_modules/**' --glob '!dist/**' --glob '!.dev.vars'
```

Expected matches are documentation/example files containing placeholders or Cloudflare's published dummy key. Investigate any unexpected file; do not paste a discovered value into an issue or chat.

## 10. Troubleshooting

- **The contact form shows a configuration notice:** `TURNSTILE_SITE_KEY` is missing from the Worker environment.
- **The form redirects with an error:** check Turnstile hostname configuration, `TURNSTILE_SECRET_KEY`, Resend domain status and Resend Logs.
- **Resend returns 403:** confirm the sender domain is Verified, `CONTACT_FROM_EMAIL` ends in `@send.naeeparvaz.com`, and the API key is permitted for that domain.
- **The editor returns “Admin authentication is not configured”:** confirm both `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` exist on the Worker.
- **The editor returns “Cloudflare Access authentication is required”:** confirm the Access application covers the exact hostname and both `editor*` and `api/editor*` paths.
- **The OTP email does not arrive:** verify the Allow policy uses the exact email address. Cloudflare intentionally does not send a code to an address that is not allowed.
- **Google Workspace stops receiving mail:** compare Cloudflare MX, DKIM and DMARC records against the GoDaddy export immediately. Do not add Resend receiving MX records at the root domain.
