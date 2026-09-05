const mediaPath = /^\/media\/([A-Za-z0-9_-]{43})\/(active\/[0-9a-f-]{36}\.mp4)$/i;

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function expectedSignature(key, secret) {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(key))));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function mediaHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "video/mp4");
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
    }
    const match = new URL(request.url).pathname.match(mediaPath);
    if (!match || (!env.MEDIA_URL_SIGNING_SECRET_NEXT && !env.MEDIA_URL_SIGNING_SECRET)) return notFound();
    const [, suppliedSignature, key] = match;
    const signingSecrets = [env.MEDIA_URL_SIGNING_SECRET_NEXT, env.MEDIA_URL_SIGNING_SECRET].filter(Boolean);
    const signatures = await Promise.all(signingSecrets.map((secret) => expectedSignature(key, secret)));
    if (!signatures.some((signature) => constantTimeEqual(suppliedSignature, signature))) return notFound();

    if (request.method === "HEAD") {
      const object = await env.VIDEO_BUCKET.head(key);
      if (!object) return notFound();
      const headers = mediaHeaders(object);
      headers.set("Content-Length", String(object.size));
      return new Response(null, { status: 200, headers });
    }

    let object;
    try {
      object = await env.VIDEO_BUCKET.get(key, { range: request.headers });
    } catch {
      return new Response("Range not satisfiable", { status: 416, headers: { "Accept-Ranges": "bytes", "Cache-Control": "no-store" } });
    }
    if (!object) return notFound();
    const headers = mediaHeaders(object);
    if (object.range) {
      const offset = object.range.offset ?? 0;
      const length = object.range.length ?? object.size;
      headers.set("Content-Length", String(length));
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      return new Response(object.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { status: 200, headers });
  },
};

export { constantTimeEqual, expectedSignature, mediaPath };
