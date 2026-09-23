# Ad slideshows, TV and reporter registration

The existing production start command runs forward migrations; review pending migrations before deploying. Migration 006 adds maintenance scheduling state without changing application data or retention settings. Do not invoke migration commands with a production DATABASE_URL during local testing.

## Local review

Use Node 22. Install with `npm ci --include=optional` (Sharp requires its native optional dependency). The deployment image must include a font supported by Pango/fontconfig, initially **DejaVu Sans Bold**; Hindi card names also require a Devanagari font. Check a real preview in the intended deployment environment before issuance.

```
npm run db:migrate
npm run dev
npm run lint
npm run typecheck
npm run build
npm run test:enhancements
ENHANCEMENT_DB_TEST=1 npm run test:enhancements:db
npm run test:enhancements:browser
node --env-file=.env tests/enhancements/startup.mjs
node --import tsx scripts/preview-reporter-card.ts
```

Run migrations only after confirming `.env` points to the local compose database. Existing articles, videos and credentials are untouched. The unrelated `public/images/ads` artwork is not part of this implementation.

The database/browser/startup tests refuse non-local or non-development database credentials, create their own randomly named schemas, and remove only those schemas on completion. Storage/email/YouTube are mocked, blocked or disabled. The startup test checks the real production entry point, migration and automatic scheduler heartbeat without visitor traffic. The browser checks use only 1440px and 390px on changed pages, and generate screenshots under `test-results/enhancements/`. The card-preview command uses a blank placeholder portrait and issues no actual ID.

## Advertisement desk

Every existing ad space shares the same eligible pool. Priority sorts ads without excluding lower priorities. Slides advance after eight seconds unless paused, hovered, focused or reduced motion is enabled. A visible page refreshes eligibility every minute and checks local expiry twice per second. Disable/delete changes reach already open pages on the next refresh. Deleted campaigns can be restored as drafts.

No-expiry, explicit India-time end date and duration in whole days are supported. Existing placement values remain for reference only. No ad space is added to unrelated pages.

## YouTube TV

1. Enable **YouTube Data API v3** in a Google Cloud project and create a server API key, restricted to that API.
2. Configure `YOUTUBE_API_KEY` server-side. Never expose it in browser code.
3. Open `/editor/tv/`, confirm the channel handle/URL and save.
4. Synchronize until the editor reports completion. Test before enabling the section.
5. Schedule `npm run tv:sync` hourly using the same environment as the app. No scheduler is created automatically by this change.

The command paginates and checkpoints, under a PostgreSQL advisory lock. A complete generation replaces the public cache atomically. Failed/interrupted synchronization retains the last complete generation and resumes on a later run. Changing channels resets the synchronization cursor. Only public, embeddable recorded videos are included; currently live/upcoming videos are excluded until recorded. The queue is separate from website-library entries and social-publisher records.

Playback uses the official YouTube player. Browser policy may require a click. YouTube ads, restrictions, availability and buffering are not bypassed, and gapless playback is not promised.

## Reporter storage and setup

Create a **new private R2 bucket**, with no public URL or Worker binding. Do not reuse the social-video bucket. Restrict a new R2 credential to this new bucket. The application server handles bounded 5 MB uploads; browser CORS is not needed for this bucket.

Set:

```
REPORTER_R2_BUCKET=<private bucket>
REPORTER_R2_ACCESS_KEY_ID=<bucket-scoped credential>
REPORTER_R2_SECRET_ACCESS_KEY=<bucket-scoped secret>
REPORTER_SITE_ORIGIN=https://naeeparvaz.com
```

The existing R2_ACCOUNT_ID/R2_ENDPOINT identify the Cloudflare account, but the reporter bucket and credentials are independent. Existing SESSION_SECRET, RESEND_API_KEY, CONTACT_FROM_EMAIL and Turnstile configuration are reused. For local emailed correction links only, set REPORTER_SITE_ORIGIN to the exact local origin.

Keep `assets/reporters/` in the deployment working directory. The supplied payment QR and original ID artwork are stored there byte-for-byte. They are not served as arbitrary public files. The QR has a dedicated public endpoint; private evidence and cards require editor authentication. Payment recipient information printed on the QR is not automatically verified—scan/check it before opening registration.

At `/editor/reporters/settings/`:

- Set fee, bilingual payment instructions/refund terms and retention periods.
- Check all physical cards already issued and configure the next unused NPN number. It cannot be decreased.
- Save a template version. The original flattened JPEG is the default; its personal-detail regions are covered by editable overlays. Coordinates, font and colours are editable in the JSON form. Replacement artwork uses the same 908 × 1280 coordinate canvas.
- Review the template and authority to reproduce the chief editor's signature. Every candidate still needs a fresh preview.
- Only then open applications. The UI refuses to open without private storage/email/payment/privacy configuration.

