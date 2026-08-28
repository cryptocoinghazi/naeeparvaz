import type { APIRoute } from "astro";
import { drivePlaceholderSvg, fetchDriveImage, isStoredDriveImage } from "../../../lib/drive-image";

export const GET: APIRoute = async ({ params, locals }) => {
  const fileId = params.id ?? "";
  if (!await isStoredDriveImage(locals, fileId)) return new Response("Not found", { status: 404 });
  try {
    const image = await fetchDriveImage(fileId);
    return new Response(image.bytes, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=3600, stale-if-error=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to proxy Google Drive image", error);
    return new Response(drivePlaceholderSvg(), {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
};
