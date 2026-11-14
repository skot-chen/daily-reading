// @ts-check
// Pure helpers shared by the page (app.js), the tests and scripts/validate.mjs. No DOM, no network.

/**
 * @typedef {{ ref?: string, verdict?: "ok"|"close"|"wrong", note?: string, point?: string, t?: string }} Review
 * @typedef {{ id: string, start: number, end: number, en: string, zh: string, mark: "ok"|"q", t: string, review?: Review }} Card
 * @typedef {{ stuck?: string, patterns?: string[], next?: string, t?: string }} Summary
 * @typedef {{ version: 1, video: string, part: number|null, title: string, created: string, updated: string,
 *   cards: Card[], deleted?: Record<string,string>, summary?: Summary }} Part
 */

/** @param {string} s @returns {string|null} 11-char YouTube video id */
export function parseVideoId(s) {
  s = String(s || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v");
    const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
    if (!id && m) id = m[2];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** "Part 14" in a title → 14 @param {string} title */
export function partFromTitle(title) {
  const m = String(title || "").match(/\bpart\s*(\d{1,3})\b/i);
  return m ? Number(m[1]) : null;
}

/** 328.4 → "05:28" (h:mm:ss above an hour) @param {number} sec */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
}

/** @param {string} video @param {number|null} part @param {string} title @param {Date} now @returns {Part} */
export function newPart(video, part, title, now) {
  const iso = now.toISOString();
  return { version: 1, video, part, title: title || "", created: iso.slice(0, 10), updated: iso, cards: [] };
}

/** A card for "I didn't get what was just said": from 4 s before to 1 s after.
 * @param {number} at current video time @param {Date} now @param {string} id @returns {Card} */
export function newCard(at, now, id) {
  const t = Math.max(0, Number(at) || 0);
  return { id, start: round1(Math.max(0, t - 4)), end: round1(t + 1), en: "", zh: "", mark: "q", t: now.toISOString() };
}

/** Keep start >= 0 and end at least 0.5 s after start. @param {number} start @param {number} end */
export function clampRange(start, end) {
  const s = round1(Math.max(0, Number(start) || 0));
  const e = round1(Math.max(s + 0.5, Number(end) || 0));
  return { start: s, end: e };
}

/** @param {number} n */
function round1(n) { return Math.round(n * 10) / 10; }

/** @param {Card[]} cards */
export function sortCards(cards) { return cards.slice().sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)); }

/** Remove a card and remember the deletion so sync doesn't bring it back. @param {Part} p @param {string} id @param {Date} now */
export function deleteCard(p, id, now) {
  p.cards = p.cards.filter((c) => c.id !== id);
  p.deleted = Object.assign({}, p.deleted, { [id]: now.toISOString() });
  p.updated = now.toISOString();
}

/** @param {string|undefined} a @param {string|undefined} b  true if a is newer than b */
function newer(a, b) { return (a || "") > (b || ""); }

/**
 * Merge two copies of the same Part (this browser vs the repo). Per card the newer edit (`t`) wins; deletions win
 * over older edits; the AI's `review` and `summary` are merged on their own timestamps, so a learner's later edit
 * never drops an AI review written meanwhile.
 * @param {Part} a @param {Part} b @returns {Part}
 */
export function mergeParts(a, b) {
  const base = newer(b.updated, a.updated) ? b : a;
  /** @type {Record<string,string>} */
  const deleted = Object.assign({}, a.deleted);
  for (const [id, t] of Object.entries(b.deleted || {})) if (newer(t, deleted[id])) deleted[id] = t;
  /** @type {Map<string, Card>} */
  const byId = new Map();
  for (const c of [...a.cards, ...b.cards]) {
    const prev = byId.get(c.id);
    if (!prev) { byId.set(c.id, c); continue; }
    const win = newer(c.t, prev.t) ? c : prev, lose = win === c ? prev : c;
    const review = newer(lose.review?.t, win.review?.t) ? lose.review : win.review;
    byId.set(c.id, review ? { ...win, review } : { ...win });
  }
  const cards = sortCards([...byId.values()].filter((c) => !(deleted[c.id] && !newer(c.t, deleted[c.id]))));
  const summary = newer(b.summary?.t, a.summary?.t) ? b.summary : a.summary;
  /** @type {Part} */
  const out = { ...base, cards, updated: newer(b.updated, a.updated) ? b.updated : a.updated };
  if (Object.keys(deleted).length) out.deleted = deleted; else delete out.deleted;
  if (summary) out.summary = summary; else delete out.summary;
  return out;
}

/** Counts for the shelf. @param {Part} p */
export function partStats(p) {
  return { cards: p.cards.length, q: p.cards.filter((c) => c.mark === "q").length,
    reviewed: p.cards.filter((c) => c.review && c.review.ref).length };
}

/** File name in the notes repo. @param {Part} p */
export function partPath(p) { return "parts/" + p.video + ".json"; }

/**
 * Check a Part file (used by scripts/validate.mjs so an AI can check before pushing).
 * @param {any} p @returns {string[]} problems (empty = ok)
 */
export function validatePart(p) {
  const errs = [];
  if (!p || typeof p !== "object") return ["not an object"];
  if (p.version !== 1) errs.push("version must be 1");
  if (!/^[\w-]{11}$/.test(p.video || "")) errs.push("video must be an 11-char YouTube id");
  if (p.part !== null && !(Number.isInteger(p.part) && p.part > 0)) errs.push("part must be a positive integer or null");
  if (!Array.isArray(p.cards)) return errs.concat("cards must be an array");
  const ids = new Set();
  p.cards.forEach((/** @type {any} */ c, /** @type {number} */ i) => {
    const w = "cards[" + i + "]";
    if (!c || typeof c.id !== "string" || !c.id) { errs.push(w + ".id missing"); return; }
    if (ids.has(c.id)) errs.push(w + ".id duplicate " + c.id);
    ids.add(c.id);
    if (!(typeof c.start === "number" && typeof c.end === "number" && c.end > c.start && c.start >= 0)) errs.push(w + " start/end invalid");
    if (typeof c.en !== "string" || typeof c.zh !== "string") errs.push(w + " en/zh must be strings");
    if (c.mark !== "ok" && c.mark !== "q") errs.push(w + ".mark must be ok or q");
    if (c.review != null) {
      if (typeof c.review !== "object") errs.push(w + ".review must be an object");
      else if (c.review.verdict && !["ok", "close", "wrong"].includes(c.review.verdict)) errs.push(w + ".review.verdict must be ok, close or wrong");
    }
  });
  if (p.summary != null && (typeof p.summary !== "object" || (p.summary.patterns && !Array.isArray(p.summary.patterns))))
    errs.push("summary.patterns must be an array");
  return errs;
}
