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

---

## A5. Correct Docker production deployment

**Priority:** P0  
**Size:** M

### Problem

The container currently runs the application using the Next.js development server.

Database initialisation errors can also be silently ignored.

### Action

Create a production multi-stage image.

Use:

```text
npm ci
next build
production runtime
```

Database initialisation must fail visibly and terminate the container when required.

Use an appropriate current Node LTS base image.

### Acceptance

- `docker compose up --build` starts a production Next.js application
- no Turbopack development banner appears
- a database initialisation failure terminates the container
- the error is visible in container logs

### Outcome

Verified on 2026-08-28 with `docker compose up --build` against a clean `prompt_builder_data` volume:

- the container serves the built app — `next start`, `GET /` 200, the API routes answer, and a prompt created through the API survived a container restart;
- the logs show only the plain Next.js start banner, with no Turbopack or development banner;
- run against a corrupt database file, the container exits 1 without ever reaching `next start`;
- that failure reads `Error initializing database: SqliteError: file is not a database` (`SQLITE_NOTADB`) in `docker logs`.

Three defects surfaced along the way and were fixed: `node:22` ships npm 10, which rejects the lockfile over vite’s optional `yaml` peer (base image is now `node:24-bookworm-slim`, npm 11); `next build` imported `lib/db` while collecting page data and hit the new schema check against the image’s empty data directory (the connection now opens lazily); and `chown -R` over `node_modules` added minutes to every build (only `/app/data` and `/app/.next` need the node user).

**Completed:** 2026-08-28 · `ec8e55b`

---

## B1. Enable SQLite foreign keys

**Priority:** P1  
**Size:** S

Enable:

```sql
PRAGMA foreign_keys = ON;
```

at database connection time.

### Acceptance

Configured cascades and `SET NULL` operations execute correctly.


**Completed:** 2026-09-02 · `773872d`

---

## B3. Add runtime API validation

**Priority:** P1  
**Size:** M

### Problem

TypeScript casts currently provide compile-time convenience but no runtime protection.

For example:

```ts
body as Partial<Prompt>
```

does not validate input.

### Action

Introduce Zod or an equivalent runtime schema library.

Create schemas for:

- prompts
- sections
- components
- folders
- settings
- variable specifications
- imports

### Acceptance

Malformed API payloads:

- return HTTP 400
- include a useful error
- do not partially modify the database


**Completed:** 2026-09-02 · `ae7b463`

---

## B4. Introduce explicit API request and response contracts

**Priority:** P1  
**Size:** M

Define explicit models for:

```text
CreatePromptRequest
UpdatePromptRequest
PromptResponse
ComponentResponse
SettingsResponse
ErrorResponse
```

Where practical, derive TypeScript types from runtime schemas.

### Acceptance

Frontend and API use the same contract definitions.


**Completed:** 2026-09-02 · `570f0da`

---

## B5. Introduce consistent API failure handling

**Priority:** P1  
**Size:** M

### Problem

Many frontend `fetch()` calls only catch network exceptions.

HTTP 400 and HTTP 500 responses can therefore appear successful to the UI.

### Action

Introduce a shared API client which:

1. performs the request
2. checks HTTP status
3. parses the response
4. throws a typed application error
5. provides useful failure information to the UI

### Acceptance

API failures result in visible application feedback and do not silently mark failed changes as saved.


**Completed:** 2026-09-02 · `ae7b463`

---

## B6. Correct optimistic deletion behaviour

**Priority:** P1  
**Size:** S

Do not permanently remove a prompt from the UI before confirming server-side deletion unless rollback is implemented.

For a local-first application, prefer pessimistic delete unless there is a material UX reason not to.

### Acceptance

If database deletion fails, the prompt remains visible and an error is shown.


**Completed:** 2026-09-02 · `ae7b463`

---

## B7. Restore folder expansion state

**Priority:** P1  
**Size:** S

Persist and restore component folder expanded/collapsed state consistently.

### Acceptance

Expand folders, reload Prompt Builder and confirm the same folders remain expanded.


**Completed:** 2026-09-02 · `ae7b463`

---

## B8. Unify Markdown parsing

**Priority:** P1  
**Size:** L

### Problem

Different Markdown import paths currently apply different parsing behaviour.

### Action

