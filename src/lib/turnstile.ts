import { getRuntimeEnv } from "./runtime";

interface TurnstileResult {
  success?: boolean;
  action?: string;
  hostname?: string;
}

function loopback(request: Request): boolean {
  return ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
}

export async function verifyTurnstile(
  request: Request,
  token: string,
  expectedAction: string,
): Promise<void> {
  if (import.meta.env.DEV && loopback(request)) return;
  const secret = getRuntimeEnv().TURNSTILE_SECRET_KEY;
  if (!secret || !token) throw new Error("Human verification is required.");

  const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: request.headers.get("do-connecting-ip") ?? undefined,
      idempotency_key: crypto.randomUUID(),
    }),
  });
  if (!verification.ok) throw new Error("Human verification service is unavailable.");
  const result = await verification.json() as TurnstileResult;
  const requestHostname = new URL(request.url).hostname.toLowerCase();
  if (
    !result.success
    || result.action !== expectedAction
    || (result.hostname && result.hostname.toLowerCase() !== requestHostname)
  ) {
    throw new Error("Human verification failed.");
  }
}
