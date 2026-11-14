// Daily Reading — page logic. Pure logic lives in lib.js (tested); this file is DOM, player and sync.
import { parseVideoId, partFromTitle, fmtTime, parseTime, newPart, newCard, clampRange, sortCards, deleteCard, mergeParts,
  partStats, partPath, validatePart } from "./lib.js";

const NOTES_REPO = "skot-chen/daily-reading-notes";

// ---------- storage (this browser) ----------
let storageBroken = false;
const store = {
  get(k, d) {
    let raw = null;
    try { raw = localStorage.getItem("dr." + k); } catch { return d; }
    if (raw == null) return d;
    try { return JSON.parse(raw); } catch {
      // Never overwrite unreadable data: keep a copy aside so nothing is lost.
      try { localStorage.setItem("dr." + k + ".broken-" + Date.now(), raw); } catch { /* full */ }
      storageBroken = true;
      return d;
    }
  },
  /** @returns {boolean} false if the browser refused to save (full / private mode) */
  set(k, v) { try { localStorage.setItem("dr." + k, JSON.stringify(v)); return true; } catch { return false; } },
};
/** @type {Record<string, any>} video id → Part */
let parts = store.get("parts", {});
/** @type {Record<string, string>} video id → `updated` value last pushed/pulled */
let synced = store.get("synced", {});
let shas = store.get("shas", {});
/** @type {Record<string, string>} video id → when the learner deleted the whole Part (removed from the repo on next sync) */
let deletedParts = store.get("deletedParts", {});
let warnedFull = false;
function persist() {
  const ok = store.set("parts", parts) && store.set("synced", synced) && store.set("shas", shas);
  if (!ok && !warnedFull) { warnedFull = true; toast("⚠️ 这个浏览器存不下了，刚才的修改可能会丢。Storage is full — connect sync or free space."); }
  if (ok) warnedFull = false;
}
/** Save a Part. If the page still holds an older copy (a sync replaced it meanwhile), merge instead of overwriting. */
function savePart(p) {
  p.updated = new Date().toISOString();
  const cur = parts[p.video];
  parts[p.video] = cur && cur !== p ? mergeParts(cur, p) : p;
  persist(); scheduleSync();
}function uid() { return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ---------- tiny DOM helper ----------
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
const $app = document.getElementById("app");
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------- YouTube player (a fresh one per page view) ----------
let player = null, playerReady = false, currentVideo = null, rangeEnd = null, rangeTimer = null;
const ytReady = new Promise((resolve) => {
  window.onYouTubeIframeAPIReady = resolve;
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  s.onerror = () => toast("YouTube 播放器加载失败，检查网络。Couldn't load the YouTube player.");
  document.head.append(s);
});
/** Create a fresh player inside `host` (moving an iframe in the page reloads it and breaks the API link). */
async function showVideo(video, host) {
  dropPlayer();
  const box = el("div", { class: "player-box" }, el("div", {}));
  host.append(box);
  await ytReady;
  if (!box.isConnected) return; // the learner already left this page
  currentVideo = video;
  player = new YT.Player(box.firstChild, {
    videoId: video, playerVars: { playsinline: 1, rel: 0, cc_load_policy: 0 },
    events: {
      onReady: () => { playerReady = true; learnTitle(); },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.CUED) learnTitle();
        // Listen without subtitles: YouTube turns captions back on after a pause, so switch them off on every play.
        if (e.data === YT.PlayerState.PLAYING) {
          try { player.unloadModule("captions"); player.unloadModule("cc"); } catch { /* not available */ }
        }
      },
    },
  });
}
function dropPlayer() {
  stopRange();
  if (player) { try { player.destroy(); } catch { /* already gone */ } }
  player = null; playerReady = false; currentVideo = null;
}
/** Fill in title / Part number from the video once YouTube knows it. */
function learnTitle() {
  const p = parts[currentVideo];
  const d = player && player.getVideoData && player.getVideoData();
  if (!p || !d || !d.title || d.video_id !== p.video) return;
  let changed = false;
  if (!p.title) { p.title = d.title; changed = true; }
  if (p.part == null && partFromTitle(d.title)) { p.part = partFromTitle(d.title); changed = true; }
  if (changed) { savePart(p); if (route().view === "part") renderPartHead(p); }
}
function stopRange() { rangeEnd = null; clearInterval(rangeTimer); }
function playRange(video, start, end, rate) {
  if (!playerReady) return toast("播放器还在加载… Player is loading…");
  if (currentVideo !== video) { player.loadVideoById({ videoId: video, startSeconds: start }); currentVideo = video; }
  else player.seekTo(start, true);
  player.setPlaybackRate(rate || 1);
  player.playVideo();
  stopRange();
  rangeEnd = end;
  rangeTimer = setInterval(() => {
    if (rangeEnd != null && player.getCurrentTime() >= rangeEnd) {
      player.pauseVideo(); player.setPlaybackRate(1); stopRange();
    }
  }, 100);
}