Create one shared Markdown parser.

It must:

- understand the same heading rules everywhere
- respect fenced code blocks
- map section types through one registry
- support prompt variable syntax consistently

### Acceptance

The same Markdown document produces the same prompt structure regardless of import path.


**Completed:** 2026-09-02 · `c747649`

---

## B9. Make prompt ordering deterministic

**Priority:** P1  
**Size:** S

Add explicit ordering when loading prompts.

Use a deterministic field such as:

```text
num
created_at
```

### Acceptance

Prompt tab order is stable across restarts.


**Completed:** 2026-09-02 · `773872d`

---

## B10. Add versioned database migrations

**Priority:** P1  
**Size:** M

### Problem

`CREATE TABLE IF NOT EXISTS` is insufficient once existing installations need schema changes.

### Action

Introduce schema migrations using:

```sql
PRAGMA user_version
```

or an equivalent small migration system.

### Acceptance

- new installations reach the current schema
- old installations migrate automatically
- migrations run exactly once
- database schema version can be inspected


**Completed:** 2026-09-02 · `773872d`

---

## F1. Add test infrastructure

**Priority:** P2  
**Size:** M

Introduce:

- Vitest
- React Testing Library
- jsdom where required

Add:

```text
npm test
```

### Acceptance

Tests run locally with one command.


**Completed:** 2026-09-02 · `ae7b463`

---

## F2. Add variable parser tests

**Priority:** P2  
**Size:** S

Cover:

```text
{{tone}}
{{ mail / teams }}
{{channel: formal/casual}}
custom choices
regex metacharacters
empty values
unknown variables
```


**Completed:** 2026-09-02 · `570f0da`

---

## C1. Separate source prompts from working prompt state

**Priority:** P1  
**Size:** L

### Product model

Prompt Builder must distinguish between:

```text
Source Prompt
Working Prompt
Resolved Prompt
```

### Source Prompt

The persistent reusable library artefact.

Example:

```text
Review the {{technology}} environment for {{customer}}.

Produce the response in a {{tone: formal/technical/executive}} style.
```

### Working Prompt

The source plus values for the current use:

```text
technology = Microsoft Intune
customer = Contoso
tone = technical
```

Working state may also contain temporary edits.

### Resolved Prompt

The exact text that will be copied:

```text
Review the Microsoft Intune environment for Contoso.

Produce the response in a technical style.
```

### Action

Introduce an explicit working-state model separate from persisted prompt source.

Example:

```ts
type PromptWorkspace = {
  promptId: string;
  values: Record<string, string>;
  sectionOverrides?: Record<string, string>;
};
```

### Acceptance

Entering working values does not mutate variable definitions in the source prompt.


**Completed:** 2026-09-02 · `21ef119`

---

## C2. Preserve variable definitions and option sets

**Priority:** P1  
**Size:** M

### Requirement

Variable options are part of the source prompt.

Example:

```text
{{channel: email/Teams/WhatsApp}}
```

must always continue to expose:

```text
email
Teams
WhatsApp
Custom
```

The working value is separate.

### Acceptance

Select:

```text
Teams
```

then clear working values.

The source still contains:

```text
{{channel: email/Teams/WhatsApp}}
```

and all choices remain available.


**Completed:** 2026-09-02 · `21ef119`

---

## C3. Consolidate variable parsing into one grammar

**Priority:** P1  
**Size:** M

Support consistently:

```text
{{tone}}
{{mail/teams/calendar}}
{{channel: mail/teams/calendar}}
```

Create one parser used by:

- extraction
- highlighting
- substitution
- validation
- preview
- import

### Acceptance

Whitespace variants such as:

```text
{{ mail / teams }}
```

resolve identically to:

```text
{{mail/teams}}
```


**Completed:** 2026-09-02 · `c747649`

---

## C4. Separate persisted Section data from UI state

**Priority:** P1  
**Size:** M

### Problem

Section currently mixes persistent prompt content and editor state.

Persistent:

```text
name
content
type
linkedComponentId
```

UI:

```text
open
dirty
editingHeader
editingHeaderTempName
```

### Action

Create separate models.

Example:

```ts
type Section = {
  id: string;
  name: string;
  content: string;
  type: SectionTypeValue;
};

type SectionUiState = {
  open: boolean;
  dirty: boolean;
  editingHeader: boolean;
};
```

