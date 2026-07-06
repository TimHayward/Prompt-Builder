# Prompt Builder — Backlog

Drafted 2026-07-06 from a full code review (frontend, backend/data layer, and the in-flight markdown-import changeset) plus the former "Feature Ideas" list in README.md.

**How to use this file.** Each item is self-contained and written to be executed cold by an AI coding model. Pick an item, read the referenced files, implement, and satisfy the acceptance criteria. Line numbers were accurate at drafting time — treat them as starting points and re-verify against the current code before editing.

**Tags.**
- Priority: **P0** data loss / broken behavior · **P1** correctness & robustness · **P2** quality & maintainability · **P3** new features.
- Model: **Sonnet 5** for mechanical/localized changes · **Opus 4.8** for cross-cutting design or feature work.
- Size: **S** < 1 h · **M** half-day · **L** multi-session.

---

## A — P0 Remediations

### A1 — Untrack committed SQLite database files — [P0] [Sonnet 5] [S]
**Problem:** `data/prompt_builder.db`, `data/prompt_builder.db-shm`, and `data/prompt_builder.db-wal` are tracked in git (`git ls-files data/` confirms) and show as modified on every run. `.gitignore` contains `/data` (added in commit `dc088d9`) but that does not untrack already-committed files. Committing a WAL/SHM pair snapshotted at a different point than the main DB can produce a corrupt database on checkout, and every merge risks binary conflicts.
**Action:** Run `git rm --cached data/prompt_builder.db data/prompt_builder.db-shm data/prompt_builder.db-wal` and commit. Confirm `/data` remains in `.gitignore`.
**Acceptance:** `git ls-files data/` returns nothing; running the app no longer dirties `git status`; the local `data/` files still exist on disk and the app still boots against them.

