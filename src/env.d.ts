/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  DB?: D1Database;
  ADMIN_EMAIL?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CONTACT_FROM_EMAIL?: string;
  LOCAL_ADMIN_TOKEN?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
}

declare namespace App {
  interface Locals {
    adminEmail?: string;
  }
}