### Acceptance

UI-only state is never serialised into stored prompt content.


**Completed:** 2026-09-02 · `21ef119`

---

## C5. Define reusable components as prompt fragments

**Priority:** P1  
**Size:** M

### Product decision

Components are reusable prompt fragments rather than independent prompt artefacts.

Example library:

```text
Components
├── Roles
│   ├── Microsoft 365 Architect
│   └── Security Reviewer
├── Constraints
│   ├── British English
│   └── Cite Sources
└── Output
    ├── Markdown Table
    └── Executive Summary
```

A component helps build a source prompt.

### Default behaviour

Inserting a component should create a copy by default.

This prevents a later component edit from silently changing every existing prompt.

### Future option

Explicit linked components may remain available as an advanced feature.

### Acceptance

Insert a reusable component into Prompt A.

Later modify the source component.

Prompt A does not change unless the section was explicitly configured as linked.


**Completed:** 2026-09-02 · `e0b0b8f`

---

## C6. Clarify linked component behaviour

**Priority:** P1  
**Size:** M

If linked components remain supported, linkage must be explicit rather than implicit.

The UI should clearly identify:

```text
Copied component
```

versus:

```text
Linked component
```

### Acceptance

The user can determine from the editor whether a section will automatically follow future component changes.


**Completed:** 2026-09-02 · `e0b0b8f`

---

## D3. Add Clear Working Values

**Priority:** P1  
**Size:** S

Provide a visible action:

```text
Clear values
```

This must:

- clear current variable values
- retain source prompt
- retain variable definitions
- retain variable option lists
- retain source prompt edits

### Acceptance

Variable options remain intact after clearing.


**Completed:** 2026-09-02 · `21ef119`

---

## D1. Create a single prompt compiler

**Priority:** P1  
**Size:** M

### Problem

More than one implementation currently determines what constitutes the compiled prompt.

### Action

Create:

```text
compilePrompt()
```

as a pure domain function.

It should handle:

- ordered sections
- variable substitution
- system prompting
- formatting options
- unresolved variables
- section headings where applicable

### Acceptance

Every feature that needs resolved prompt text uses this compiler.


**Completed:** 2026-09-02 · `60d485f`

---

## D2. Add first-class resolved prompt preview

**Priority:** P1  
**Size:** M

Provide:

```text
Source | Preview
```

Preview must display exactly what Copy Prompt will place on the clipboard.

### Example

Source:

```text
Send the response using {{channel: email/Teams/WhatsApp}}
in a {{tone: formal/casual}} tone.
```

Working values:

```text
channel = Teams
tone = formal
```

Preview:

```text
Send the response using Teams
in a formal tone.
```

### Acceptance

Preview and clipboard output are byte-for-byte identical.


**Completed:** 2026-09-02 · `60d485f`

---

## D4. Define unresolved variable behaviour

**Priority:** P1  
**Size:** S

The compiler must have explicit behaviour for unpopulated variables.

Current intended behaviour should be documented and tested.

If empty variables are intended to resolve to empty text, ensure this behaviour is consistent.

Consider warning users before copy when unresolved variables remain.

### Acceptance

Behaviour is consistent between preview and clipboard.


**Completed:** 2026-09-02 · `60d485f`

---

## D5. Introduce save-state visibility

**Priority:** P1  
**Size:** M

Expose application persistence state such as:

```text
Saved
Saving
Unsaved changes
Save failed
```

### Acceptance

Users can determine whether changes have been persisted locally.


**Completed:** 2026-09-02 · `eeb8b4f`

---

## F3. Add compiler tests

**Priority:** P2  
**Size:** M

Cover:

- multiple sections
- section order
- system prompt
- variable resolution
- blank variables
- choice variables
- custom variable values
- formatting
- preview equality


**Completed:** 2026-09-02 · `60d485f`

---

## G1. Add typecheck script

Add:

```json
"typecheck": "tsc --noEmit"
```


**Completed:** 2026-09-02 · `eeb8b4f`

---

## F4. Add persistence regression tests

**Priority:** P2  
**Size:** M

Cover:

- reorder then reload
- insert then reload
- delete then reload
- Prompt A and Prompt B edited inside debounce period