### A2 — Fix stale-ref persistence in PromptContext (reorders/inserts lost on reload) — [P0] [Sonnet 5] [M]
**Problem:** `promptsRef.current` is only refreshed in a `useEffect` ([src/contexts/PromptContext.tsx:92-94](src/contexts/PromptContext.tsx#L92-L94)), so inside the same handler it still holds the **pre-mutation** state. `moveSection` ([PromptContext.tsx:436-439](src/contexts/PromptContext.tsx#L436-L439)), `moveSectionToIndex` ([:465-467](src/contexts/PromptContext.tsx#L465-L467)), and `addSectionAtIndex` (~`:545-547`) all call `updatePromptInApi(promptsRef.current.find(...))`, persisting the old section order — the reorder/insert is silently lost on reload.
**Action:** Follow the pattern already used correctly in `updateSection`/`deleteSection` ([:396-402](src/contexts/PromptContext.tsx#L396-L402), `:413-417`): compute the updated prompt object inline (the same transformation applied in the `setPrompts` updater) and pass **that** to `updatePromptInApi`. Audit every other caller of `promptsRef.current` in the same tick for the same bug.
**Acceptance:** Reorder sections via the up/down controls and drag-to-index, add a section mid-list, then hard-reload: the new order and new section persist. No other handler persists pre-mutation state.

### A3 — Active prompt never restored: phantom `/api/app-config` endpoint — [P0] [Sonnet 5] [M]
**Problem:** `PromptContext` fetches `GET /api/app-config/activePromptId` ([src/contexts/PromptContext.tsx:113](src/contexts/PromptContext.tsx#L113)) and `PUT`s the same path ([:148](src/contexts/PromptContext.tsx#L148)), but no such route exists (`src/app/api/` contains only `components`, `prompts`, `settings`, `prompts/ingest`). Every call 404s: the active tab is never restored across reloads and saves silently fail. Meanwhile `GET /api/settings` already returns `activePromptId` ([src/app/api/settings/route.ts:31](src/app/api/settings/route.ts#L31)), but `AppContext` discards it ([src/contexts/AppContext.tsx:74-75](src/contexts/AppContext.tsx#L74-L75)) and its save sends only `{ settings }` ([:114](src/contexts/AppContext.tsx#L114)).
**Action:** Route active-prompt persistence through the existing `/api/settings` endpoints: read `activePromptId` from the settings response on load, and include it in the settings `POST` body (the settings route already persists `active_prompt_id` on the `app_config` row). Delete the two dead `/api/app-config/...` fetches. Alternative (only if cleaner separation is wanted): add the missing route — but prefer reusing settings.
**Acceptance:** Open prompt B, reload the app: prompt B is the active tab. Network tab shows no 404s during load or tab switching.

### A4 — Stop `POST /api/components` wiping ingested data; fix ingest tree placement — [P0] [Opus 4.8] [L]
**Problem:** Two conflicting write paths into `component_library`:
1. The client's bulk tree save does `DELETE FROM component_library` then re-inserts only what the client sent ([src/app/api/components/route.ts:45](src/app/api/components/route.ts#L45) onward). Anything the ingest API created since the client last fetched is destroyed on the next autosave — a data-loss race.
2. The ingest route inserts its folder with `parent_id = NULL` ([src/app/api/prompts/ingest/route.ts:76](src/app/api/prompts/ingest/route.ts#L76), `:89`), creating a second root that competes with the single "Components" root the UI expects, so ingested folders generally never appear in the sidebar. (The client-side import in `ImportPromptModal.tsx:167` correctly inserts under `treeData[0]`.)
**Action:**
- Change the ingest route to locate the existing root folder (the sole `parent_id IS NULL` node of `item_type='folder'`) and insert the ingest folder **under** it; create the root only if the table is genuinely empty.
- Replace the wipe-and-rewrite bulk save with a merge: upsert every node the client sent (`INSERT ... ON CONFLICT(id) DO UPDATE` preserving `created_at`), and delete only rows whose ids the client knew about but omitted — e.g. have the client send the set of ids it loaded, or compute deletions as `existing ids − sent ids` restricted to subtrees the client owns. Ingest-created rows the client has never seen must survive.
- Use `db.transaction()` (as the ingest route already does) instead of manual `BEGIN`/`COMMIT` ([components/route.ts:40](src/app/api/components/route.ts#L40)).
- Have the client refresh the tree (or merge new nodes) after ingest — at minimum document that a reload shows ingested folders.
**Acceptance:** With the app open, POST a file to `/api/prompts/ingest`; then edit the tree in the UI (triggering autosave); reload — the ingested folder exists, appears under the root in the sidebar, and `created_at` values of untouched nodes are unchanged.

### A5 — Production Docker build; unsilence DB init; vet the better-sqlite3 bump — [P0] [Opus 4.8] [M]
**Problem:** `Dockerfile:1` is `FROM node:26.4.0` — an unvetted bump off `-slim` made only to satisfy the `better-sqlite3` `^11→^12` engines constraint (`package.json`, lockfile `engines: 20.x…26.x`). `Dockerfile:13` and `docker-compose.yml:24` run the **dev** server (`npm run dev -- --port 3000`, `NODE_ENV=development`) as the deployment, and prefix it with `npm run db:init || true` — while `scripts/init-db.mjs:83-88` catches errors without setting a non-zero exit code. A failed schema init is therefore doubly silenced and the app 500s on every query against a table-less DB.
**Action:**
- Convert to a multi-stage Dockerfile: build stage (`npm ci`, `next build` with `output: 'standalone'` in `next.config.ts`), runtime stage on a pinned current-LTS `-slim` image with the packages better-sqlite3 needs (or rely on its prebuilt binaries), running `node server.js` / `next start`.
- Make `init-db.mjs` exit `1` on any error; remove `|| true` from Dockerfile and compose so a failed init stops the container with a visible error.
- Decide the `better-sqlite3` version deliberately: either keep `^12` (verify it installs and runs on the chosen Node LTS) or revert to `^11`; run `npm install` and boot to verify either way.
**Acceptance:** `docker compose up --build` from scratch serves the app via a production `next start` (no Turbopack dev banner); breaking the schema intentionally (e.g. bad SQL in init) causes the container to exit non-zero with the error visible in logs; image is based on a real, pinned `-slim` tag.

### A6 — Clipboard copy emits literal `\n\n` characters — [P0] [Sonnet 5] [S]
**Problem:** [src/components/PromptEditor/ActionBar.tsx:53](src/components/PromptEditor/ActionBar.tsx#L53) concatenates `systemPrompt + "\\n\\n" + promptText`. The double-escaped string puts the literal characters backslash-n twice into the clipboard instead of a blank line whenever markdown prompting is enabled.
**Action:** Change to `"\n\n"`.
**Acceptance:** With markdown prompting on, Copy Prompt produces a system prompt separated from the body by one blank line; no backslashes appear.

### A7 — Per-prompt debounce: rapid cross-prompt edits lose saves — [P0] [Opus 4.8] [M]
**Problem:** `updatePromptInApi` is a single debounced closure created once ([src/contexts/PromptContext.tsx:144-181](src/contexts/PromptContext.tsx#L144-L181)); one internal timer serves all prompts. Editing prompt A then prompt B within the debounce window cancels A's pending save — A's changes are lost. `saveActivePromptIdToApi` shares the pattern.
**Action:** Replace with a keyed debounce (map of prompt-id → timer, or a small `debounceByKey(fn, ms)` utility in `src/utils/`), so each prompt's save is debounced independently. Flush pending saves on unload (`beforeunload`) if straightforward. Apply the audit to `saveActivePromptIdToApi` (single-key, likely fine once A3 reroutes it).
**Acceptance:** Edit prompt A, switch tabs and edit prompt B within 1 s, reload after 2 s: both edits persisted. Existing single-prompt debounce behavior (no request per keystroke) still holds.

---

## B — P1 Remediations

### B1 — Linked-component sync loop: `originalContent` never updated — [P1] [Sonnet 5] [S]
**Problem:** `updateSectionFromLinkedComponent` updates a section's `content`/`type`/`name` but not `originalContent` ([src/contexts/PromptContext.tsx:494-508](src/contexts/PromptContext.tsx#L494-L508)). The Section effect re-syncs whenever `linkedComponent.content !== section.originalContent` ([src/components/PromptEditor/Section/index.tsx:58-63](src/components/PromptEditor/Section/index.tsx#L58-L63)), so after one sync the comparison stays true forever — redundant updates and a perpetually `dirty` section on every `treeData` change.
**Action:** Set `originalContent` to the linked component's content inside `updateSectionFromLinkedComponent`.
**Acceptance:** Edit a linked component; the section syncs once, is not re-marked dirty on unrelated tree changes, and React DevTools shows no repeated update loop.

### B2 — Standardize Next 15 async `params` in dynamic API routes — [P1] [Sonnet 5] [S]
**Problem:** `[id]` route handlers type `params` as a plain object though Next 15 supplies a Promise. [src/app/api/prompts/[id]/route.ts:10-14](src/app/api/prompts/[id]/route.ts#L10-L14) awaits it in the body but the catch blocks read `params.id` synchronously (`:41`, `:108`, `:151`) — logging `undefined`. [src/app/api/components/[id]/route.ts:22](src/app/api/components/[id]/route.ts#L22) never awaits at all, which Next flags and will break in a future release.
**Action:** In every dynamic route: type `params: Promise<{ id: string }>`, `const { id } = await params;` once at the top, and use `id` everywhere including catch blocks.
**Acceptance:** `npm run build` passes with no `params` warnings; forcing an error in a handler logs the real id.

### B3 — Enable SQLite foreign-key enforcement — [P1] [Sonnet 5] [S]
**Problem:** `src/lib/db.ts` never runs `PRAGMA foreign_keys = ON` (better-sqlite3 defaults OFF), so every `ON DELETE CASCADE` / `SET NULL` in `scripts/init-db.mjs` is dead. Folder deletes rely on a cascade that never fires; the prompts DELETE route compensates manually.
**Action:** Add `db.pragma('foreign_keys = ON');` at connection open in `src/lib/db.ts` (next to the existing WAL pragma, ~`:24`). Re-test: deleting a folder cascades to children; deleting the active prompt nulls `app_config.active_prompt_id`.
**Acceptance:** Delete a folder with children via the API — child rows are gone; existing routes still pass manual smoke tests (no new FK violations on normal flows, e.g. bulk save inserting children before parents must still work — verify insert order or use deferred approach).

### B4 — Folder expansion state never restored — [P1] [Sonnet 5] [S]
**Problem:** `GET /api/components` omits `is_expanded` from its SELECT ([src/app/api/components/route.ts:17](src/app/api/components/route.ts#L17)) even though the POST writes it (`:65`); `buildTreeFromApiData` then defaults every folder to collapsed ([src/contexts/TreeContext.tsx:172](src/contexts/TreeContext.tsx#L172)).
**Action:** Add `is_expanded` to the SELECT and map it (SQLite integer → boolean) in the tree build.
**Acceptance:** Expand some folders, reload: expansion state is restored.

### B5 — Escape variable names in regex substitution — [P1] [Sonnet 5] [S]
**Problem:** `replaceVariables` builds `new RegExp("\\{\\{" + variableName + "\\}\\}")` ([src/utils/variableUtils.ts:68](src/utils/variableUtils.ts#L68)); a name containing regex metacharacters (`.`, `(`, `+`, …) breaks or mis-substitutes.
**Action:** Escape the name (standard `escapeRegExp` helper) or replace via `split("{{" + name + "}}").join(value)`.
**Acceptance:** A variable named `price ($usd)` substitutes correctly everywhere it appears.

### B6 — Unify the two markdown parsers — [P1] [Opus 4.8] [L]
**Problem:** The same markdown file parses differently depending on entry path. Server ingest uses a `Heading:` line regex `^([A-Za-z][A-Za-z ]{0,30}):\s*(.*)$` ([src/utils/markdownParser.ts:27](src/utils/markdownParser.ts#L27)) — prose like `Note: see below` starts a bogus section, and headings > 31 chars or containing digits are silently dropped into body text. The client importer splits on `#` ATX headers with fenced-code awareness ([src/utils/markdownImport.ts:63](src/utils/markdownImport.ts#L63)).
**Action:** Extract one shared, header-based parsing core (pure, no MUI/React imports — respect the client/server split documented at [markdownImport.ts:4-7](src/utils/markdownImport.ts#L4-L7)) used by both `parsePromptMarkdown` (ingest) and `parseMarkdownByHeaders` (import modal). Align section-type mapping with the registry in `src/lib/frameworks.ts` (aliases, framework detection). Keep any `# type: Title` special-casing in one place.
**Acceptance:** The same sample file POSTed to `/api/prompts/ingest` and imported via the UI produces identical section names, types, and content. Unit tests cover: prose colons, long headings, fenced code containing `#`, and the `# type: Title` form.

### B7 — Finish the markdown-import feature loose ends — [P1] [Opus 4.8] [M]
*(Assumes the current import/frameworks changeset is committed.)*
**Problem/Action — four items:**
1. **Duplicated headings:** `parseMarkdownByHeaders` keeps the `# Header` line as the first line of `content` ([src/utils/markdownImport.ts:119](src/utils/markdownImport.ts#L119)) and `ImportPromptModal` stores it verbatim ([src/components/Modal/ImportPromptModal.tsx:149](src/components/Modal/ImportPromptModal.tsx#L149), `:182`); compiled prompts re-emit their own per-section header, doubling it. Strip the heading line from stored content (the name already carries it).
2. **Empty-tree dangling links:** `handleImport` only inserts components into the tree `if (root)` ([ImportPromptModal.tsx:167](src/components/Modal/ImportPromptModal.tsx#L167)) but always creates the prompt with `linkedComponentId`s (`:180-189`). On an empty tree this yields sections linked to nonexistent components. Create the root folder when missing (or import unlinked in that case).
3. **Missing drag colors for new types:** `TreeNode.tsx:98` builds `dragging-component-${type}` but `App.scss:42-60` styles only the legacy five types. Drive the drag-preview border color from the `frameworks.ts` registry (inline CSS var, like Section's `--section-color`) instead of per-type SCSS classes.
4. **Lint check:** an `eslint-disable-next-line react-hooks/exhaustive-deps` was removed at [src/components/PromptEditor/Section/index.tsx:65](src/components/PromptEditor/Section/index.tsx#L65) without changing the dep array — run `npm run lint` and resolve whatever surfaces.
**Acceptance:** Importing a markdown file then copying the compiled prompt shows each heading once; import into a brand-new empty library works with functional links; dragging a component of a new type (e.g. `goal`) shows its registry color; `npm run lint` is clean.

### B8 — Define and enforce the API trust model — [P1] [Opus 4.8] [M]
**Problem:** Every route is unauthenticated, including destructive `POST /api/components` (full library replace) and `POST /api/prompts/ingest` (arbitrary writes, no body-size cap). Fine for localhost-only, but the compose/n8n setup reaches across containers and can expose port 3000 to the LAN.
**Action:**
- Bind the published port to loopback in `docker-compose.yml` (`127.0.0.1:3000:3000`) as the default; document how to widen it deliberately.
- Add an optional shared-secret header check to `/api/prompts/ingest` (secret via env var; skip check when unset), and set the header in the n8n workflow (`scripts/n8n-workflow-prompt-ingest.json`).
- Add a request body-size limit and shape validation (e.g. zod) to `ingest` and `settings` POST bodies.
- Document the trust model (localhost, single user) in README.
**Acceptance:** Default compose is unreachable from other LAN hosts; ingest rejects wrong/missing secret when configured and oversized bodies with 4xx; README states the model.

### B9 — Compose volume fails on fresh checkout — [P1] [Sonnet 5] [S]
**Problem:** `docker-compose.yml:29` declares `prompt_builder_data` with `external: true`; a fresh `docker compose up` errors until the operator manually runs `docker volume create prompt_builder_data`. Undocumented.
**Action:** Make the volume non-external (compose-managed), or keep external and document the create step in README. Prefer non-external unless there's a reason to share the volume.
**Acceptance:** `docker compose up` succeeds on a machine that has never created the volume; data persists across `down`/`up`.

---

## C — P2 Enhancements

### C1 — Re-enable disabled lint rules and fix violations — [P2] [Sonnet 5] [M]
**Problem:** `eslint.config.mjs:15-24` disables `react-hooks/exhaustive-deps`, `@typescript-eslint/no-unused-vars`, and `no-explicit-any` — the safety nets that would have caught several bugs above. `as any` casts at `TreeContext.tsx:129,148,180` among others.
**Action:** Re-enable the three rules; fix resulting violations (do C2's dead-code removal first — it eliminates many). Where a dep-array exclusion is genuinely intended, keep a targeted `eslint-disable-next-line` with a one-line reason.
**Acceptance:** `npm run lint` passes with the rules on; no blanket rule-offs remain in the config.

### C2 — Remove dead dependencies and dead code — [P2] [Sonnet 5] [M]
**Problem:** Leftovers from the pre-SQLite hosted era. Dependencies unused anywhere: `@supabase/*`, `mysql2`, `bcryptjs`, `tunnel-ssh`, `posthog-*`, `dotenv`, `ts-node`. Dead code: `src/hooks/useDragDrop.ts` and `src/hooks/useAutosizeTextArea.ts` (never imported); `getNodePath` (useTreeData), `copyPromptToClipboard` and `createSectionFromComponent` (usePrompts); unused React imports at `MenuBar/index.tsx:5`; dead `formData` fields `autoSave/defaultPromptName/defaultSectionType/theme` in [SettingsModal.tsx:22-29](src/components/Modal/SettingsModal.tsx#L22-L29); misleading "placeholder and not fully implemented" warning in `duplicatePrompt` ([PromptContext.tsx:263](src/contexts/PromptContext.tsx#L263) — it is implemented); inert `useImperativeHandle` fake-textarea in `HighlightedTextarea` (`index.tsx:37-46`) and its dead `autosize` prop; no-op `library-options` button ([Sidebar/index.tsx:125-129](src/components/Sidebar/index.tsx#L125-L129)) — wire it to something or remove it.
**Action:** Delete the deps (`npm uninstall …`), delete the dead files/functions/fields, re-verify each with a grep for imports before removal. Keep `dotenv` only if any script actually loads it.
**Acceptance:** `npm run build` and the app's main flows work; `package.json` lists no unused runtime deps; grep finds no references to removed symbols.

### C3 — Single source of truth for compiled prompt text — [P2] [Opus 4.8] [M]
**Problem:** Two divergent implementations of "the prompt as text": `getCompiledPromptText` emits `# type: name` headers and applies neither variables nor the system prompt ([PromptContext.tsx:527-532](src/contexts/PromptContext.tsx#L527-L532)), while the real copy path in [ActionBar.tsx:40-54](src/components/PromptEditor/ActionBar.tsx#L40-L54) strips headers and applies variables.
**Action:** Create `src/utils/compilePrompt.ts`: `compilePrompt(prompt, settings, variableValues, opts)` handling headers (per markdown-prompting setting), variable substitution (via B5-fixed util), and system-prompt prepending. Use it from both ActionBar and `getCompiledPromptText`; delete the duplicated logic. This is also where B7-1's "headings once" rule becomes testable, and the seam for D4 formatting.
**Acceptance:** Copy output is byte-identical to before (modulo the A6 fix); both call sites use the shared function; unit tests cover header on/off, variables, system prompt.

### C4 — Deduplicate the default system prompt — [P2] [Sonnet 5] [S]
**Problem:** Three divergent copies: `AppContext.tsx:18`, `SettingsModal.tsx:42`, and `settings/route.ts:17` (truncated server-side, so DB defaults differ from client defaults).
**Action:** Move the full text to one shared constant (e.g. `src/lib/defaults.ts`, importable by both client and server code) and import it in all three places.
**Acceptance:** Grep shows a single definition; a fresh DB's default matches the client's.

### C5 — Real loading, error, and failure states — [P2] [Sonnet 5] [M]
**Problem:** `isPromptsLoading`/`isTreeLoading` exist but nothing renders them; `src/app/loading.tsx` is `<div>loading...</div>` and `error.tsx` is the default stub; failed optimistic deletes are swallowed ([PromptContext.tsx:342-347](src/contexts/PromptContext.tsx#L342-L347)) leaving UI and DB out of sync; most fetch failures are console-only.
**Action:** Render lightweight skeleton/loading states in Sidebar and PromptEditor while loading; style `loading.tsx`/`error.tsx` properly; on failed mutations, revert the optimistic update and surface a toast/banner (a minimal toast utility is enough — no new dependency required).
**Acceptance:** Throttled network shows loading states; killing the server mid-delete restores the prompt in the UI with a visible error message.

### C6 — Consistent destructive-action confirmation — [P2] [Sonnet 5] [S]
**Problem:** Deleting a component/folder asks via `window.confirm` ([TreeNode.tsx:188-198](src/components/Sidebar/TreeView/TreeNode.tsx#L188-L198)); deleting a prompt tab deletes instantly with no confirmation ([PromptTabs.tsx:48-52](src/components/PromptEditor/PromptTabs.tsx#L48-L52)); `window.alert` is used elsewhere. Blocking native dialogs clash with the app's modal system.
**Action:** Add a small reusable `ConfirmModal` on `ModalBase`; use it for tree deletes and prompt-tab deletes; remove `window.confirm`/`alert` usages.
**Acceptance:** Both delete flows show the same styled confirmation; no `window.confirm`/`window.alert` remain in `src/`.

### C7 — Modal and landmark accessibility — [P2] [Sonnet 5] [M]
**Problem:** `ModalBase` has no `role="dialog"`/`aria-modal`, no focus trap, no Escape handling, and closes on any document `mousedown` outside ([ModalBase.tsx:43-54](src/components/Modal/ModalBase.tsx#L43-L54)) — which fires mid-text-selection. `layout.tsx:21-23` wraps children in `<main>` and `page.tsx:49` renders another `<main>` (duplicate landmark).
**Action:** Add dialog semantics, focus trap (focus first element on open, restore on close), Escape-to-close; close on `click` outside rather than `mousedown`. Remove one of the nested `<main>`s (keep the one in `page.tsx`; make layout's wrapper a `<div>`).
**Acceptance:** Keyboard-only: open modal → focus lands inside, Tab cycles within, Escape closes, focus returns to trigger. Selecting text inside a modal and releasing outside does not close it. One `<main>` in the DOM.

### C8 — Consume TreeContext directly in the tree (remove prop drilling) — [P2] [Sonnet 5] [M]
**Problem:** `Sidebar → TreeView → TreeNode` threads ~14 props through each level and recursively ([TreeView.tsx:32-49](src/components/Sidebar/TreeView/TreeView.tsx#L32-L49), [TreeNode.tsx:319-339](src/components/Sidebar/TreeView/TreeNode.tsx#L319-L339)) although everything lives in `TreeContext`.
**Action:** Have `TreeNode`/`TreeView` call `useTreeContext()` for handlers and shared state; keep only per-node data (`node`, `depth`) as props. Memoize `TreeNode` if re-render breadth becomes visible.
**Acceptance:** Prop lists shrink to node-local data; all tree interactions (rename, delete, drag, expand) still work.

### C9 — Server-side validation and deterministic ordering — [P2] [Sonnet 5] [S]
**Problem:** `GET /api/prompts` has no `ORDER BY` ([prompts/route.ts:18](src/app/api/prompts/route.ts#L18)) — tab order is arbitrary SQLite order. `sections`/`variables`/`settings_json` are persisted without shape validation; one malformed node aborts the entire bulk tree save via the CHECK constraint (`init-db.mjs:42`) with no per-node validation before the loop.
**Action:** Add `ORDER BY num, created_at` to the prompts list. Validate JSON shapes on write (zod schemas shared from `src/types/`); in the bulk components save, validate all nodes first and return a 400 naming the offending node before touching the DB.
**Acceptance:** Tab order is stable across reloads; posting a malformed node returns 400 with a useful message and leaves the library untouched.

### C10 — Versioned DB migrations — [P2] [Opus 4.8] [M]
**Problem:** `scripts/init-db.mjs` is `CREATE TABLE IF NOT EXISTS` only; schema evolution (e.g. the retrofitted `variables` column that routes defensively `COALESCE`) is ad hoc. Any future column addition breaks existing self-hosted DBs.
**Action:** Add a tiny migration runner keyed on `PRAGMA user_version`: numbered migration files (SQL or JS) applied in order inside a transaction at startup (from `src/lib/db.ts`) or via `db:init`. Migration 1 = current schema. Document adding a migration in CONTRIBUTING.md.
**Acceptance:** Fresh DB and existing DB both end at the same `user_version` with identical schema (`sqlite3 .schema` diff empty); a sample migration adding a column applies exactly once.

### C11 — Watcher resilience: periodic rescan — [P2] [Sonnet 5] [S]
**Problem:** `scripts/n8n-prompt-watcher.ps1` sweeps existing files only at startup (`:158`); if the webhook is down when a file arrives, the file is never retried until the watcher restarts (rename-on-success at `:118` means unprocessed files keep their `Prompt - *.md` name).
**Action:** In the main loop, every N minutes (e.g. 5) re-enumerate the watch dir for `Prompt - *.md` files older than the debounce window and enqueue any not already queued. The idempotent upsert on the server makes duplicate delivery safe.
**Acceptance:** Stop n8n, drop a file, restart n8n: within the rescan interval the file is ingested and renamed `Uploaded - …` with no watcher restart.

### C12 — Test infrastructure and first test suite — [P2] [Opus 4.8] [L]
**Problem:** Zero tests, no runner, no `test` script (`package.json` has only `dev/build/start/lint/db:init`).
**Action:** Add Vitest + React Testing Library (+ `@vitejs/plugin-react`, jsdom). First suites, in value order: the shared compile utility (C3); the unified markdown parser (B6) edge cases; `variableUtils` incl. B5 regression; PromptContext reorder persistence (A2 regression — assert the payload passed to fetch); one API route test against a temp SQLite file (better-sqlite3 in-memory or tmp path via env override in `src/lib/db.ts`). Add `"test": "vitest run"` and mention it in CONTRIBUTING.md.
**Acceptance:** `npm test` runs green locally; A2/A6/B5 each have a test that fails on the pre-fix code.

### C13 — VariablesPane: stop silently discarding unsaved values — [P2] [Sonnet 5] [S]
**Problem:** The pane mirrors `prompt.variables` into local `variableValues` ([VariablesPane/index.tsx:15-17](src/components/VariablesPane/index.tsx#L15-L17)) and persists only on explicit Save (`:61-66`); the sync effect (`:51`) resets local state when switching prompts, discarding unsaved edits without warning. Also `getPromptVariables` reads the stale `promptsRef` while `getPromptVariableNames` reads fresh `prompts` (`PromptContext.tsx:591-603`) — inconsistent sources.
**Action:** Persist variable values on blur or a short debounce (drop the explicit Save, or keep it as a no-op affordance); make both getters read the same fresh source.
**Acceptance:** Type a variable value, switch prompt tabs and back: the value survives without pressing Save.

---

## D — P3 New Features
*(Redrafted from the former README "Feature Ideas". Each assumes relevant P0/P1 groundwork above — noted per item.)*

### D1 — Component-level prompt variables — [P3] [Opus 4.8] [L]
*Depends on: C10 (migration), B5.*
**Spec:** Components in the library can declare variables. `{{var}}` extraction already exists at prompt level (`src/utils/variableUtils.ts`, `VariablesPane`). Add: (1) a `variables` JSON column on `component_library` via a migration — name, optional default, optional description per variable; (2) auto-extraction of `{{…}}` placeholders in the component editor (`ComponentModal`) with a small list UI to set defaults/descriptions; (3) when a component is linked into a section, merge its variables (with defaults pre-filled) into the prompt's VariablesPane, deduplicating by name; (4) compile-time substitution stays in the shared compiler (C3).
**Acceptance:** Create a component with `{{tone}}` (default "formal"); drag it into a prompt; VariablesPane shows `tone` pre-filled; Copy Prompt substitutes it; a second component reusing `{{tone}}` shares one pane entry.

### D2 — Component nesting / composition — [P3] [Opus 4.8] [L]
*Depends on: C3.*
**Spec:** A component's content may reference another component by name with `{{> Component Name}}`. Resolution happens at compile time in the shared compiler: replace each reference with the target's (recursively resolved) content; detect cycles and fail compilation with a clear message naming the cycle; unresolved names compile to a visible `[missing: name]` marker. UI: an "insert component reference" affordance in `ComponentModal` (searchable dropdown of library components); referenced components show a badge in the tree. Nested components' variables surface through D1's merge.
**Acceptance:** A→B→C nesting compiles fully expanded; A→B→A reports a cycle instead of hanging; deleting a referenced component makes the missing-marker appear in compiled output.

### D3 — Built-in meta-prompting (AI refine) — [P3] [Opus 4.8] [L]
*Depends on: A5 (prod build), B8 (validation pattern).*
**Spec:** An "Improve with AI" action for a section or the whole prompt. Settings gains an Anthropic API key field stored in `app_config.settings_json` (server-side only — the key must never be sent to the browser after save; mask it in the settings GET). New route `POST /api/ai/refine` `{ scope: 'section'|'prompt', content, instruction? }` calls the Anthropic Messages API (model configurable, default the current Sonnet) with a fixed meta-prompt asking for an improved version. UI: button in `SectionHeader`/`ActionBar` → modal showing original vs. suggestion side-by-side → Accept replaces content (marking the section dirty), Reject discards. Handle missing key (prompt user to Settings), API errors (surface message), and never log the key or prompt bodies.
**Acceptance:** With a valid key, refining a section returns a suggestion and Accept updates content; without a key the UI directs to Settings; the key is absent from all client-visible API responses and logs.

### D4 — Automatic formatting — [P3] [Sonnet 5] [M]
*Depends on: C3.*
**Spec:** A `formatPrompt` pure function beside the shared compiler, plus a "Format" action in `ActionBar`: normalize section heading levels per the framework registry (`src/lib/frameworks.ts`), collapse 3+ consecutive blank lines to one, trim trailing whitespace per line, normalize variable spacing (`{{ x }}` → `{{x}}`), and leave fenced code blocks untouched. Offer as both an on-copy toggle in Settings and a manual action.
**Acceptance:** Unit tests cover each rule incl. the fenced-code exemption; formatting is idempotent (`format(format(x)) === format(x)`).

### D5 — Compiled prompt libraries (export / import bundles) — [P3] [Opus 4.8] [M]
*Depends on: B6, B7.*
**Spec:** Export a prompt (with its linked components) or a component folder as a portable single-file bundle (JSON envelope: version, prompts[], components[] with tree structure, variables). Import merges a bundle through the existing `ImportPromptModal` review flow (reusing its type-mapping UI), generating fresh ids and inserting under the root; name collisions get a ` (imported)` suffix. Round-trip must preserve section types, component links, and variables. Export via a download button in the prompt tab context menu and folder context menu.
**Acceptance:** Export a prompt with 3 linked components on machine A; import on a clean DB: identical sections/types/links/variables; importing the same bundle twice produces suffixed copies, not corruption.

### D6 — Style / design refresh — [P3] [Sonnet 5 → Opus 4.8] [L]
*Depends on: B7-3.*
**Spec:** Three workstreams: (1) **Finish the color-system migration** started in the import changeset — `frameworks.ts` registry is the single source of type colors; remove the legacy per-type SCSS fallbacks in `src/styles/variables/_colors.scss:19-20` once every consumer (drag preview, icons, sections) reads the registry. (2) **Theme toggle UI** — theme state already exists (`page.tsx:44-46`) and a dead `theme` field sits in SettingsModal; add the actual control in Settings and persist via settings JSON; audit both themes for contrast. (3) **Token normalization** — consolidate spacing/typography into SCSS variables/mixins (extend `src/styles/variables/`), replacing magic numbers in component SCSS.
**Acceptance:** No hard-coded type colors outside `frameworks.ts`; theme switchable from Settings and persists across reloads; both themes pass a contrast spot-check on Sidebar, editor, and modals.

---

## Suggested sequencing for the week

1. **Commit hygiene first:** A1, then land the WIP import feature with B7 fixes, keeping A5's dependency decision out of that commit.
2. **Data-integrity block:** A2, A3, A6, B1, B4 (small, high-payoff), then A7 and A4.
3. **Platform block:** A5, B2, B3, B9, B8.
4. **Quality ratchet:** C2 → C1 → C3/C4 → C12 (tests lock in the fixes above).
5. **Features (D)** only after C3/C10 exist — most D items build on them.