Applicants supply an email, required profile details, portrait, one identity proof and payment evidence. Only masked Aadhaar should be submitted; voter ID/driving licence are alternatives. This is document collection for manual review, **not Aadhaar authentication or automated KYC**. Editors must reject/request correction of unmasked Aadhaar. No PAN field is provided. Payment must be independently verified from the actual transaction.

Upload sessions expire after 30 minutes and are bound to an email/application, with request and file limits. Correction links expire after seven days and are consumed on successful resubmission. All documents are private downloads; PDFs are rejected if malformed/encrypted or detected to contain active actions. This validation is not an antivirus service; treat applicant attachments as untrusted.

## Issuance, delivery and maintenance

Mark an application under review, verify payment, then enter designation/joining date and adjust crop. Generate and inspect a fresh preview. Approval requires that exact application/template/number version and confirmation. The next number is locked transactionally; concurrent approvals cannot reuse it. Long text that does not fit is rejected; adjust the template rather than silently clipping.

Cards expire on the first anniversary (February 29 → February 28 where necessary). Revocation sends a notification. This is an organizational card, not government accreditation. No public verification portal, reporter login or publishing access is introduced. Previously downloaded cards cannot be remotely erased; revocation is recorded in the editor and communicated by email.

Emails use a recorded outbox and a stable provider idempotency key. Confirmed failures can be retried; ambiguous responses are marked unknown and require checking provider records. Approval email contains only the generated ID PDF, never identity/payment evidence. Retrying delivery does not allocate a new reporter number.

Reporter maintenance now runs **inside the existing web service**, started by `npm start` after migrations and server startup. No separate DigitalOcean job, worker, scheduler service or new credentials are required. Do not create the previously proposed paid reporter-maintenance component. The YouTube synchronization command remains separate and is unchanged by this maintenance update.

The service checks once a minute, starting 30 seconds after startup. It targets **03:00 Asia/Kolkata daily**, catches up when the saved due time has passed, and persists the last result/next run in PostgreSQL. Private reporter storage and the editor's retention confirmation are required. Closing applications does not stop retention cleanup. There is no automatic timer in `npm run dev` or when starting `dist/server/entry.mjs` directly; use the existing `npm start` production command.

At `/editor/reporters/`, editors can see scheduler heartbeat, last run/result, last success and next due time. **Run maintenance now** requires explicit confirmation because deletions are irreversible and pending emails may be delivered. Editor authentication and same-origin protection apply. A database advisory lock prevents concurrent manual, CLI and automatic runs, including during rolling deployments. Manual clicks have a one-minute cooldown.

Runs use small batches and a 15-second work budget checked between operations. An in-flight storage request or email can take additional time. Private deletes have a five-second timeout. Backlogs continue after one minute, failures retry after 15 minutes, and interrupted runs resume after restart. Unknown email outcomes are never automatically resent. Existing pending/failed/unknown email statuses remain visible per application.

The existing `npm run reporters:maintenance` command remains available for manual operations. It removes expired preview files, abandoned uploads after one day, expired correction tokens and rate-limit records, then delivers pending emails. It follows the same database lock, readiness checks and status tracking as the editor and scheduler.

No additional infrastructure charge is introduced; the scheduler shares the site's existing CPU/database connections. R2 operations/storage and email still follow their existing usage allowances. This is not an independent always-on scheduler: if the whole web app is down, maintenance waits until it restarts. Monitor the editor heartbeat and last successful run.

Default retention is 90 days after final review for evidence, and 90 days after expiry/revocation for the approved profile/photo/card. Rejected profiles are removed after their configured retention window. A minimal number/status/audit record remains to prevent ID reuse; personal notes and email bodies are cleared on profile removal. Settings are snapshotted per application, so subsequent changes do not silently alter an applicant's terms. Unreviewed applications need editorial attention; the system does not silently reject them.

Do not apply the social-video seven-day lifecycle rule to this bucket. Use the maintenance command, not an all-bucket deletion rule. Take database backups and review R2 usage; free-tier storage is an allowance, not a cost guarantee.

## Review gates

- Verify one real QR scan and a generated sample card manually before opening registration.
- Test actual private R2 uploads and Resend delivery once credentials are configured.
- Verify actual YouTube synchronization and playback with the production API key before enabling TV.
- Review local desktop/mobile pages. Run only targeted enhancement tests, not the full viewport suite.
- Production changes, jobs, credentials, migrations and deployment require a separate approval.