**Completed:** 2026-09-02 · `0f3bfe6`

---

## F5. Add SQLite API integration tests

**Priority:** P2  
**Size:** M

Use a temporary or isolated SQLite database.

Cover prompt and component CRUD.


**Completed:** 2026-09-02 · `0f3bfe6`

---

## G2. Add GitHub Actions CI

Run:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

for every pull request.


**Completed:** 2026-09-02 · `0f3bfe6`

---

## G6. Remove workstation-specific paths

Remove comments containing local machine paths such as:

```text
C:\Users\...
```


**Completed:** 2026-09-02 · `0f3bfe6`

---

## E2. Remove direct `setPrompts` exposure

**Priority:** P2  
**Size:** S

Consumers should not mutate the prompt collection directly.

Use intent-based methods:

```text
createPrompt
renamePrompt
deletePrompt
moveSection
updateSection
```

### Acceptance

No component outside the state implementation calls `setPrompts`.


**Completed:** 2026-09-02 · `b7d1ed4`

---

## E3. Use fail-fast React contexts

**Priority:** P2  
**Size:** S

Contexts should default to:

```ts
undefined
```

rather than large collections of no-op methods.

Hooks should throw when used outside the appropriate provider.

### Acceptance

Incorrect provider usage fails immediately during development.


**Completed:** 2026-09-02 · `b7d1ed4`

---

## E5. Add typed database row mappers

**Priority:** P2  
**Size:** S

Replace broad `any` usage around SQLite results.

Create mappings such as:

```text
PromptRow → Prompt
ComponentRow → Component
```

### Acceptance

No routine prompt persistence path relies on untyped `any`.


**Completed:** 2026-09-02 · `b7d1ed4`

---

## G3. Add dependency auditing

Review and remove unused dependencies including historical hosted-service dependencies where confirmed unused.

Candidate areas include:

```text
Supabase
PostHog
MySQL
SSH tunnel
bcrypt
dotenv
```

Do not remove dependencies until usage has been verified.

Consider using `knip`.


**Completed:** 2026-09-02 · `b7d1ed4`

---

## G5. Remove historical implementation comments

Remove comments such as:

```text
Changed from number
Corrected
New property
Removed
```

Git history already records implementation changes.

Comments should explain why behaviour exists.


**Completed:** 2026-09-02 · `b7d1ed4`

---

## G7. Remove dead files and dead code

Audit:

- unused hooks
- unused functions
- unused imports
- no-op UI buttons
- abandoned configuration fields

Remove only after confirming no references remain.


**Completed:** 2026-09-02 · `b7d1ed4`

---

## G8. Remove large repository demo asset

Replace the approximately 30 MB animated GIF with a more appropriate mechanism such as:

- compressed WebM
- GitHub release asset
- externally hosted demo


**Completed:** 2026-09-02 · `b7d1ed4`

---

## E1. Reduce PromptContext responsibilities

**Priority:** P2  
**Size:** L

### Problem

PromptContext currently manages:

- loading
- persistence
- prompt mutation
- section mutation
- variable handling
- prompt compilation
- active prompt state
- temporary UI state

### Action

Separate concerns into:

```text
domain
API
persistence
state
UI hooks
```

Suggested structure:

```text
src/features/prompts/
  domain/
  api/
  hooks/
  state/
  components/
```

### Acceptance

PromptContext becomes an orchestration layer rather than the primary business logic implementation.


**Completed:** 2026-09-03 · `21d8699`

---

## E4. Introduce repository abstractions

**Priority:** P2  
**Size:** M

Create:

```text
promptsRepository
componentsRepository
settingsRepository
```

These should encapsulate SQLite persistence.

React should not depend upon database implementation details.

### Acceptance

API routes delegate database operations to repositories.


**Completed:** 2026-09-03 · `fae69ab`

---

## H1. Rewrite README for the current architecture

The README should accurately describe:

```text
Next.js
React
TypeScript
SCSS
SQLite
local-first operation
```

Remove references to historical Vite or Chrome extension architecture unless genuinely current.


**Completed:** 2026-09-03 · `d2f51c1`

---

## H2. Correct database documentation

Document the actual database location:

```text
data/prompt_builder.db
```

and its backup implications.


