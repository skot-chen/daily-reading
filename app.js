// Daily Reading — page logic. Pure logic lives in lib.js (tested); this file is DOM, player and sync.
import { parseVideoId, partFromTitle, fmtTime, newPart, newCard, clampRange, sortCards, deleteCard, mergeParts,
  partStats, partPath } from "./lib.js";

const NOTES_REPO = "skot-chen/daily-reading-notes";

// ---------- storage (this browser) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("dr." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("dr." + k, JSON.stringify(v)); } catch { /* private mode: keep in memory */ } },
};
/** @type {Record<string, any>} video id → Part */
let parts = store.get("parts", {});
/** @type {Record<string, string>} video id → `updated` value last pushed/pulled */
let synced = store.get("synced", {});
let shas = store.get("shas", {});
function persist() { store.set("parts", parts); store.set("synced", synced); store.set("shas", shas); }
function savePart(p) { p.updated = new Date().toISOString(); parts[p.video] = p; persist(); scheduleSync(); }
function uid() { return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

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
const $playerBox = document.getElementById("player-box");
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------- YouTube player (one for the whole page, moved between views) ----------
let player = null, playerReady = false, currentVideo = null, rangeEnd = null, rangeTimer = null, captionsOffFor = null;
const ytReady = new Promise((resolve) => {
  window.onYouTubeIframeAPIReady = resolve;
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  s.onerror = () => toast("YouTube 播放器加载失败，检查网络。Couldn't load the YouTube player.");
  document.head.append(s);
});
async function showVideo(video) {
  await ytReady;
  if (!player) {
    player = new YT.Player("player", {
      videoId: video, playerVars: { playsinline: 1, rel: 0, cc_load_policy: 0 },
      events: {
        onReady: () => { playerReady = true; learnTitle(); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.CUED) learnTitle();
          // Listen without subtitles: switch captions off once per video (the learner can still turn them on).
          if (e.data === YT.PlayerState.PLAYING && captionsOffFor !== currentVideo) {
            captionsOffFor = currentVideo;
            try { player.unloadModule("captions"); player.unloadModule("cc"); } catch { /* not available */ }
          }
        },
      },
    });
  } else if (currentVideo !== video && playerReady) {
    player.cueVideoById(video);
  }
  currentVideo = video;
}
function placePlayer(host) { $playerBox.hidden = !host; if (host) host.append($playerBox); else document.body.append($playerBox); }
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
  stopRange();
  if (player && playerReady) player.pauseVideo();
  const r = route();
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
  placePlayer(null);
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
          el("span", { class: "ps" }, s.cards + " 句 sentences · ", el("b", { class: "red" }, s.q + " ❓"), " · " + s.reviewed + " 已批改 reviewed · " + p.created)));
      })) : el("p", { class: "hint" }, gh.token ? "还没有内容。Nothing here yet — start a new part above." :
        "还没有内容。这个浏览器里的练习只存在本机；到页面底部连接 GitHub 就能同步到其他设备。")),
    renderSyncPanel());
}
function shortTitle(t) { const m = String(t || "").split("|").map((x) => x.trim()); return m.length > 2 ? m[1] : t; }

