/// <reference types="astro/client" />
interface RuntimeEnv {
  ADMIN_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  DATABASE_CA_CERT?: string;
  DATABASE_URL?: string;
  LOCAL_ADMIN_CODE?: string;
  RESEND_API_KEY?: string;
  BUFFER_API_KEY?: string;
  MEDIA_URL_SIGNING_SECRET?: string;
  MEDIA_URL_SIGNING_SECRET_NEXT?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET?: string;
  R2_ENDPOINT?: string;
  R2_MEDIA_BASE_URL?: string;
  R2_SECRET_ACCESS_KEY?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
}

declare namespace App {
  interface Locals {
    adminEmail?: string;
  }
}
