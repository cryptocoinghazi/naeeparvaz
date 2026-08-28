import { getDatabase } from "./database";

const allowedDriveHosts = new Set(["drive.google.com", "www.drive.google.com", "drive.usercontent.google.com"]);
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const maxDriveImageBytes = 5 * 1024 * 1024;

export interface DriveImageReference {
  fileId: string;
  sourceUrl: string;
}

export interface DriveImageResponse {
  bytes: ArrayBuffer;
  contentType: string;
}

export function parseDriveImageUrl(input: string): DriveImageReference {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid Google Drive image link.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedDriveHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Use a standard HTTPS Google Drive file link.");
  }
  if (/\/folders?\//.test(url.pathname)) throw new Error("Choose an image file, not a Google Drive folder.");
  const pathMatch = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/);
  const fileId = pathMatch?.[1] ?? url.searchParams.get("id");
  if (!fileId || !/^[A-Za-z0-9_-]{10,}$/.test(fileId)) throw new Error("The Google Drive file ID could not be read.");
  url.hash = "";
  return { fileId, sourceUrl: url.toString() };
}

export function driveImagePath(fileId: string): string {
  return `/media/drive/${encodeURIComponent(fileId)}/`;
}

export async function fetchDriveImage(fileId: string): Promise<DriveImageResponse> {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) throw new Error("Invalid Google Drive file ID.");
  const response = await fetch(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "Naee-Parvaz-Image-Validator/1.0" },
  });
  if (!response.ok) throw new Error("Google Drive did not return the image.");
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!allowedImageTypes.has(contentType)) throw new Error("Google Drive must contain a JPEG, PNG or WebP image.");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maxDriveImageBytes) throw new Error("The Google Drive image must be 5 MB or smaller.");
  if (!response.body) throw new Error("Google Drive returned an empty image response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxDriveImageBytes) {
      await reader.cancel();
      throw new Error("The Google Drive image must be 5 MB or smaller.");
    }
    chunks.push(value);
  }
  if (!total) throw new Error("Google Drive returned an empty image response.");
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: combined.buffer, contentType };
}

export async function validateDriveImageUrl(input: string): Promise<DriveImageReference> {
  const reference = parseDriveImageUrl(input);
  await fetchDriveImage(reference.fileId);
  return reference;
}

export function drivePlaceholderSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="Image unavailable"><rect width="1200" height="675" fill="#082f78"/><path d="M0 575h1200v100H0z" fill="#041b48"/><circle cx="600" cy="285" r="92" fill="#f0bd19" opacity=".9"/><text x="600" y="455" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#fff">Naee Parvaz News</text><text x="600" y="510" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#d8dee7">Image temporarily unavailable</text></svg>`;
}

export async function isStoredDriveImage(locals: App.Locals, fileId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return false;
  const database = getDatabase(locals);
  if (!database) return false;
  const result = await database.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM videos WHERE thumbnail_drive_id = $1
      UNION ALL
      SELECT 1 FROM articles WHERE cover_drive_id = $1
      UNION ALL
      SELECT 1 FROM advertisements WHERE creative_drive_id = $1
    ) AS exists
  `, [fileId]);
  return result.rows[0]?.exists === true;
}

export function validateExternalDestination(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use a standard HTTPS destination URL.");
  url.hash = "";
  return url.toString();
}