// ---------- part page ----------
let headEl = null, listEl = null;
function renderPart(p) {
  headEl = el("div", { class: "part-head" });
  renderPartHead(p);
  const host = el("div", { class: "player-host" });
  const markBtn = el("button", { class: "btn mark", onclick: () => mark(p) }, "标记 Mark", el("small", {}, "没听懂就点 · 键盘 M"));
  listEl = el("div", { class: "cards" });
  $app.append(el("section", { class: "page part" }, headEl, host, markBtn, listEl, renderSummary(p),
    el("p", { class: "back" }, el("a", { href: "#/" }, "← 书架 Shelf"), " · ", el("a", { href: "#/review/" + p.video }, "复习这一集 Review ❓"))));
  placePlayer(host);
  showVideo(p.video);
  renderCards(p);
}
function renderPartHead(p) {
  if (!headEl) return;
  const num = el("input", { type: "number", min: "1", class: "num", value: p.part ?? "", "aria-label": "Part number 第几集",
    onchange: (e) => { const n = parseInt(e.target.value, 10); p.part = n > 0 ? n : null; savePart(p); } });
  headEl.replaceChildren(el("h2", {}, "Part ", num), el("p", { class: "title" }, p.title || "…"));
}
function mark(p) {
  if (!playerReady) return toast("播放器还在加载… Player is loading…");
  const t = player.getCurrentTime();
  player.pauseVideo(); stopRange();
  const c = newCard(t, new Date(), uid());
  p.cards = sortCards(p.cards.concat(c));
  savePart(p);
  renderCards(p);
  const n = listEl.querySelector('[data-id="' + c.id + '"]');
  if (n) { n.scrollIntoView({ block: "center", behavior: "smooth" }); n.classList.add("new"); }
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "m" && e.key !== "M") return;
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
  const r = route();
  if (r.view === "part" && parts[r.video]) { e.preventDefault(); mark(parts[r.video]); }
});
function renderCards(p) {
  listEl.replaceChildren(...(p.cards.length ? p.cards.map((c) => cardEl(p, c)) :
    [el("p", { class: "hint empty" }, "播放视频，不看字幕听。听不懂的地方点「标记 Mark」，这里会出现一张句子卡片。")]));
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
  const setRange = (s, e) => { Object.assign(c, clampRange(s, e)); touch(); node.replaceWith(cardEl(p, c)); };
  const node = el("article", { class: "card " + (c.mark === "q" ? "q" : "ok"), "data-id": c.id },
    el("div", { class: "card-top" },
      el("button", { class: "time", title: "重播 Replay", onclick: () => playRange(p.video, c.start, c.end, 1) }, fmtTime(c.start)),
      el("span", { class: "range" }, range()),
      el("button", { class: "markbtn", "aria-pressed": c.mark === "ok" ? "true" : "false",
        onclick: () => { c.mark = c.mark === "q" ? "ok" : "q"; touch(); node.replaceWith(cardEl(p, c)); } },
        c.mark === "q" ? "❓ 不确定 Not sure" : "✅ 懂了 Got it")),
    el("label", { class: "lbl" }, "English"),
    area("en", "English sentence", "粘贴英文 Paste the English (YouTube ⋯ → 显示转写稿)"),
    el("label", { class: "lbl" }, "我的中文"),
    el("div", { class: "zh-row" }, zh, micButton(zh, (v) => { c.zh = v; touch(); })),
    el("div", { class: "actions" },
      el("button", { class: "btn", onclick: () => playRange(p.video, c.start, c.end, 1) }, "▶ 重播 Replay"),
      el("button", { class: "btn", onclick: () => playRange(p.video, c.start, c.end, 0.75) }, "🐢 慢放 0.75×"),
      el("details", { class: "adjust" }, el("summary", {}, "调整 Adjust"),
        el("div", { class: "adj-row" }, el("span", {}, "开始 Start"),
          el("button", { class: "btn sm", onclick: () => setRange(c.start - 1, c.end) }, "−1s"),
          el("button", { class: "btn sm", onclick: () => setRange(c.start + 1, c.end) }, "+1s")),
        el("div", { class: "adj-row" }, el("span", {}, "结束 End"),
          el("button", { class: "btn sm", onclick: () => setRange(c.start, c.end - 1) }, "−1s"),
          el("button", { class: "btn sm", onclick: () => setRange(c.start, c.end + 1) }, "+1s"),
          el("button", { class: "btn sm", onclick: () => { if (playerReady) setRange(c.start, player.getCurrentTime()); } }, "设为结束 Set end here")),
        el("button", { class: "btn sm danger", onclick: () => {
          if (!confirm("删除这张卡片？Delete this card?")) return;
          deleteCard(p, c.id, new Date()); savePart(p); renderCards(p);
        } }, "删除 Delete"))),
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
    placePlayer(null);
    box.append(el("p", { class: "hint" }, "没有 ❓ 句子。No ❓ sentences here — great!"));
    return;
  }
  placePlayer(host);
  let i = 0, step = 0;
  const show = () => {
    const { p, c } = pool[i];
    if (currentVideo !== p.video) showVideo(p.video);
    const play = (rate) => playRange(p.video, c.start, c.end, rate);
    box.replaceChildren(
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
        el("button", { class: "btn", onclick: () => { c.mark = "ok"; c.t = new Date().toISOString(); savePart(p); toast("改成 ✅ 了。Marked as got it."); } }, "✅ 懂了 Got it"),
        el("button", { class: "btn primary", onclick: () => { if (i < pool.length - 1) { i++; step = 0; show(); } else toast("复习完了！All done."); } }, "下一句 Next →")));
    const det = box.querySelector("details.review"); if (det) det.open = true;
  };
  show();
}

