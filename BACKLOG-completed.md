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

## A1. Remove SQLite runtime files from Git

**Priority:** P0  
**Size:** S

### Problem

Runtime SQLite files are currently tracked:

```text
data/prompt_builder.db
data/prompt_builder.db-shm
data/prompt_builder.db-wal
```

These are live application state and should never be source-controlled.

The WAL and SHM files may not represent the same transactional state as the primary database and can cause binary conflicts or database corruption after checkout.

### Action

Remove the three files from Git tracking while leaving the local files untouched.

Ensure `/data` remains excluded by `.gitignore`.

### Acceptance

- `git ls-files data/` returns no SQLite files
- running Prompt Builder does not modify Git status because SQLite changed
- the local database remains available
- the application boots normally

**Completed:** 2026-08-28 · `3807015`

---

## A2. Correct stale-state persistence in PromptContext

**Priority:** P0  
**Size:** M

### Problem

Several prompt mutations update React state and then immediately retrieve the prompt from `promptsRef.current`.

The ref still contains the pre-mutation value until the relevant effect executes.

This can cause reordered or inserted sections to be saved using the previous state.

### Action

For every prompt mutation:

1. Calculate the updated prompt explicitly.
2. Apply that same object to local state.
3. Pass that exact object to the persistence layer.

Audit all same-tick reads of `promptsRef.current`.

### Acceptance

The following survive a hard reload:

- moving a section up
- moving a section down
- drag-to-index reorder
- inserting a section in the middle
- deleting a section
- modifying a section

No persistence operation saves the pre-mutation state.

**Completed:** 2026-08-28 · `3807015`

---

## A3. Fix active prompt persistence

**Priority:** P0  
**Size:** M

### Problem

The frontend attempts to use an `/api/app-config/activePromptId` endpoint which does not exist.

The settings endpoint already handles application configuration.

### Action

Use `/api/settings` as the authoritative persistence path for the active prompt.

Remove calls to the nonexistent endpoint.

### Acceptance

- select Prompt B
- reload Prompt Builder
- Prompt B remains selected
- no 404 requests occur while changing prompt tabs

**Completed:** 2026-08-28 · `3807015`

---

## A4. Stop component-library bulk save from deleting external changes

**Priority:** P0  
**Size:** L

### Problem

The component library currently has destructive whole-table replacement behaviour.

A client-side save can remove components or folders which were added through another ingestion path after the client originally loaded its state.

### Action

Replace whole-table deletion with transactional upsert behaviour.

Updates should:

- update known records
- insert new records
- delete only records explicitly removed by the client

Do not remove records merely because they were absent from an old client snapshot.

### Acceptance

An externally ingested component remains present after:

1. the UI has already loaded
2. the external component is added
3. the user edits another component
4. autosave runs
5. the application reloads

**Completed:** 2026-08-28 · `3807015`

---

## A6. Fix literal newline characters in copied prompts

**Priority:** P0  
**Size:** S

### Problem

The clipboard path can emit literal `\n` characters rather than actual line breaks.

### Action

Correct the string handling and cover it with an automated test.

### Acceptance

System prompt and prompt content are separated by actual line breaks.

No literal backslash characters appear.

**Completed:** 2026-08-28 · `3807015`

---

## A7. Make autosave debounce prompt-specific

**Priority:** P0  
**Size:** M

### Problem

One debounce timer is shared across multiple prompts.

Editing Prompt A and then Prompt B quickly can cancel Prompt A's pending save.

### Action

Use a keyed persistence queue:

```text
Prompt A → timer
Prompt B → timer
Prompt C → timer
```

Each prompt must debounce independently.

### Acceptance

Edit Prompt A and then Prompt B within one second.

After autosave and reload, both edits remain.

**Completed:** 2026-08-28 · `3807015`

---

## B2. Standardise Next.js dynamic route parameters

**Priority:** P1  
**Size:** S

Use the supported Next.js async parameter model consistently across all dynamic API routes.

### Acceptance

- production build succeeds
- no dynamic route parameter warnings
- error logging contains the actual object ID

**Completed:** 2026-08-28 · `3807015`
