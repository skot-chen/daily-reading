// Pure helpers shared by the page (app.js) and the tests. No DOM, no network.

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

/** "Part 14" in a title → 14 */
export function partFromTitle(title) {
  const m = String(title || "").match(/\bpart\s*(\d{1,3})\b/i);
  return m ? Number(m[1]) : null;
}

/** 328.4 → "05:28" (h:mm:ss above an hour) */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
}
