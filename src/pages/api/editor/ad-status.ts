import type { APIRoute } from "astro";
import { setAdvertisementStatus, deleteAdvertisement } from "../../../lib/ad-repository";
import { requireSameOrigin } from "../../../lib/editor-api";
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid advertisement identifier.");
    const status = form.get('status');
    if (status === 'delete' || status === 'restore') {
      if (status === 'delete' && form.get('confirm') !== 'yes') throw new Error('Confirm deletion');
      await deleteAdvertisement(locals, id, status === 'restore');
    } else await setAdvertisementStatus(locals, id, status === "published" ? "published" : "draft");
    return redirect("/editor/ads/?saved=status", 303);
  } catch (error) {
    console.error("Admin advertisement status failed", error);
    return redirect("/editor/ads/?error=status", 303);
  }
};
