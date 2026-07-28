# Prompt Builder — Completed Backlog

Archive for items retired from [`BACKLOG.md`](BACKLOG.md). Kept as a record of what changed and why, and so that IDs referenced from other items (`*Depends on: C10*`) stay resolvable after the work is done.

**How to use this file.** When an item's acceptance criteria genuinely pass, cut the whole item from `BACKLOG.md` — heading, tags, and body verbatim — and paste it under `## Completed` below, appending a line:

```
**Completed:** 2026-07-28 · `a1b2c3d`
```

Keep the original ID. IDs are never reused, and an item that is only partly addressed stays in `BACKLOG.md` with its remaining scope narrowed rather than being moved here.

**Tags.** (unchanged from `BACKLOG.md`, repeated here so archived items stay readable on their own)
- Priority: **P0** data loss / broken behavior · **P1** correctness & robustness · **P2** quality & maintainability · **P3** new features.
- Model: **Sonnet 5** for mechanical/localized changes · **Opus 4.8** for cross-cutting design or feature work.
- Size: **S** < 1 h · **M** half-day · **L** multi-session.

---

## Completed

_No items completed yet._

Verified 2026-07-28 against the working tree at `1de104c`: every item A1–D6 in `BACKLOG.md` is still open. Spot-checks — `git ls-files data/` still returns all three SQLite files (A1); the `/api/app-config/activePromptId` fetches remain with no matching route (A3); the literal `"\\n\\n"` is still at `ActionBar.tsx:53` (A6); `src/lib/db.ts` sets only the WAL pragma (B3); `is_expanded` is still missing from the components `GET` SELECT (B4); `replaceVariables` still builds an unescaped `RegExp` (B5); the compose volume is still `external: true` (B9); `eslint.config.mjs` still disables all three rules (C1); `mysql2`, `@supabase/*` and `bcryptjs` are still installed (C2); there is still no test runner (C12).
