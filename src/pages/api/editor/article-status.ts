import type { APIRoute } from "astro";
import { setArticleStatus } from "../../../lib/article-repository";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid article identifier.");
    await setArticleStatus(locals, id, form.get("status") === "published" ? "published" : "draft");
    return redirect("/editor/articles/?saved=status", 303);
  } catch (error) {
    console.error("Admin article status update failed", error);
    return redirect("/editor/articles/?error=status", 303);
  }
};
