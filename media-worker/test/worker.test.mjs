import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import test from "node:test";
import worker, { expectedSignature } from "../src/index.js";

globalThis.crypto ??= webcrypto;

const secret = "focused-worker-test-secret";
const key = "active/00000000-0000-4000-8000-000000000001.mp4";

function object(range) {
  return {
    size: 2048,
    range,
    httpEtag: '"test-etag"',
    body: new Uint8Array(range ? range.length : 2048),
    writeHttpMetadata(headers) { headers.set("Content-Type", "video/mp4"); },
  };
}

const env = {
  MEDIA_URL_SIGNING_SECRET: secret,
  VIDEO_BUCKET: {
    async head(requestKey) { return requestKey === key ? object() : null; },
    async get(requestKey, options) {
      if (requestKey !== key) return null;
      return options.range.get("range") ? object({ offset: 0, length: 1024 }) : object();
    },
  },
};

test("Worker and application-compatible HMAC signatures match", async () => {
  const expected = createHmac("sha256", secret).update(key).digest("base64url");
  assert.equal(await expectedSignature(key, secret), expected);
});

test("Worker streams signed HEAD, GET and byte ranges and rejects unsafe access", async () => {
  const signature = await expectedSignature(key, secret);
  const url = `https://media.example/media/${signature}/${key}`;
  const head = await worker.fetch(new Request(url, { method: "HEAD" }), env);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "2048");
  assert.equal(head.headers.get("accept-ranges"), "bytes");

  const partial = await worker.fetch(new Request(url, { headers: { Range: "bytes=0-1023" } }), env);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 0-1023/2048");
  assert.equal(partial.headers.get("content-type"), "video/mp4");

  assert.equal((await worker.fetch(new Request(url.replace(signature, "A".repeat(43))), env)).status, 404);
  assert.equal((await worker.fetch(new Request(url, { method: "POST" }), env)).status, 405);
  assert.equal((await worker.fetch(new Request(`https://media.example/media/${signature}/retention/file.mp4`), env)).status, 404);
});

test("Worker accepts the next signing secret during a safe rotation", async () => {
  const nextSecret = "focused-worker-next-secret";
  const signature = await expectedSignature(key, nextSecret);
  const response = await worker.fetch(new Request(`https://media.example/media/${signature}/${key}`, { method: "HEAD" }), {
    ...env,
    MEDIA_URL_SIGNING_SECRET_NEXT: nextSecret,
  });
  assert.equal(response.status, 200);
});
