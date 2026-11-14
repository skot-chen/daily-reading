# PROGRESS — Daily Reading

## Done
- M0 look: green hardcover header with gold + lined paper cards, red-pencil circle for ❓; light + dark.
- M1 practice page: paste link → embedded player, title/Part auto-detected; 标记 Mark (button + M key) makes a card
  (−4 s…+1 s); EN/ZH autosave; 🎤 speech (zh-CN) with fallback hint; ✅/❓; replay range + 0.75×; adjust ±1 s, set end,
  delete. Captions are switched off once per video (unloadModule).
- M2 sync: token panel, private repo `skot-chen/daily-reading-notes`, one file per Part `parts/<video>.json`,
  pull-merge-push with sha, 409/422 retry once, pull on load and when the tab becomes visible.
- M3: AI review folded under each card, Part summary, review mode (#/review) for ❓ cards.
- M4: AGENTS.md (Mac AI protocol incl. Obsidian note), `scripts/validate.mjs`; repos created (site public + Pages via
  Actions, notes private).

## Now
- Live at https://skot-chen.github.io/daily-reading/ . Review round done (spec, QA, sync) and fixed.

## Next
- Learner: make a fine-grained token (only daily-reading-notes, Contents read/write), paste on each device.
- Give AGENTS.md link to the Mac AI.

## Decisions
- Static site, no server (GitHub Pages), same pattern as apps/daily-words.
- File per Part named by YouTube id (Part number may be unknown at start; AI finds the Part by `part` field).
- New cards default to ❓ (you mark what you didn't understand); switch to ✅ after translating.
- Merge: newer card `t` wins; tombstones in `deleted`; `review`/`summary` merged on their own `t` so a learner edit
  never drops an AI review.

## Backlog / known issues
- sync() lives in app.js (DOM/fetch) and has no unit tests; logic it relies on (mergeParts, validatePart) is tested.
- If the AI pushes with a newer `updated` while a local Part-number edit is pending, the AI's `part`/`title` win (rare).
- Fixed after review: edits during upload, broken remote file, storage full, stale objects (savePart merges), player rebuilt per view, review/summary without t, backoff + rate limit, "null" in review mode, re-sort after Adjust, double Mark, 44px targets.
- No way to delete a whole Part from the shelf yet.
- Real sync not tested end-to-end against GitHub from this machine (no token here by design).
