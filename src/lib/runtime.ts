import { env } from "cloudflare:workers";

export function getRuntimeEnv(_locals: App.Locals): CloudflareEnv {
  return env as unknown as CloudflareEnv;
}

export function getDatabase(locals: App.Locals): D1Database | undefined {
  return getRuntimeEnv(locals).DB;
}
