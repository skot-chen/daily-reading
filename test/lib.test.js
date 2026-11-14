import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoId, partFromTitle, fmtTime } from "../lib.js";

test("parseVideoId", () => {
  assert.equal(parseVideoId("https://www.youtube.com/watch?v=hUVab77Hrao"), "hUVab77Hrao");
  assert.equal(parseVideoId("https://youtu.be/hUVab77Hrao?t=30"), "hUVab77Hrao");
  assert.equal(parseVideoId("https://m.youtube.com/watch?v=hUVab77Hrao&t=5s"), "hUVab77Hrao");
  assert.equal(parseVideoId("hUVab77Hrao"), "hUVab77Hrao");
  assert.equal(parseVideoId("https://example.com/watch?v=hUVab77Hrao"), null);
  assert.equal(parseVideoId("hello"), null);
});

test("partFromTitle", () => {
  assert.equal(partFromTitle("The Wizard of Oz | Deep Work Session | Part 14"), 14);
  assert.equal(partFromTitle("no number"), null);
});

test("fmtTime", () => {
  assert.equal(fmtTime(328.9), "05:28");
  assert.equal(fmtTime(-3), "00:00");
  assert.equal(fmtTime(3725), "1:02:05");
});
