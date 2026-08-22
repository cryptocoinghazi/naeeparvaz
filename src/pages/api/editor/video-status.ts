import type { APIRoute } from "astro";
import { setVideoStatus } from "../../../lib/video-repository";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    const status = form.get("status") === "published" ? "published" : "draft";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid video identifier.");
    await setVideoStatus(locals, id, status);
    return redirect(`/editor/?saved=status`, 303);
  } catch (error) {
    console.error("Admin status update failed", error);
    return redirect(`/editor/?error=status`, 303);
  }
};