// ---------- sync with the private notes repo ----------
const gh = { token: store.get("token", ""), busy: false, timer: null, again: false };
function b64e(s) { const b = new TextEncoder().encode(s); let x = ""; for (const c of b) x += String.fromCharCode(c); return btoa(x); }
function b64d(s) { const x = atob(s.replace(/\s/g, "")); return new TextDecoder().decode(Uint8Array.from(x, (c) => c.charCodeAt(0))); }
function api(path, method, body) {
  return fetch("https://api.github.com/repos/" + NOTES_REPO + path, { method: method || "GET", cache: "no-store",
    headers: { Authorization: "Bearer " + gh.token, Accept: "application/vnd.github+json" },
    body: body ? JSON.stringify(body) : undefined });
}
function syncMsg(m) { const x = document.getElementById("sync-msg"); if (x) x.textContent = m; store.set("syncMsg", m); }
function ghError(e) {
  const s = e && e.status;
  if (s === 401) return "✗ 钥匙无效或已过期。Token invalid or expired.";
  if (s === 403 || s === 404) return "✗ 钥匙不能读写 " + NOTES_REPO + "（Contents 要选 Read and write）。";
  return "✗ 同步失败，稍后会再试。Sync failed, will retry. " + (s || "");
}
function pending() { return Object.values(parts).filter((p) => synced[p.video] !== p.updated); }
function scheduleSync() { if (!gh.token) return; clearTimeout(gh.timer); gh.timer = setTimeout(() => sync(), 3000); }
async function readRemote(p) {
  const r = await api("/contents/" + partPath(p) + "?ref=main");
  if (r.status === 404) return null;
  if (!r.ok) throw r;
  const j = await r.json();
  return { sha: j.sha, part: JSON.parse(b64d(j.content)) };
}
/** Pull every Part from the repo, merge, then push what this browser changed. */
async function sync() {
  if (!gh.token) return;
  if (gh.busy) { gh.again = true; return; }
  gh.busy = true; syncMsg("⏳ 正在同步… Syncing…");
  let pulled = 0, pushed = 0;
  try {
    const r = await api("/contents/parts?ref=main");
    if (!r.ok && r.status !== 404) throw r;
    const files = r.status === 404 ? [] : await r.json();
    for (const f of files) {
      if (!/^[\w-]{11}\.json$/.test(f.name)) continue;
      const video = f.name.slice(0, 11);
      if (shas[video] === f.sha && parts[video]) continue;
      const remote = await readRemote({ video });
      if (!remote) continue;
      const local = parts[video];
      const wasPending = local && synced[video] !== local.updated;
      const merged = local ? mergeParts(local, remote.part) : remote.part;
      parts[video] = merged; shas[video] = remote.sha;
      if (!wasPending) synced[video] = merged.updated;
      pulled++;
    }
    for (const p of pending()) {
      const remote = await readRemote(p);
      const merged = remote ? mergeParts(p, remote.part) : p;
      const put = await api("/contents/" + partPath(p), "PUT", { branch: "main",
        message: "Practice " + (merged.part ? "Part " + merged.part : merged.video) + " (" + merged.cards.length + " cards)",
        content: b64e(JSON.stringify(merged, null, 2) + "\n"), sha: remote ? remote.sha : undefined });
      if (!put.ok) throw put;
      const j = await put.json();
      parts[p.video] = merged; shas[p.video] = j.content.sha; synced[p.video] = merged.updated;
      pushed++;
    }
    persist();
    syncMsg("✓ 已同步 Synced " + new Date().toTimeString().slice(0, 5) + (pulled || pushed ? "（下载 " + pulled + "，上传 " + pushed + "）" : ""));
    if (pulled) refreshAfterPull();
  } catch (e) {
    persist();
    if (e && (e.status === 409 || e.status === 422) && !gh.retried) { gh.retried = true; gh.busy = false; return sync(); }
    syncMsg(e instanceof Response ? ghError(e) : "✗ 同步失败（网络？）Sync failed. " + (e && e.message || ""));
    if (!(e && (e.status === 401 || e.status === 403 || e.status === 404))) scheduleSync();
  }
  gh.retried = false; gh.busy = false;
  if (gh.again) { gh.again = false; scheduleSync(); }
}
/** After pulling, redraw unless the learner is typing (then only add AI reviews quietly on next render). */
function refreshAfterPull() {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
  const r = route();
  if (r.view === "shelf") render();
  else if (r.view === "part" && parts[r.video] && !typing) { renderPartHead(parts[r.video]); renderCards(parts[r.video]); }
}
function renderSyncPanel() {
  const box = el("section", { class: "page sync" });
  const draw = () => {
    const tokenIn = el("input", { type: "password", autocomplete: "off", placeholder: "github_pat_…", "aria-label": "GitHub token 钥匙" });
    box.replaceChildren(el("h2", {}, "☁ 同步 Sync"), ...(
      gh.token ? [
        el("p", {}, "已连接 Connected → ", el("code", {}, NOTES_REPO), "（私密仓库，别人看不到 private）"),
        el("p", { id: "sync-msg", class: "hint" }, store.get("syncMsg", "")),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => sync() }, "↻ 现在同步 Sync now"),
          el("button", { class: "btn danger", onclick: () => {
            if (!confirm("在这个浏览器里删掉钥匙？练习不会被删除。Forget the token on this device?")) return;
            gh.token = ""; store.set("token", ""); draw();
          } }, "🔑 删掉钥匙 Forget token")),
      ] : [
        el("p", { class: "hint" }, "现在只存在这个浏览器。粘贴 GitHub 钥匙后，会同步到私密仓库 ", el("code", {}, NOTES_REPO),
          "，手机和电脑都能用，Mac 上的 AI 也能批改。钥匙只保存在这个浏览器里。"),
        el("p", { class: "hint" }, "新建钥匙：", el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener" },
          "GitHub → Fine-grained token"), " → Repository access 只选 daily-reading-notes → Permissions: Contents = Read and write。"),
        el("div", { class: "row" }, tokenIn, el("button", { class: "btn primary", onclick: async () => {
          const t = tokenIn.value.trim(); if (!t) { toast("先粘贴钥匙。Paste the token first."); return; }
          gh.token = t; syncMsg("⏳ 检查钥匙… Checking…");
          try {
            const r = await api("");
            if (!r.ok) throw r;
            const j = await r.json();
            if (j.permissions && !j.permissions.push) throw { status: 403 };
            store.set("token", t); draw(); sync();
          } catch (e) { gh.token = ""; toast(ghError(e)); }
        } }, "连接 Connect")),
      ]));
  };
  draw();
  return box;
}

// ---------- start ----------
render();
if (gh.token) sync();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
