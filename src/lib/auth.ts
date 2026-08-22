import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { AstroCookies } from "astro";
import { getDatabase, withTransaction } from "./database";
import { getRuntimeEnv } from "./runtime";

const challengeLifetimeSeconds = 10 * 60;
const sessionLifetimeSeconds = 8 * 60 * 60;
const loginWindowMinutes = 15;
const maximumLoginRequests = 5;
const maximumCodeAttempts = 5;

interface ChallengeRow {
  email: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
}

export class LoginRateLimitError extends Error {}

export function sessionCookieName(): string {
  return import.meta.env.DEV ? "naee_admin" : "__Host-naee_admin";
}

export function challengeCookieName(): string {
  return import.meta.env.DEV ? "naee_login" : "__Host-naee_login";
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requiredConfiguration(locals: App.Locals) {
  const env = getRuntimeEnv(locals);
  const database = getDatabase(locals);
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const secret = env.SESSION_SECRET?.trim();
  if (!database || !email || !secret || secret.length < 32) {
    throw new Error("Admin authentication is not configured.");
  }
  return { database, email, env, secret };
}

function clientHash(request: Request, secret: string): string {
  const url = new URL(request.url);
  const identity = request.headers.get("do-connecting-ip")
    ?? (import.meta.env.DEV ? `local:${url.hostname}` : "unavailable");
  return hmac(secret, `client:${identity}`);
}

function localCode(request: Request, configuredCode?: string): string | undefined {
  const hostname = new URL(request.url).hostname;
  if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(hostname)) return undefined;
  return configuredCode && /^\d{6,12}$/.test(configuredCode) ? configuredCode : undefined;
}

async function sendLoginCode(code: string, recipient: string): Promise<void> {
  const env = getRuntimeEnv();
  if (!env.RESEND_API_KEY) throw new Error("Admin email delivery is not configured.");
  const from = env.CONTACT_FROM_EMAIL ?? "website@send.naeeparvaz.com";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Naee Parvaz Website <${from}>`,
      to: [recipient],
      subject: "Your Naee Parvaz editor sign-in code",
      text: `Your Naee Parvaz editor sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
      html: `<h1>Naee Parvaz editor sign-in</h1><p>Your one-time code is:</p><p style="font-size:2rem;font-weight:700;letter-spacing:.2em">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>`,
    }),
  });
  if (!response.ok) {
    console.error("Admin code delivery failed", response.status, await response.text());
    throw new Error("Admin email delivery failed.");
  }
}

