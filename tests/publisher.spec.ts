import { expect, test } from "@playwright/test";
import type { Movie } from "mp4box";
import { maxPublisherVideoBytes, validatePublisherMovie } from "../src/lib/publisher-r2";

function movie(overrides: Record<string, unknown> = {}): Movie {
  return {
    duration: 30_000,
    timescale: 1_000,
    videoTracks: [{ codec: "avc1.640028", track_width: 1080, track_height: 1920, timescale: 1_000, samples_duration: 30_000 }],
    audioTracks: [{ codec: "mp4a.40.2" }],
    ...overrides,
  } as Movie;
}

test("publisher format validation enforces every no-transcoding rule", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Pure validation needs one focused run");
  expect(validatePublisherMovie(movie(), 1_000_000)).toMatchObject({ width: 1080, height: 1920, durationSeconds: 30 });
  expect(validatePublisherMovie(movie({ duration: 0 }), 1_000_000)).toMatchObject({ durationSeconds: 30 });
  expect(validatePublisherMovie(movie({
    duration: 267_000,
    videoTracks: [{ codec: "avc1.4d401f", track_width: 854, track_height: 480 }],
  }), 24_238_226)).toMatchObject({ width: 854, height: 480, durationSeconds: 267 });
  expect(() => validatePublisherMovie(movie(), maxPublisherVideoBytes + 1)).toThrow(/90 MB/i);
  expect(() => validatePublisherMovie(movie({ videoTracks: [] }), 1_000)).toThrow(/one video track/i);
  expect(() => validatePublisherMovie(movie({ audioTracks: [] }), 1_000)).toThrow(/one audio track/i);
  expect(() => validatePublisherMovie(movie({ videoTracks: [{ codec: "hvc1", track_width: 1080, track_height: 1920 }] }), 1_000)).toThrow(/H.264/i);
  expect(() => validatePublisherMovie(movie({ audioTracks: [{ codec: "ac-3" }] }), 1_000)).toThrow(/AAC/i);
  expect(() => validatePublisherMovie(movie({ duration: 2_000 }), 1_000)).toThrow(/between 3 seconds and 15 minutes/i);
  expect(() => validatePublisherMovie(movie({ duration: 901_000 }), 1_000)).toThrow(/between 3 seconds and 15 minutes/i);
});

test("every social publisher route is protected by the existing editor session", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One auth boundary check is sufficient");
  const editor = await request.get("/editor/publisher/", { maxRedirects: 0 });
  expect(editor.status()).toBe(302);
  expect(editor.headers().location).toContain("/editor/login/");
  for (const route of ["channels", "upload", "publish", "target", "import"]) {
    const response = await request.post(`/api/editor/publisher/${route}/`, {
      headers: { Origin: "http://127.0.0.1:4321", "Content-Type": "application/json" },
      data: {},
    });
    expect(response.status(), route).toBe(401);
    expect(response.headers()["x-robots-tag"], route).toBe("noindex, nofollow");
  }
});