// ---------- routing: #/  #/v/<id>  #/review ----------
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("v/")) return { view: "part", video: h.slice(2) };
  if (h.startsWith("review")) return { view: "review", video: h.split("/")[1] || "" };
  return { view: "shelf" };
}
window.addEventListener("hashchange", render);
function render() {
  dropPlayer();
  rec = null; clearInterval(recTimer); recBtn = null;
  const r = route();
  document.body.classList.toggle("wide", r.view === "part");
  document.querySelectorAll("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === r.view ? "page" : "false"));
  $app.replaceChildren();
  if (r.view === "part" && parts[r.video]) renderPart(parts[r.video]);
  else if (r.view === "review") renderReview(r.video);
  else renderShelf();
  window.scrollTo(0, 0);
}

// ---------- shelf ----------
function sortedParts() {
  return Object.values(parts).sort((a, b) => (b.part ?? -1) - (a.part ?? -1) || (b.created > a.created ? 1 : -1));
}
function renderShelf() {
  const link = el("input", { type: "url", placeholder: "https://www.youtube.com/watch?v=…", "aria-label": "YouTube link 视频链接", required: true });
  const num = el("input", { type: "number", min: "1", max: "999", placeholder: "14", "aria-label": "Part number 第几集", class: "num" });
  const err = el("p", { class: "err", role: "alert" });
  link.addEventListener("input", () => { err.textContent = ""; });
  const form = el("form", { class: "start", onsubmit: (e) => {
    e.preventDefault();
    const id = parseVideoId(link.value);
    if (!id) { err.textContent = "这不是 YouTube 链接。Paste a YouTube video link."; link.focus(); return; }
    if (!parts[id]) {
      const n = parseInt(num.value, 10);
      parts[id] = newPart(id, n > 0 ? n : null, "", new Date());
      savePart(parts[id]);
    }
    location.hash = "#/v/" + id;
  } },
  el("label", { class: "lbl" }, "新的一集 New part"),
  el("div", { class: "row" }, link, num, el("button", { class: "btn primary", type: "submit" }, "开始 Start")),
  el("p", { class: "hint" }, "粘贴视频链接；第几集会从标题里自动识别，也可以自己填。"), err);

  const list = sortedParts();
  $app.append(
    el("section", { class: "page" }, form),
    el("section", { class: "page shelf" },
      el("h2", {}, "书架 Shelf"),
      list.length ? el("ul", { class: "parts" }, list.map((p) => {
        const s = partStats(p);
        return el("li", {}, el("a", { href: "#/v/" + p.video },
          el("span", { class: "pn" }, p.part ? "Part " + p.part : "Part ?"),
          el("span", { class: "pt" }, shortTitle(p.title) || p.video),
          el("span", { class: "ps" }, s.cards + " 句 sentences · ", el("b", { class: "red" }, s.q + " ❓"), " · " + s.reviewed + " 已批改 reviewed · " + p.created)),
          el("button", { class: "delbtn", "aria-label": "从书架删除这一集 Remove this part from the shelf", title: "从书架删除这一集 Remove part",
            onclick: () => removePart(p) }, "✕"));
      })) : el("p", { class: "hint" }, gh.token ? "还没有内容。Nothing here yet — start a new part above." :
        "还没有内容。这个浏览器里的练习只存在本机；到页面底部连接 GitHub 就能同步到其他设备。")),
    renderSyncPanel());
}
function shortTitle(t) { const m = String(t || "").split("|").map((x) => x.trim()); return m.length > 2 ? m[1] : t; }

// ---------- part page ----------
let headEl = null, listEl = null, recBtn = null;
/** While a sentence is being recorded: { video, id }. Start pressed → End not yet pressed. */
let rec = null, recTimer = null;
function renderPart(p) {
  rec = null; clearInterval(recTimer);
  headEl = el("div", { class: "part-head" });
  renderPartHead(p);
  const host = el("div", { class: "player-host" });
  recBtn = el("button", { class: "btn mark", onclick: () => toggleRec(p) });
  drawRecBtn();
  const back = el("select", { "aria-label": "开始时往前倒几秒 Start a little earlier",
    onchange: (e) => store.set("back", Number(e.target.value)) },
    [0, 1, 2, 3, 4, 5, 8, 10].map((s) => el("option", { value: s, selected: s === markBack() }, s ? "开始时往前倒 " + s + " 秒" : "开始时不往前倒")));
  const theater = el("button", { class: "btn sm theater-btn", "aria-pressed": store.get("theater", false) ? "true" : "false",
    onclick: () => { const on = !store.get("theater", false); store.set("theater", on); section.classList.toggle("theater", on); theater.setAttribute("aria-pressed", on ? "true" : "false"); } },
    "⤢ 大视频 Big video");
  listEl = el("div", { class: "cards" });
  const section = el("section", { class: "page part" + (store.get("theater", false) ? " theater" : "") }, headEl,
    el("div", { class: "stage" }, host,
      el("div", { class: "mark-row" }, recBtn),
      el("ol", { class: "steps" },
        el("li", {}, "听到难的句子，点 ", el("b", {}, "开始 Start"), "（视频继续播放）"),
        el("li", {}, "这句话说完，点 ", el("b", {}, "结束 End"), "（视频暂停）"),
        el("li", {}, "中间这一段就存成一张卡片。键盘：M")),
      el("div", { class: "row tools" }, back, theater)),
    el("div", { class: "notes" }, listEl, renderSummary(p),
      el("p", { class: "back" }, el("a", { href: "#/" }, "← 书架 Shelf"), " · ", el("a", { href: "#/review/" + p.video }, "复习这一集 Review ❓")),
      el("p", { class: "back" }, el("button", { class: "btn sm danger", onclick: () => clearCards(p) }, "清空这一集的卡片 Clear all cards"))));
  $app.append(section);
  showVideo(p.video, host);
  renderCards(p);
}
function drawRecBtn() {
  if (!recBtn) return;
  if (rec) {
    const c = parts[rec.video]?.cards.find((x) => x.id === rec.id);
    const now = playerReady ? player.getCurrentTime() : c ? c.start : 0;
    recBtn.classList.add("recording");
    recBtn.replaceChildren("■ 结束 End", el("small", {}, "正在记录 " + fmtTime(c ? c.start : 0) + " → " + fmtTime(now) + " · 这句说完就点"));
  } else {
    recBtn.classList.remove("recording");
    recBtn.replaceChildren("● 开始 Start", el("small", {}, "听到难的句子就点 · 键盘 M"));
  }
}
function renderPartHead(p) {
  if (!headEl) return;
  const num = el("input", { type: "number", min: "1", class: "num", value: p.part ?? "", "aria-label": "Part number 第几集",
    onchange: (e) => { const n = parseInt(e.target.value, 10); p.part = n > 0 ? n : null; savePart(p); } });
  headEl.replaceChildren(el("h2", {}, "Part ", num), el("p", { class: "title" }, p.title || "…"));
}
function toggleRec(p) { if (rec) endRec(); else startRec(p); }
/** Start: a new card begins now (minus the chosen lead-in); the video keeps playing. */
function startRec(p) {
  if (!playerReady) return toast("播放器还在加载… Player is loading…");
  const t = player.getCurrentTime();
  stopRange();
  p = parts[p.video];
  const c = newCard(t, new Date(), uid(), markBack());
  c.end = clampRange(c.start, t + 5).end; // until End is pressed
  const near = p.cards.find((x) => Math.abs(x.start - c.start) < 1);
  if (near) return toast("这里已经有一张卡片了。There's already a card here.");
  p.cards = sortCards(p.cards.concat(c));
  savePart(p);
  renderCards(parts[p.video]);
  rec = { video: p.video, id: c.id };
  if (player.getPlayerState() !== YT.PlayerState.PLAYING) player.playVideo();
  const n = listEl.querySelector('[data-id="' + c.id + '"]');
  if (n) { n.classList.add("new", "recording"); n.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  drawRecBtn();
  clearInterval(recTimer); recTimer = setInterval(drawRecBtn, 250);
}
/** End: the card ends now; the video pauses so you can write. */
function endRec() {
  const r = rec; rec = null; clearInterval(recTimer);
  drawRecBtn();
  if (!r || !playerReady) return;
  const t = player.getCurrentTime();
  player.pauseVideo();
  const P = parts[r.video], c = P && P.cards.find((x) => x.id === r.id);
  if (!c) return;
  Object.assign(c, clampRange(c.start, t)); c.t = new Date().toISOString();
  savePart(P); renderCards(parts[r.video]);
  const n = listEl.querySelector('[data-id="' + c.id + '"]');
  if (n) { n.scrollIntoView({ block: "center", behavior: "smooth" }); n.classList.add("new"); }
  toast("存好了 " + fmtTime(c.start) + "–" + fmtTime(c.end) + "。Saved.");
}
function markBack() { const v = Number(store.get("back", 2)); return v >= 0 && v <= 60 ? v : 2; }
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k !== "m" && k !== "e") return;
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
  const r = route();
  if (r.view !== "part" || !parts[r.video]) return;
  e.preventDefault();
  if (k === "m") toggleRec(parts[r.video]); else if (rec) endRec();
});
/** Remove every card of a Part but keep the Part (video, number, AI summary). */
function clearCards(p) {
  const P = parts[p.video];
  const n = P ? P.cards.length : 0;
  if (!n) return toast("这一集还没有卡片。No cards to clear.");
  if (!confirm("清空这一集的 " + n + " 张卡片？视频和这一集会保留。删除的卡片找不回来。\n"
    + "Delete all " + n + " cards? The video and this part stay. This can't be undone.")) return;
  const now = new Date();
  if (rec && rec.video === p.video) { rec = null; clearInterval(recTimer); drawRecBtn(); }
  for (const c of P.cards.slice()) deleteCard(P, c.id, now);
  savePart(P); renderCards(parts[p.video]);
  toast("已清空 " + n + " 张卡片。Cleared.");
}
/** Delete a whole Part from the shelf (here and, with sync, in the notes repo). */
function removePart(p) {
  const n = parts[p.video] ? parts[p.video].cards.length : 0;
  if (!confirm("从书架删除「" + (p.part ? "Part " + p.part : shortTitle(p.title) || p.video) + "」和它的 " + n + " 张卡片？删除后找不回来。\n"
    + "Remove this part and its " + n + " cards from the shelf? This can't be undone.")) return;
  delete parts[p.video]; delete synced[p.video];
  deletedParts[p.video] = new Date().toISOString();
  store.set("deletedParts", deletedParts);
  persist(); scheduleSync();
  if (route().view === "shelf") render(); else location.hash = "#/";
  toast("已删除。Deleted.");
}
function renderCards(p) {
  listEl.replaceChildren(...(p.cards.length ? p.cards.map((c) => cardEl(p, c)) :
    [el("p", { class: "hint empty" }, "播放视频，不看字幕听。听不懂的地方点「标记 Mark」，这里会出现一张句子卡片。")]));
}
/**
 * A small in-page dialog with several choices (confirm() only has two). Esc / backdrop = "cancel".
 * @param {{title: string, body: (string|null)[], buttons: {value: string, label: string, sub?: string, primary?: boolean}[]}} o
 * @returns {Promise<string>}
 */