**Completed:** 2026-09-03 · `d2f51c1`

---

## H3. Document the source/working/resolved model

Explain:

### Source Prompt

Persistent reusable template.

### Working Prompt

Current values and temporary preparation state.

### Resolved Prompt

Exact clipboard output.


**Completed:** 2026-09-03 · `d2f51c1`

---

## H4. Document variable grammar

Document all supported forms:

```text
{{tone}}

{{mail/teams/calendar}}

{{channel: mail/teams/calendar}}
```

Include:

- whitespace rules
- Custom option behaviour
- repeated variables
- empty values


**Completed:** 2026-09-03 · `d2f51c1`

---

## H5. Add architecture documentation

Describe:

```text
UI
 ↓
domain/state
 ↓
API
 ↓
repository
 ↓
SQLite
```

This should remain intentionally lightweight.


**Completed:** 2026-09-03 · `d2f51c1`

---

## F6. Add Playwright smoke tests

**Priority:** P2  
**Size:** L

Initial scenarios:

1. create prompt
2. edit prompt
3. reload
4. verify persistence
5. populate variable
6. preview result
7. copy prompt
8. compare clipboard output
9. clear values
10. verify source options remain


**Completed:** 2026-09-03 · `87501cc`

---

## G4. Standardise formatting

Add Prettier and repository-wide formatting rules.

Standardise:

- quotes
- indentation
- trailing commas
- line wrapping
- import ordering where appropriate


**Completed:** 2026-09-03 · `2ca7c34`

---

## I1. Complete prompt duplication

**Priority:** P3  
**Size:** S

Make duplicate prompt a fully supported and tested workflow.

### Acceptance

Duplicating a prompt creates an independent source prompt with independent section IDs and preserved variable definitions.


### How it was met

Duplication was rebuilt in E1 and is now covered by a test that checks the copy gets new section ids with its variable definitions intact.

**Completed:** 2026-09-03 · `c276d61`

---

## J1. Preserve choice variables as source definitions

This is mandatory throughout future variable development.

Choice options must never be replaced by the last selected working value.


### How it was met

Working values live in prompt_workspaces, so a selection can never overwrite the option list written in the source. Covered by tests/unit/workspace.test.tsx.

**Completed:** 2026-09-03 · `21ef119`

---

## J5. Improve Custom option behaviour

Choice variables must support:

```text
Custom…
```

A custom current value does not modify the persistent option list.


### How it was met

The Custom… entry reads and writes only the working value; options come from the section text, so a custom value leaves them alone. Covered by tests/unit/variableUtils.test.ts.

**Completed:** 2026-09-03 · `21ef119`

---

## L1. Default component insertion to Copy

Dragging or inserting a component into a prompt creates an independent section by default.

This protects existing prompts from future component modifications.


### How it was met

Every insertion path sets linked: false, so a component is copied unless the user asks otherwise. Covered by tests/unit/componentLinkage.test.ts.

**Completed:** 2026-09-03 · `e0b0b8f`

---

## L2. Explicit linked component option

Allow an advanced user to choose:

```text
Keep linked
```

when they genuinely want future component updates to flow into the prompt.


### How it was met

The section indicator carries a Link to component / Make a copy button.

**Completed:** 2026-09-03 · `e0b0b8f`

---

## L3. Show component origin

A copied component may optionally retain provenance metadata:

```text
Originally inserted from:
Security Reviewer
```

This is informational only.

It must not create automatic synchronisation.


### How it was met

A copied section keeps linkedComponentId for provenance and reads "Copied from <name>"; it does not follow the component.

**Completed:** 2026-09-03 · `e0b0b8f`

---

## L4. Show linked status visually

Linked sections must be clearly identifiable.

Example:

```text
🔗 Linked: Security Reviewer
```


### How it was met

A linked section reads "Linked to <name> — follows changes to it" in the accent colour, which a copy does not.

**Completed:** 2026-09-03 · `e0b0b8f`

---

## L5. Warn before modifying a linked component

If a component change will affect multiple prompts, Prompt Builder should report the number of linked prompts before saving.

This applies only if linked components remain supported.


### How it was met

Confirming a component edit reports how many linked sections and prompts it will change, and waits for a second Confirm.

**Completed:** 2026-09-03 · `c276d61`
