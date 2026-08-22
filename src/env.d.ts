/// <reference types="astro/client" />
interface RuntimeEnv {
  ADMIN_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  DATABASE_URL?: string;
  LOCAL_ADMIN_CODE?: string;
  RESEND_API_KEY?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
}

declare namespace App {
  interface Locals {
    adminEmail?: string;
  }
}
