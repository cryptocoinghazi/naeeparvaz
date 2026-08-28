import type { APIRoute } from "astro";
import { getVisitSummary } from "../../../lib/analytics-repository";
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  return Response.json(await getVisitSummary(locals), { headers: { "Cache-Control": "no-store" } });
};