export async function createAdminChallenge(
  request: Request,
  locals: App.Locals,
  suppliedEmail: string,
): Promise<string> {
  const { database, email: adminEmail, env, secret } = requiredConfiguration(locals);
  const email = suppliedEmail.trim().toLowerCase();
  const identifier = clientHash(request, secret);
  const challengeToken = randomBytes(32).toString("base64url");
  const challengeHash = hash(challengeToken);
  const developmentCode = localCode(request, env.LOCAL_ADMIN_CODE);
  const code = developmentCode ?? String(randomInt(0, 1_000_000)).padStart(6, "0");

  await withTransaction(locals, async (client) => {
    await client.query("DELETE FROM admin_login_requests WHERE requested_at < CURRENT_TIMESTAMP - INTERVAL '1 day'");
    const recent = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM admin_login_requests
      WHERE client_hash = $1
        AND requested_at > CURRENT_TIMESTAMP - INTERVAL '${loginWindowMinutes} minutes'
    `, [identifier]);
    if (Number(recent.rows[0]?.count ?? 0) >= maximumLoginRequests) {
      throw new LoginRateLimitError("Too many sign-in requests. Try again later.");
    }
    await client.query("INSERT INTO admin_login_requests (client_hash) VALUES ($1)", [identifier]);
    if (email !== adminEmail) return;
    await client.query("DELETE FROM admin_login_challenges WHERE email = $1 OR expires_at <= CURRENT_TIMESTAMP", [adminEmail]);
    await client.query(`
      INSERT INTO admin_login_challenges (token_hash, email, code_hash, expires_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '${challengeLifetimeSeconds} seconds')
    `, [challengeHash, adminEmail, hmac(secret, `${challengeHash}:${code}`)]);
  });

  if (email !== adminEmail) return challengeToken;
  if (!developmentCode) {
    try {
      await sendLoginCode(code, adminEmail);
    } catch (error) {
      await database.query("DELETE FROM admin_login_challenges WHERE token_hash = $1", [challengeHash]);
      throw error;
    }
  }
  return challengeToken;
}

export async function verifyAdminChallenge(
  locals: App.Locals,
  challengeToken: string,
  suppliedCode: string,
): Promise<{ email: string; sessionToken: string } | undefined> {
  const { email: adminEmail, secret } = requiredConfiguration(locals);
  const challengeHash = hash(challengeToken);
  const code = suppliedCode.trim();
  if (!/^\d{6,12}$/.test(code)) return undefined;

  return withTransaction(locals, async (client) => {
    const result = await client.query<ChallengeRow>(`
      SELECT email, code_hash, attempts, expires_at
      FROM admin_login_challenges
      WHERE token_hash = $1
      FOR UPDATE
    `, [challengeHash]);
    const challenge = result.rows[0];
    if (
      !challenge
      || challenge.email.toLowerCase() !== adminEmail
      || challenge.expires_at.getTime() <= Date.now()
      || challenge.attempts >= maximumCodeAttempts
    ) {
      return undefined;
    }

    await client.query(
      "UPDATE admin_login_challenges SET attempts = attempts + 1 WHERE token_hash = $1",
      [challengeHash],
    );
    const suppliedHash = hmac(secret, `${challengeHash}:${code}`);
    if (!safeEqual(challenge.code_hash, suppliedHash)) return undefined;

    const sessionToken = randomBytes(32).toString("base64url");
    const sessionHash = hash(sessionToken);
    await client.query("DELETE FROM admin_login_challenges WHERE token_hash = $1", [challengeHash]);
    await client.query("DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP");
    await client.query(`
      INSERT INTO admin_sessions (token_hash, email, expires_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '${sessionLifetimeSeconds} seconds')
    `, [sessionHash, adminEmail]);
    return { email: adminEmail, sessionToken };
  });
}

export async function getAdminSessionEmail(
  locals: App.Locals,
  token: string | undefined,
): Promise<string | undefined> {
  if (!token) return undefined;
  try {
    const { database, email: adminEmail } = requiredConfiguration(locals);
    const result = await database.query<{ email: string }>(`
      SELECT email
      FROM admin_sessions
      WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP
    `, [hash(token)]);
    const email = result.rows[0]?.email.toLowerCase();
    if (email !== adminEmail) return undefined;
    return email;
  } catch (error) {
    console.error("Admin session validation failed", error);
    return undefined;
  }
}

export async function destroyAdminSession(locals: App.Locals, token: string | undefined): Promise<void> {
  const database = getDatabase(locals);
  if (!database || !token) return;
  await database.query("DELETE FROM admin_sessions WHERE token_hash = $1", [hash(token)]);
}

export function setChallengeCookie(cookies: AstroCookies, token: string): void {
  cookies.set(challengeCookieName(), token, {
    path: "/",
    httpOnly: true,
    secure: !import.meta.env.DEV,
    sameSite: "strict",
    maxAge: challengeLifetimeSeconds,
  });
}

export function setSessionCookie(cookies: AstroCookies, token: string): void {
  cookies.set(sessionCookieName(), token, {
    path: "/",
    httpOnly: true,
    secure: !import.meta.env.DEV,
    sameSite: "strict",
    maxAge: sessionLifetimeSeconds,
  });
}

export function clearAuthenticationCookies(cookies: AstroCookies): void {
  cookies.delete(challengeCookieName(), { path: "/" });
  cookies.delete(sessionCookieName(), { path: "/" });
}

export function clearChallengeCookie(cookies: AstroCookies): void {
  cookies.delete(challengeCookieName(), { path: "/" });
}

export function safeEditorNext(value: FormDataEntryValue | string | null): string {
  if (typeof value !== "string") return "/editor/";
  return value === "/editor" || value.startsWith("/editor/") ? value : "/editor/";
}
