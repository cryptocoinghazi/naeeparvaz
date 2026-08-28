import type { APIRoute } from "astro";
import { setAdvertisementStatus } from "../../../lib/ad-repository";
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid advertisement identifier.");
    await setAdvertisementStatus(locals, id, form.get("status") === "published" ? "published" : "draft");
    return redirect("/editor/ads/?saved=status", 303);
  } catch (error) {
    console.error("Admin advertisement status failed", error);
    return redirect("/editor/ads/?error=status", 303);
  }
};
