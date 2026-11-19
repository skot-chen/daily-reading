# Daily Reading — SPEC

## Goal
A listening + translation practice page for one learner (Chinese native, English B1–B2) who follows the YouTube series
*Clear English with Eric — The Wizard of Oz* (one ~35 min "Part" per session). Today the learner translates whole
episodes by hand: slow, hard to keep up. This site makes it fast: **listen without subtitles, mark only what you didn't
understand, copy the English, say the Chinese, replay that sentence with one tap, let the Mac AI review it later.**
Success after 4 weeks: every Part is practised in ≤ 30 min of translation work (not hours), ❓ sentences per Part go
down, and the learner reviews ❓ sentences on the phone on the way to work.

## Core loop
1. Open the site, paste the Part's YouTube link (or pick a Part already started).
2. Listen without subtitles. Hard sentence? Tap **开始 Start**; when it ends tap **结束 End** → that range becomes a sentence card.
3. In the card: paste the English (copied from YouTube's transcript), say/type the Chinese, mark ✅ (got it) or ❓ (not sure). **重播 Replay** plays just that bit again.
4. Done → it syncs to the private notes repo. Tell the Mac AI "批改 Part N" → the AI writes reviews into the repo and a Markdown note into Obsidian.
5. On the road: **复习 Review** on the phone — replay each ❓ sentence, guess, then reveal English → my Chinese → AI review.

## Features and acceptance criteria

### F1 Parts and video
1. Given a pasted YouTube link (watch?v=, youtu.be/, with or without &t=), when I press Start, the video loads in the page and a Part is created; the Part number is read from the video title if it contains "Part N", else I can type it.
2. The Part list (home) shows each Part with number, date, and counts: sentences / ❓ / reviewed by AI.
3. Reopening a Part loads the same video and all its cards.

### F2 Mark while listening (Start → End)
1. **● 开始 Start** (or `M`) creates a card starting now (minus an optional lead-in of 0–10 s, default 2, remembered); the video keeps playing and the button turns into **■ 结束 End** showing the running range.
2. **结束 End** (or `M`/`E`) sets the card's end to the current time and pauses the video. The card is exactly the Start→End range.
3. Each card shows its range (`00:03–00:08 ✎`); clicking it opens time editing: free time fields (`5:28`, `5:28.5`, `328`; bad input shows a hint), ±1 s, **用现在的时间 Now**. Cards stay sorted by time.
   - An edit that still overlaps the old range applies directly. An edit that no longer overlaps it opens a dialog (old vs new range, any overlap with other cards) with **新建一张卡片 New card** (default, old card unchanged) / **移动这张卡片 Move** / **取消 Cancel**. Moving one edge past the other keeps the sentence length.
4. Each card has a visible ✕ delete (with confirm). **清空这一集的卡片 Clear all cards** (bottom of the Part page, with confirm) deletes every card but keeps the Part and its video. Removing a whole Part is the ✕ on its shelf row (with confirm), also removed from the notes repo on next sync.
5. Wide screens (≥ 1100 px): video left and stays in view, cards right; **⤢ 大视频 Big video** puts a large video on top (Start/End always visible), remembered. In the side-by-side layout a divider between video and notes can be dragged (35–80 % for the video, arrow keys too, double-click resets; remembered). In Big video the video can be moved anywhere left↔right by dragging the bar above it and resized by dragging its corner grip (min 420 px); quick buttons **⇤ 靠左 / 居中 / 靠右 ⇥ / ↺ 默认**; remembered. With floating notes, the panel moves into the bigger free side after each change. **🗗 笔记浮动 Float notes** turns the notes into a floating window: drag it by its bar anywhere, resize from the corner, **放回 Dock** puts it back; position, size and on/off are remembered and kept inside the window.

### F3 Translate a card
1. Card has an English box (paste) and a Chinese box. Text is saved automatically (no Save button) and survives reload.
2. 🎤 button next to the Chinese box: when the browser supports speech recognition, it fills the box with what I say in Chinese; when it doesn't, it shows a short hint to use the system dictation key.
3. ✅ / ❓ toggle; ❓ cards are visibly marked with a red-pencil circle.
4. A card can be deleted (with confirm).

### F4 Replay
0. **🎬 简洁视频 Clean video** (default on, remembered): YouTube's own controls are off and a clear layer over the picture takes clicks (play/pause), so nothing lingers over the video; our bar under the video has play/pause, ±5 s, progress slider, time and speed. Keyboard on the Part/Review page: Space play/pause, ← → 5 s. Turning it off brings back YouTube's controls.
1. **重播 Replay** seeks to start and plays until end, then pauses.
2. **慢放 0.75×** plays the same range at 0.75 speed.
3. Clicking a card's start time does the same as Replay.

### F5 Sync to the private repo (optional, like Daily Words)
1. Without a token everything works locally (this browser only); the page says so in one line.
2. Pasting a fine-grained GitHub token (Contents read/write on `skot-chen/daily-reading-notes` only) is checked once and stored only in this browser; a "forget token" button removes it.
3. Edits sync automatically a few seconds after I stop typing, one file per Part (`parts/<YouTube id>.json`); status line shows ✓ time or a clear Chinese error.
4. On another device with the token, opening the site loads all Parts from the repo; newer edits win per card.
5. Visitors without the token see an empty notebook and none of my content (the data repo is private).
6. The sync settings panel is locked with a password (only a salted PBKDF2 hash is in the code). Unlock lasts until the tab is closed; **🔒 锁上 Lock** locks again. Background sync keeps running while locked.

### F6 AI review shown in the page
1. When a card has an AI review (written by the Mac AI into the repo), it shows a folded **AI 批改** under my Chinese; opening it shows reference translation, verdict (✅ / ⚠️ / ❌ + one line) and the difficulty.
2. A Part with an AI summary shows it at the bottom of the Part page.

### F7 Review mode (phone)
1. **复习 Review** lists all ❓ cards (all Parts or one Part), one at a time: play → "显示英文" → "显示我的中文 + AI 批改" → 再听 / 下一句.
2. I can switch a card to ✅ from review mode.
3. Works at 375 px width with no horizontal scroll; buttons ≥ 44 px tall.

### F8 Mac AI protocol
1. `AGENTS.md` tells any AI how to: read a Part file, add `review` to each card and `summary` to the Part, push, and write an Obsidian note to `Clippings/Eric-note/翻译/Part N.md` — never touching the learner's own text.
2. `npm run check` validates any Part JSON in a given folder (`node scripts/validate.mjs <dir>`) so the AI can check before pushing.

## Non-goals for v1
- No AI calls from the page (no API key, no cost). No full subtitles stored (copyright) — only the sentences I mark.
- No accounts/login beyond the GitHub token. No other video series UI (works with any YouTube link, but no special features).

## Data model (private repo `daily-reading-notes`, one file per Part: `parts/<YouTube id>.json`, the `part` field holds N)
```json
{ "version": 1, "part": 14, "video": "hUVab77Hrao", "title": "Learn English with a Classic Book | ... | Part 14",
  "created": "2026-11-14", "updated": "2026-11-14T09:12:00Z",
  "cards": [ { "id": "c_lx3k9", "start": 328.0, "end": 334.5, "en": "...", "zh": "...", "mark": "q",
               "t": "2026-11-14T09:10:00Z",
               "review": { "ref": "参考翻译", "verdict": "ok|close|wrong", "note": "一句话", "point": "难点", "t": "..." } } ],
  "summary": { "stuck": "主要卡在…", "patterns": ["句型 —— 中文 —— 原句"], "next": "下次注意…", "t": "..." } }
```
`mark`: `"ok"` ✅ or `"q"` ❓. `review`/`summary` are written only by the AI. Browser keeps a localStorage copy (`dr.*`).

## Stack + why
Static site, **zero dependencies** (plain HTML/CSS/JS, YouTube IFrame API, GitHub Contents API) — same proven pattern as
`apps/daily-words`, free hosting on GitHub Pages, works on phone. No server, so the Express/SQLite default doesn't apply.
`npm run check` = syntax check + `node:test` unit tests of the pure logic (`lib.js`: link parsing, time math, merge, validation).

## Milestones
- **M0 Skeleton** — repo, `index.html` with the A+B look (green hardcover header with gold, lined paper body, red pencil), light + dark, `npm run check` green, dev server on 8773.
- **M1 Practice page** — F1, F2, F3, F4 (local only).
- **M2 Sync** — F5.
- **M3 AI review + review mode** — F6, F7.
- **M4 AI protocol + publish** — F8, create repos `skot-chen/daily-reading` (public, Pages) and `skot-chen/daily-reading-notes` (private), deploy, test on phone width.
