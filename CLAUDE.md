# Daily Reading — notes for Claude

Listening + translation practice for *Clear English with Eric — The Wizard of Oz* (YouTube). One learner
(Chinese native, English B1–B2). Read SPEC.md (acceptance criteria + milestones) and PROGRESS.md (state) first.

## Stack
Static site, zero dependencies (keep it that way): `index.html`, `style.css`, `app.js` (page), `lib.js` (pure logic,
also imported by tests). YouTube IFrame API for the player, GitHub Contents API for sync. Hosted on GitHub Pages
from public repo `skot-chen/daily-reading`; the learner's data lives in PRIVATE repo `skot-chen/daily-reading-notes`
(one file per Part: `parts/<YouTube id>.json`, format in SPEC.md + AGENTS.md). GitHub account for this workspace: skot-chen only.

## Commands
- `npm run check` — syntax check + build `_site/` + unit tests (node:test, `test/*.test.js`). Must stay green.
- `npm run dev` — serves on http://localhost:8773 (launch config `daily-reading`).
  Launch config `daily-reading-test` serves on 8774: a different origin, so its localStorage is separate — use it for QA.

## Rules
- Never test with the learner's real token or real notes repo. QA on port 8774 with local data only; for sync tests use
  a mocked `fetch` in unit tests.
- Never store full subtitles (copyright) — only sentences the learner marks.
- The public site must never show personal background or any data without the token.
- All learner-facing text: simple English with Chinese, e.g. `标记 Mark`.
- Look: A+B mix — dark green hardcover header with gold, lined cream paper, red-pencil circles for ❓. Light + dark.
- Keep pure logic in `lib.js` and test it there; `app.js` holds DOM code.
- localStorage keys are prefixed `dr.`; wrap access in try/catch.
