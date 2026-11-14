import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoId, partFromTitle, fmtTime, newPart, newCard, clampRange, deleteCard, mergeParts, partStats, validatePart }
  from "../lib.js";

const T = (s) => new Date("2026-11-14T10:00:" + s + "Z");

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

test("newCard covers 4 s before to 1 s after, never below 0", () => {
  const c = newCard(100.26, T("00"), "c1");
  assert.deepEqual([c.start, c.end, c.mark], [96.3, 101.3, "q"]);
  assert.equal(newCard(2, T("00"), "c2").start, 0);
});

test("clampRange keeps end after start", () => {
  assert.deepEqual(clampRange(-1, 3), { start: 0, end: 3 });
  assert.deepEqual(clampRange(10, 9), { start: 10, end: 10.5 });
});

test("merge: newer card edit wins, AI review survives a later learner edit", () => {
  const local = newPart("hUVab77Hrao", 14, "", T("00"));
  const remote = structuredClone(local);
  local.cards = [{ ...newCard(50, T("10"), "a"), zh: "我的新翻译", t: T("30").toISOString() }];
  remote.cards = [{ ...newCard(50, T("10"), "a"), zh: "旧", t: T("10").toISOString(),
    review: { ref: "参考", verdict: "ok", t: T("20").toISOString() } }];
  const m = mergeParts(local, remote);
  assert.equal(m.cards[0].zh, "我的新翻译");
  assert.equal(m.cards[0].review.ref, "参考");
});

test("merge: deletion wins over older edits, keeps cards from both sides, sorted", () => {
  const a = newPart("hUVab77Hrao", 14, "", T("00"));
  a.cards = [newCard(80, T("01"), "x"), newCard(20, T("01"), "y")];
  const b = structuredClone(a);
  deleteCard(b, "x", T("05"));
  b.cards.push(newCard(10, T("06"), "z"));
  const m = mergeParts(a, b);
  assert.deepEqual(m.cards.map((c) => c.id), ["z", "y"]);
  assert.ok(m.deleted.x);
  assert.equal(m.updated, b.updated);
});

test("merge: summary taken from the newer side", () => {
  const a = newPart("hUVab77Hrao", 14, "", T("00"));
  const b = { ...structuredClone(a), summary: { stuck: "连读", t: T("09").toISOString() } };
  assert.equal(mergeParts(a, b).summary.stuck, "连读");
  assert.equal(mergeParts(b, a).summary.stuck, "连读");
});

test("merge: an AI review/summary without t is kept, not dropped", () => {
  const a = newPart("hUVab77Hrao", 14, "", T("00"));
  a.cards = [{ ...newCard(5, T("01"), "a"), zh: "新", t: T("40").toISOString() }];
  const b = structuredClone(a);
  b.cards[0] = { ...b.cards[0], zh: "旧", t: T("10").toISOString(), review: { ref: "参考" } };
  b.summary = { stuck: "长句" };
  const m = mergeParts(a, b);
  assert.equal(m.cards[0].zh, "新");
  assert.equal(m.cards[0].review.ref, "参考");
  assert.equal(m.summary.stuck, "长句");
});

test("merge: times compare as dates, not text", () => {
  const a = newPart("hUVab77Hrao", 14, "", T("00"));
  a.cards = [{ ...newCard(5, T("01"), "a"), zh: "旧", t: "2026-11-14T10:00:30.000Z" }];
  const b = structuredClone(a);
  b.cards[0] = { ...b.cards[0], zh: "新", t: "2026-11-14T18:01:00+08:00" }; // = 10:01:00Z, newer
  assert.equal(mergeParts(a, b).cards[0].zh, "新");
});

test("merge: a card edited after its deletion comes back", () => {
  const a = newPart("hUVab77Hrao", 14, "", T("00"));
  a.cards = [newCard(5, T("01"), "x")];
  const b = structuredClone(a);
  deleteCard(b, "x", T("05"));
  a.cards[0].t = T("09").toISOString();
  assert.deepEqual(mergeParts(a, b).cards.map((c) => c.id), ["x"]);
});

test("partStats", () => {
  const p = newPart("hUVab77Hrao", 14, "", T("00"));
  p.cards = [newCard(1, T("00"), "a"), { ...newCard(9, T("00"), "b"), mark: "ok", review: { ref: "r" } }];
  assert.deepEqual(partStats(p), { cards: 2, q: 1, reviewed: 1 });
});

test("validatePart", () => {
  const p = newPart("hUVab77Hrao", 14, "", T("00"));
  p.cards = [newCard(5, T("00"), "a")];
  assert.deepEqual(validatePart(p), []);
  p.cards[0].review = { ref: "r", verdict: "ok", t: "2026-11-14T09:30:00Z" };
  p.summary = { stuck: "x", patterns: [], t: T("05").toISOString() };
  assert.deepEqual(validatePart(p), []);
  p.cards.push({ ...p.cards[0], mark: "maybe", review: { verdict: "great" } });
  delete p.summary.t;
  const errs = validatePart(p);
  assert.ok(errs.some((e) => e.includes("duplicate")));
  assert.ok(errs.some((e) => e.includes("mark")));
  assert.ok(errs.some((e) => e.includes("verdict")));
  assert.ok(errs.some((e) => e.includes("review.ref")));
  assert.ok(errs.some((e) => e.includes("review.t")));
  assert.ok(errs.some((e) => e.includes("summary.t")));
  assert.deepEqual(validatePart({ version: 1, video: "bad", part: 0, cards: [], updated: T("00").toISOString() }).length, 2);
});
