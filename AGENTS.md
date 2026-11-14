# AGENTS.md — How an AI reviews the learner's translations

You are an AI assistant (for example on the learner's Mac). The learner practises listening with the website
https://skot-chen.github.io/daily-reading/ (YouTube series *Clear English with Eric — The Wizard of Oz*).
While listening **without subtitles**, they mark sentences they didn't understand, paste the English and say their
Chinese translation. The site saves everything to the **private** repo `skot-chen/daily-reading-notes`.

When the learner says **"批改 Part N"** (review Part N), do the steps below.

- Learner: Chinese native speaker, English B1–B2. Write explanations in **simple Chinese**, short and direct.
- Obsidian vault on the Mac: `/Users/scottchen/Downloads/yui-agent/myobsidian` (synced to GitHub by the learner).

## Steps
1. `git clone` (first time) or `git pull` the repo `skot-chen/daily-reading-notes`.
2. Find the file in `parts/` whose `"part"` is N (file names are `<YouTube id>.json`, e.g. `parts/hUVab77Hrao.json`).
3. For **every card that has English (`en`) and no `review` yet** (or whose `t` is newer than `review.t`), add `review`:
   ```json
   "review": {
     "ref": "自然的中文参考翻译",
     "verdict": "ok",
     "note": "一句话评价学习者的翻译（对在哪里 / 错在哪里）",
     "point": "真正的难点：生词 / 连读 / 倒装 / 长句结构 / 习语 …（没有就省略）",
     "t": "2026-11-14T09:30:00Z"
   }
   ```
   - `verdict`: `"ok"` 意思对 · `"close"` 小偏差 · `"wrong"` 理解错了.
   - Cards with `"mark": "q"` (❓ not sure): make `note` and `point` more detailed — split the sentence, explain the
     structure, give one simple example sentence of the same pattern.
   - Cards with `"mark": "ok"` and a correct translation: just `"verdict": "ok", "note": "意思对"` plus `ref`.
   - Card has no Chinese (`zh` empty)? Still write `ref` and `point`; `note`: "还没写中文".
   - The English was pasted by the learner from YouTube's transcript. If it looks cut off, mention it in `note`.
4. Add or replace the Part `summary`:
   ```json
   "summary": {
     "stuck": "这一集主要卡在：长句 2 次，连读 1 次",
     "patterns": ["句型 —— 中文 —— 原句", "最多 3 条"],
     "next": "下次听的时候注意：……（一句话）",
     "t": "2026-11-14T09:30:00Z"
   }
   ```
5. Set the Part's `"updated"` to the current time (ISO, UTC) — the website uses it to fetch your changes.
6. Check: `node scripts/validate.mjs <path-to>/parts` (script is in the public repo `skot-chen/daily-reading`;
   or check by hand against the rules below). Then commit `Review Part N` and push to `main`.
   If the push is rejected (the learner synced meanwhile): `git pull --rebase`, re-check, push again.
7. Write an Obsidian note to `<vault>/Clippings/Eric-note/翻译/Part N.md` (create folders if needed; overwrite the
   same Part's note):
   ```markdown
   ---
   part: N
   video: https://www.youtube.com/watch?v=<id>
   reviewed: YYYY-MM-DD
   tags: [eric-oz, translation]
   ---
   # Wizard of Oz · Part N · 翻译批改

   ## 05:28 ❓
   **EN**：…
   **我的中文**：…
   > [!tip]- AI 批改（⚠️ 小偏差）
   > **参考翻译**：…
   > **评价**：…
   > **难点**：…

   （one section per card, in time order; title uses ❓ or ✅ from `mark`)

   ## AI 总结
   - 主要卡在：…
   - 句型：…
   - 下次注意：…
   ```
   Do not touch any other note in the vault (especially the existing clipping notes in `Clippings/Eric-note/`).
8. Tell the learner in 2–3 Chinese sentences: how many cards reviewed, the main sticking point, where the note is.

## Rules (do not break)
- **Never change the learner's own fields**: `en`, `zh`, `mark`, `start`, `end`, `t`, `id`, `deleted`. Never delete cards.
- Only add/replace `review` on cards, `summary` and `updated` on the Part.
- Keep valid UTF-8 JSON, 2-space indent, the same field names. `review.t` and `summary.t` = when you wrote them.
- Never copy whole subtitles into the repo or the note — only the sentences already in the file.
- The repo is private: never make it public, never paste its content anywhere else.

## Part file format (for reference)
```json
{ "version": 1, "video": "hUVab77Hrao", "part": 14, "title": "…| Part 14",
  "created": "2026-11-14", "updated": "2026-11-14T09:12:00.000Z",
  "cards": [ { "id": "c_lx3k9ab", "start": 328.0, "end": 334.5, "en": "…", "zh": "…", "mark": "q",
               "t": "2026-11-14T09:10:00.000Z", "review": { "…": "…" } } ],
  "deleted": { "c_old123": "2026-11-14T09:11:00.000Z" },
  "summary": { "…": "…" } }
```
`start`/`end` are seconds in the video. `mark`: `"q"` = ❓ not sure, `"ok"` = ✅ got it.
