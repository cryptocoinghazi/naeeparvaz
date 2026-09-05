export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new Error("Cross-origin editor requests are not allowed.");
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}