function ask(o) {
  return new Promise((resolve) => {
    const d = el("dialog", { class: "ask", "aria-labelledby": "ask-title" },
      el("h3", { id: "ask-title" }, o.title),
      o.body.filter(Boolean).map((line) => el("p", {}, line)),
      el("div", { class: "ask-btns" }, o.buttons.map((b) => el("button", {
        class: "btn" + (b.primary ? " primary" : ""), value: b.value,
        onclick: () => { d.close(b.value); } }, b.label, b.sub ? el("small", {}, b.sub) : null))));
    d.addEventListener("close", () => { resolve(d.returnValue || "cancel"); d.remove(); });
    d.addEventListener("click", (e) => { if (e.target === d) d.close("cancel"); });
    document.body.append(d);
    d.showModal();
    d.querySelector(".btn.primary")?.focus();
  });
}
/** One Start/End row: a free time field + ±1 s + "use the video's current time". */
function adjRow(label, value, set) {
  const err = el("span", { class: "err", role: "alert" });
  const inp = el("input", { type: "text", inputmode: "decimal", class: "tm", value: fmtTime(value, true), "aria-label": label,
    onchange: (e) => {
      const v = parseTime(e.target.value);
      if (v == null) { err.textContent = "格式：5:28 或 328 · Use m:ss"; e.target.focus(); return; }
      set(v);
    },
    oninput: () => { err.textContent = ""; } });
  return el("div", { class: "adj-row" }, el("span", {}, label), inp,
    el("button", { class: "btn sm", onclick: () => set(value - 1) }, "−1s"),
    el("button", { class: "btn sm", onclick: () => set(value + 1) }, "+1s"),
    el("button", { class: "btn sm", onclick: () => { if (playerReady) set(player.getCurrentTime()); else toast("播放器还在加载… Player is loading…"); } },
      "用现在的时间 Now"), err);
}
function autosize(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; }
function cardEl(p, c) {
  const touch = () => { c.t = new Date().toISOString(); savePart(p); };
  const area = (field, label, ph) => {
    const t = el("textarea", { class: field, rows: "1", placeholder: ph, "aria-label": label,
      oninput: (e) => { c[field] = e.target.value; autosize(e.target); touch(); } });
    t.value = c[field] || "";
    requestAnimationFrame(() => autosize(t));
    return t;
  };
  const zh = area("zh", "我的中文 My Chinese", "说出或写下中文 Say it in Chinese");
  const range = () => fmtTime(c.start) + "–" + fmtTime(c.end);
  const openEdit = (n) => { const b = n.querySelector(".edit-time"); if (b) { b.hidden = false; n.querySelector("button.range").setAttribute("aria-expanded", "true"); } };
  const setRange = async (s, e) => {
    const next = clampRange(s, e);
    const overlapsOld = next.start < c.end && next.end > c.start;
    if (!overlapsOld) {
      // The new time is a different place in the video: ask instead of silently moving the card.
      const others = parts[p.video].cards.filter((x) => x.id !== c.id && next.start < x.end && next.end > x.start);
      const choice = await ask({
        title: "新的时间不在这张卡片原来的区间里",
        body: [
          "原来 Before：" + fmtTime(c.start, true) + "–" + fmtTime(c.end, true),
          "新的 New：" + fmtTime(next.start, true) + "–" + fmtTime(next.end, true),
          others.length ? "⚠️ 和已有的卡片重叠 Overlaps: " + others.map((x) => fmtTime(x.start) + "–" + fmtTime(x.end)).join("，") : null,
          "要怎么做？ What should happen?",
        ],
        buttons: [
          { value: "new", label: "新建一张卡片", sub: "New card · 这张不变", primary: true },
          { value: "move", label: "移动这张卡片", sub: "Move · 英文和中文跟着走" },
          { value: "cancel", label: "取消", sub: "Cancel" },
        ],
      });
      if (choice === "cancel") { const n = cardEl(parts[p.video], c); node.replaceWith(n); openEdit(n); return; }
      if (choice === "new") {
        const P0 = parts[p.video];
        const nc = { ...newCard(next.start, new Date(), uid(), 0), ...next };
        P0.cards = sortCards(P0.cards.concat(nc));
        savePart(P0); renderCards(parts[p.video]);
        const n = listEl.querySelector('[data-id="' + nc.id + '"]');
        if (n) { n.scrollIntoView({ block: "center", behavior: "smooth" }); n.classList.add("new"); }
        toast("新建了 " + fmtTime(nc.start) + "–" + fmtTime(nc.end) + "，原来的卡片不变。New card added.");
        return;
      }
    }
    Object.assign(c, next); touch();
    const P = parts[p.video];
    const order = P.cards.map((x) => x.id).join();
    P.cards = sortCards(P.cards);
    if (P.cards.map((x) => x.id).join() !== order) { // moved past another card: redraw in time order, keep Adjust open
      persist(); renderCards(P);
      const n = listEl.querySelector('[data-id="' + c.id + '"]');
      if (n) { openEdit(n); n.scrollIntoView({ block: "center", behavior: "smooth" }); n.classList.add("new"); }
      toast("卡片移到了 " + fmtTime(c.start) + "，按时间排好了。Card moved.");
    } else { const n = cardEl(P, c); node.replaceWith(n); openEdit(n); }
  };
  const editBox = el("div", { class: "edit-time", hidden: true },
    // Moving one edge past the other keeps the sentence length (a jump to another place in the video).
    adjRow("开始 Start", c.start, (v) => setRange(v, v >= c.end ? v + (c.end - c.start) : c.end)),
    adjRow("结束 End", c.end, (v) => setRange(v <= c.start ? v - (c.end - c.start) : c.start, v)),
    el("p", { class: "hint" }, "直接改时间（如 5:28 或 5:28.5），或者把视频播到想要的位置，点「用现在的时间」。"));
  const rangeBtn = el("button", { class: "range", "aria-expanded": "false", title: "修改时间 Edit time",
    onclick: () => { const open = editBox.hidden; editBox.hidden = !open; rangeBtn.setAttribute("aria-expanded", String(open));
      if (open) editBox.querySelector("input")?.focus(); } }, range(), " ✎");
  const node = el("article", { class: "card " + (c.mark === "q" ? "q" : "ok"), "data-id": c.id },
    el("div", { class: "card-top" },
      el("button", { class: "time", title: "重播 Replay", onclick: () => playRange(p.video, c.start, c.end, 1) }, fmtTime(c.start)),
      rangeBtn,
      el("button", { class: "markbtn", "aria-pressed": c.mark === "ok" ? "true" : "false",
        onclick: () => { c.mark = c.mark === "q" ? "ok" : "q"; touch(); node.replaceWith(cardEl(p, c)); } },
        c.mark === "q" ? "❓ 不确定 Not sure" : "✅ 懂了 Got it"),
      el("button", { class: "delbtn", "aria-label": "删除这张卡片 Delete this card", title: "删除 Delete", onclick: () => {
        if (!confirm("删除这张卡片？Delete this card?\n" + fmtTime(c.start) + "–" + fmtTime(c.end) + (c.en ? "  " + c.en.slice(0, 60) : ""))) return;
        if (rec && rec.id === c.id) { rec = null; clearInterval(recTimer); drawRecBtn(); }
        deleteCard(p, c.id, new Date()); savePart(p); renderCards(parts[p.video]); toast("已删除。Deleted.");
      } }, "✕")),
    editBox,
    el("label", { class: "lbl" }, "English"),
    area("en", "English sentence", "粘贴英文 Paste the English (YouTube ⋯ → 显示转写稿)"),
    el("label", { class: "lbl" }, "我的中文"),
    el("div", { class: "zh-row" }, zh, micButton(zh, (v) => { c.zh = v; touch(); })),
    el("div", { class: "actions" },
      el("button", { class: "btn", onclick: () => playRange(p.video, c.start, c.end, 1) }, "▶ 重播 Replay"),
      el("button", { class: "btn", onclick: () => playRange(p.video, c.start, c.end, 0.75) }, "🐢 慢放 0.75×")),
    reviewEl(c));
  return node;
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function micButton(textarea, onText) {
  let rec = null;
  const b = el("button", { class: "btn mic", type: "button", "aria-label": "说中文 Speak Chinese", title: "说中文 Speak Chinese",
    onclick: () => {
      if (!SR) return toast("这个浏览器不能用 🎤。Mac：按两下 Fn 用系统听写；iPhone：键盘上的 🎤。");
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = "zh-CN"; rec.interimResults = false; rec.continuous = false;
      rec.onresult = (e) => {
        const said = Array.from(e.results).map((r) => r[0].transcript).join("");
        textarea.value = (textarea.value ? textarea.value + " " : "") + said;
        autosize(textarea); onText(textarea.value);
      };
      rec.onerror = (e) => toast(e.error === "not-allowed" ? "麦克风没有权限。Allow the microphone first." : "没听清，再试一次。Didn't catch that.");
      rec.onend = () => { rec = null; b.classList.remove("on"); };
      b.classList.add("on"); rec.start();
    } });
  b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
    + '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  return b;
}
const VERDICT = { ok: "✅ 意思对 Right", close: "⚠️ 小偏差 Close", wrong: "❌ 理解错了 Missed it" };
function reviewEl(c) {
  const r = c.review;
  if (!r || !r.ref) return null;
  return el("details", { class: "review" }, el("summary", {}, "AI 批改 Review"),
    el("p", {}, el("b", {}, "参考翻译 "), r.ref),
    r.verdict || r.note ? el("p", {}, el("b", {}, VERDICT[r.verdict] || ""), r.note ? " — " + r.note : "") : null,
    r.point ? el("p", {}, el("b", {}, "难点 "), r.point) : null);
}
function renderSummary(p) {
  const s = p.summary;
  if (!s) return null;
  return el("section", { class: "summary" }, el("h3", {}, "AI 总结 Summary"),
    s.stuck ? el("p", {}, el("b", {}, "主要卡在 "), s.stuck) : null,
    s.patterns && s.patterns.length ? el("ul", {}, s.patterns.map((x) => el("li", {}, x))) : null,
    s.next ? el("p", {}, el("b", {}, "下次注意 "), s.next) : null);
}

// ---------- review mode (phone friendly) ----------
function renderReview(only) {
  const pool = sortedParts().filter((p) => !only || p.video === only)
    .flatMap((p) => p.cards.filter((c) => c.mark === "q").map((c) => ({ p, c })));
  const sel = el("select", { "aria-label": "Which part 哪一集", onchange: (e) => { location.hash = "#/review" + (e.target.value ? "/" + e.target.value : ""); } },
    el("option", { value: "" }, "全部 All parts"),
    sortedParts().map((p) => el("option", { value: p.video, selected: p.video === only }, p.part ? "Part " + p.part : shortTitle(p.title) || p.video)));
  const host = el("div", { class: "player-host small" });
  const box = el("div", { class: "rv" });
  $app.append(el("section", { class: "page review-page" }, el("h2", {}, "复习 Review ❓"), sel, host, box));
  if (!pool.length) {
    box.append(el("p", { class: "hint" }, "没有 ❓ 句子。No ❓ sentences here — great!"));
    return;
  }
  let i = 0, step = 0;
  const show = () => {
    const { p, c } = pool[i];
    if (!player) showVideo(p.video, host);
    else if (currentVideo !== p.video && playerReady) { player.cueVideoById(p.video); currentVideo = p.video; }
    const play = (rate) => playRange(p.video, c.start, c.end, rate);
    const done = () => box.replaceChildren(el("p", { class: "hint" }, "复习完了！没有剩下的 ❓ 句子。All done — no ❓ left."));
    box.replaceChildren(...[
      el("p", { class: "rv-count" }, (i + 1) + " / " + pool.length + " · " + (p.part ? "Part " + p.part : "") + " · " + fmtTime(c.start)),
      el("div", { class: "actions big" },
        el("button", { class: "btn primary", onclick: () => play(1) }, "▶ 听 Listen"),
        el("button", { class: "btn", onclick: () => play(0.75) }, "🐢 0.75×")),
      step >= 1 ? el("p", { class: "rv-en" }, c.en || "（没有英文 no English yet）") :
        el("button", { class: "btn wide", onclick: () => { step = 1; show(); } }, "显示英文 Show English"),
      step >= 2 ? el("div", { class: "rv-zh" }, el("p", {}, el("b", {}, "我的中文 "), c.zh || "—"), reviewEl(c)) :
        step === 1 ? el("button", { class: "btn wide", onclick: () => { step = 2; show(); } }, "显示中文和批改 Show my Chinese") : null,
      el("div", { class: "actions" },
        el("button", { class: "btn", disabled: i === 0, onclick: () => { i--; step = 0; show(); } }, "← 上一句"),
        el("button", { class: "btn", onclick: () => {
          c.mark = "ok"; c.t = new Date().toISOString(); savePart(p); toast("改成 ✅ 了。Marked as got it.");
          pool.splice(i, 1); step = 0;
          if (!pool.length) return done();
          if (i >= pool.length) i = pool.length - 1;
          show();
        } }, "✅ 懂了 Got it"),
        el("button", { class: "btn primary", onclick: () => { if (i < pool.length - 1) { i++; step = 0; show(); } else toast("这是最后一句。That was the last one."); } }, "下一句 Next →")),
    ].filter(Boolean));
    const det = box.querySelector("details.review"); if (det) det.open = true;
  };
  show();
}

// ---------- sync with the private notes repo ----------
const gh = { token: store.get("token", ""), busy: false, timer: null, again: false, fails: 0, gen: 0 };
function b64e(s) { const b = new TextEncoder().encode(s); let x = ""; for (const c of b) x += String.fromCharCode(c); return btoa(x); }
function b64d(s) { const x = atob(s.replace(/\s/g, "")); return new TextDecoder().decode(Uint8Array.from(x, (c) => c.charCodeAt(0))); }
function api(path, method, body) {
  return fetch("https://api.github.com/repos/" + NOTES_REPO + path, { method: method || "GET", cache: "no-store",
    headers: { Authorization: "Bearer " + gh.token, Accept: "application/vnd.github+json" },
    body: body ? JSON.stringify(body) : undefined });
}
function syncMsg(m) { const x = document.getElementById("sync-msg"); if (x) x.textContent = m; store.set("syncMsg", m); }
function isRateLimit(e) { return e instanceof Response && (e.status === 429 || (e.status === 403 && e.headers.get("x-ratelimit-remaining") === "0")); }
function ghError(e) {
  const s = e && e.status;
  if (isRateLimit(e)) return "✗ GitHub 暂时限制了请求，稍后自动再试。Rate limited, will retry.";
  if (s === 401) return "✗ 钥匙无效或已过期。Token invalid or expired.";
  if (s === 403 || s === 404) return "✗ 钥匙不能读写 " + NOTES_REPO + "（Contents 要选 Read and write）。";
  if (s) return "✗ 同步失败 (" + s + ")，稍后自动再试。Sync failed, will retry.";
  return "✗ 连不上 GitHub（网络？），稍后自动再试。Offline? Will retry.";
}
/** Token problems need the learner; everything else is retried with a growing wait. */
function needsLearner(e) { return !!e && !isRateLimit(e) && (e.status === 401 || e.status === 403 || e.status === 404); }
function pending() { return Object.values(parts).filter((p) => synced[p.video] !== p.updated); }
function scheduleSync(delay) {
  if (!gh.token) return;
  clearTimeout(gh.timer);
  gh.timer = setTimeout(() => sync(), delay || 3000);
}
function backoff() { return Math.min(300000, 3000 * 2 ** Math.min(gh.fails, 7)); } // 3 s … 5 min
async function readRemote(video) {
  const r = await api("/contents/parts/" + video + ".json?ref=main");
  if (r.status === 404) return null;
  if (!r.ok) throw r;
  const j = await r.json();
  let part;
  try { part = JSON.parse(b64d(j.content)); } catch { part = null; }
  const errs = part ? validatePart(part) : ["not valid JSON"];
  return { sha: j.sha, part: errs.length ? null : part, errs };
}
/** Pull every Part from the repo, merge, then push what this browser changed. One bad file never blocks the rest. */
async function sync() {
  if (!gh.token) return;
  if (gh.busy) { gh.again = true; return; }
  const gen = gh.gen;
  gh.busy = true; syncMsg("⏳ 正在同步… Syncing…");
  let pulled = 0, pushed = 0, fatal = null;
  const bad = [], failed = [];
  try {
    const r = await api("/contents/parts?ref=main");
    if (!r.ok && r.status !== 404) throw r;
    const files = r.status === 404 ? [] : await r.json();
    for (const f of files) {
      if (gen !== gh.gen) break;
      if (!/^[\w-]{11}\.json$/.test(f.name)) continue;
      const video = f.name.slice(0, 11);
      if (deletedParts[video]) continue;
      if (shas[video] === f.sha && parts[video]) continue;
      const remote = await readRemote(video);
      if (!remote) continue;
      if (!remote.part) { bad.push(f.name); continue; }
      const local = parts[video];
      const wasPending = local && synced[video] !== local.updated;
      const merged = local ? mergeParts(local, remote.part) : remote.part;
      parts[video] = merged; shas[video] = remote.sha;
      // Not pending: we now equal the repo — unless the merge kept something the repo lacks (then push it back).
      if (!wasPending) synced[video] = JSON.stringify(merged) === JSON.stringify(remote.part) ? merged.updated : "";
      pulled++;
    }
    for (const video of Object.keys(deletedParts)) {
      if (gen !== gh.gen) break;
      try {
        const remote = await readRemote(video);
        if (remote) {
          const del = await api("/contents/parts/" + video + ".json", "DELETE", { branch: "main", message: "Delete part " + video, sha: remote.sha });
          if (!del.ok && del.status !== 404) throw del;
        }
        delete deletedParts[video]; delete shas[video]; store.set("deletedParts", deletedParts);
      } catch (e) {
        if (needsLearner(e)) throw e;
        failed.push(e);
      }
    }
    for (const p of pending()) {
      if (gen !== gh.gen) break;
      const before = p.updated;
      try {
        const remote = await readRemote(p.video);
        if (remote && !remote.part) { bad.push(p.video + ".json"); continue; }
        const merged = remote ? mergeParts(p, remote.part) : { ...p, cards: p.cards.slice() };
        const put = await api("/contents/" + partPath(p), "PUT", { branch: "main",
          message: "Practice " + (merged.part ? "Part " + merged.part : merged.video) + " (" + merged.cards.length + " cards)",
          content: b64e(JSON.stringify(merged, null, 2) + "\n"), sha: remote ? remote.sha : undefined });
        if (!put.ok) throw put;
        const j = await put.json();
        shas[p.video] = j.content.sha;
        if (parts[p.video] === p && p.updated === before) { parts[p.video] = merged; synced[p.video] = merged.updated; }
        else { parts[p.video] = mergeParts(parts[p.video], merged); gh.again = true; } // edited while uploading: stays pending
        pushed++;
      } catch (e) {
        if (needsLearner(e)) throw e;
        if (e instanceof Response && (e.status === 409 || e.status === 422)) gh.again = true; // someone pushed meanwhile
        failed.push(e);
      }
    }
  } catch (e) { fatal = e; }
  persist();
  gh.busy = false;
  if (gen !== gh.gen) return;
  const err = fatal || failed[0];
  if (err) {
    syncMsg(ghError(err));
    if (!needsLearner(err)) { gh.fails++; scheduleSync(backoff()); }
  } else {
    gh.fails = 0;
    syncMsg("✓ 已同步 Synced " + new Date().toTimeString().slice(0, 5) + (pulled || pushed ? "（下载 " + pulled + "，上传 " + pushed + "）" : "")
      + (bad.length ? " · ⚠️ 格式有问题的文件已跳过 skipped broken file: " + bad.join(", ") : ""));
    if (gh.again) { gh.again = false; scheduleSync(); }
  }
  if (pulled) refreshAfterPull();
}
/** After pulling: redraw, but never under the learner's fingers (typing) and never restart the video. */
function refreshAfterPull() {
  const r = route();
  if (r.view === "shelf") return render();
  if (r.view !== "part" || !parts[r.video]) return;
  if (!listEl || !listEl.isConnected) return render(); // the Part arrived after the page was opened
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) return;
  const p = parts[r.video];
  renderPartHead(p); renderCards(p);
  const s = renderSummary(p), old = document.querySelector(".summary");
  if (old) old.replaceWith(s || ""); else if (s) listEl.after(s);
}
function renderSyncPanel() {
  const box = el("section", { class: "page sync" });
  const draw = () => {
    const tokenIn = el("input", { type: "password", autocomplete: "off", placeholder: "github_pat_…", "aria-label": "GitHub token 钥匙" });
    box.replaceChildren(el("h2", {}, "☁ 同步 Sync"), ...(
      gh.token ? [
        el("p", {}, "已连接 Connected → ", el("code", {}, NOTES_REPO), "（私密仓库，别人看不到 private）"),
        el("p", { id: "sync-msg", class: "hint", role: "status" }, store.get("syncMsg", "")),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => { gh.fails = 0; sync(); } }, "↻ 现在同步 Sync now"),
          el("button", { class: "btn danger", onclick: () => {
            if (!confirm("在这个浏览器里删掉钥匙？练习不会被删除。Forget the token on this device?")) return;
            gh.gen++; clearTimeout(gh.timer); gh.token = ""; store.set("token", ""); store.set("syncMsg", ""); draw();
          } }, "🔑 删掉钥匙 Forget token")),
      ] : [
        el("p", { class: "hint" }, "现在只存在这个浏览器。粘贴 GitHub 钥匙后，会同步到私密仓库 ", el("code", {}, NOTES_REPO),
          "，手机和电脑都能用，Mac 上的 AI 也能批改。钥匙只保存在这个浏览器里。"),
        el("p", { class: "hint" }, "新建钥匙：", el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener" },
          "GitHub → Fine-grained token"), " → Repository access 只选 daily-reading-notes → Permissions: Contents = Read and write。"),
        el("p", { id: "sync-msg", class: "hint", role: "status" }),
        el("div", { class: "row" }, tokenIn, el("button", { class: "btn primary", onclick: async () => {
          const t = tokenIn.value.trim(); if (!t) { syncMsg("先粘贴钥匙。Paste the token first."); tokenIn.focus(); return; }
          gh.token = t; syncMsg("⏳ 检查钥匙… Checking…");
          try {
            const r = await api("");
            if (!r.ok) throw r;
            // Read access is proven here; missing write access shows a clear message on the first upload.
            gh.fails = 0; store.set("token", t); store.set("syncMsg", ""); draw(); sync();
          } catch (e) {
            gh.token = "";
            syncMsg(e && e.status ? ghError(e).replace("稍后自动再试", "请再试一次").replace("will retry", "try again")
              : "✗ 连不上 GitHub（网络？），请再试一次。Offline? Try again.");
          }
        } }, "连接 Connect")),
      ]));
  };
  draw();
  return box;
}

// ---------- start ----------
render();
if (storageBroken) toast("⚠️ 本机保存的数据有一部分读不出来，已另存一份备份。Some saved data was unreadable; a backup copy was kept.");
if (gh.token) sync();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
