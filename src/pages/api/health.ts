import type { APIRoute } from "astro";
import { databaseIsReady } from "../../lib/database";

export const GET: APIRoute = async ({ locals }) => {
  const ready = await databaseIsReady(locals);
  return Response.json(
    { status: ready ? "ok" : "unavailable", database: ready ? "ready" : "unavailable" },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
};
