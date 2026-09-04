# Prompt Builder Backlog

# Prompt Builder — Backlog

Drafted 2026-07-06 from a full code review (frontend, backend/data layer, and the in-flight markdown-import changeset) plus the former "Feature Ideas" list in README.md.

**How to use this file.** Each item is self-contained and written to be executed cold by an AI coding model. Pick an item, read the referenced files, implement, and satisfy the acceptance criteria. Line numbers were accurate at drafting time — treat them as starting points and re-verify against the current code before editing.

**When an item is done.** Once its acceptance criteria genuinely pass, move the whole item verbatim out of this file into [`BACKLOG-completed.md`](BACKLOG-completed.md) under `## Completed`, appending a `**Completed:** <YYYY-MM-DD> · <commit SHA>` line. Keep the ID — IDs are never reused. This file should only ever contain open work.

**Tags.**
- Priority: **P0** data loss / broken behavior · **P1** correctness & robustness · **P2** quality & maintainability · **P3** new features.
- Model: **Sonnet 5** for mechanical/localized changes · **Opus 4.8** for cross-cutting design or feature work.
- Size: **S** < 1 h · **M** half-day · **L** multi-session.

---
## Product direction

Prompt Builder is a local-first library and editor for reusable source prompts.

The primary workflow is:

```text
Find
  ↓
Select
  ↓
Customise
  ↓
Resolve
  ↓
Copy
```

Prompt Builder does not execute prompts against AI models. Its responsibility ends when the resolved prompt is copied to the clipboard.

The application should remain provider-neutral.

The primary persistent artefacts are:

- prompts
- prompt sections
- reusable components
- folders
- variable definitions
- settings

Variable values entered while preparing a prompt are working state rather than part of the source prompt by default.

Variable definitions remain part of the source prompt, including:

- variable name
- label
- available options
- syntax
- defaults where supported

Example:

```text
{{channel: email/Teams/WhatsApp}}
```

The options `email`, `Teams` and `WhatsApp` belong to the source prompt.

If the user selects `Teams`, that selection belongs to the current working state.

Resetting working values must restore the variable to an unpopulated state without removing its available options.

---

# Priority definitions

## P0

Data loss, incorrect persistence, broken behaviour or repository risks which can directly corrupt or lose user data.

## P1

Correctness, reliability and architectural changes required to provide a stable application model.

## P2

Maintainability, usability, consistency and engineering quality improvements.

## P3

New product capabilities.

---

# Explicitly Out of Scope

The following should not influence near-term architecture.

## Hosted operation

Prompt Builder is local first.

Hosted or multi-user operation may be considered later.

## Authentication

No authentication requirement exists for the local application.

## Cloud database

SQLite remains the authoritative persistence mechanism.

## Direct AI execution

Prompt Builder does not currently send prompts directly to:

```text
OpenAI
Anthropic
Google
Microsoft
```

## Provider API credentials

Do not introduce model provider API key storage unless direct execution becomes an explicit future product decision.

## Conversation history

Prompt Builder is not a chat application.

## Model output storage

Prompt Builder stores source prompts, not AI responses.

## Cross-platform interchange standard

JSON and Markdown are Prompt Builder's practical import/export formats.

There is no requirement to create a universal prompt standard.

---

# Recommended Implementation Sequence

## Phase 1. Protect data

Complete:

```text
A1
A2
A3
A4
A5
A6
A7
B1
```

No major product features should be added before these are stable.

---

## Phase 2. Establish correctness boundaries

Complete:

```text
B2
B3
B4
B5
B6
B8
B9
B10
```

Introduce robust API contracts and migrations.

---

## Phase 3. Establish the prompt model

Complete:

```text
C1
C2
C3
C4
C5
C6
```

This establishes the source versus working versus resolved model.

---

## Phase 4. Make copy workflow authoritative

Complete:

```text
D1
D2
D3
D4
D5
```

At the end of this phase:

```text
Preview === Clipboard
```

must be a guaranteed invariant.

---

## Phase 5. Add automated protection

Complete:

```text
F1
F2
F3
F4
F5
F6
G1
G2
```

This locks in the behaviour from the earlier phases.

---

## Phase 6. Simplify architecture and repository

Complete:

```text
E1–E5
G3–G8
H1–H5
```

---

## Phase 7. Improve library usability

Complete selectively:

```text
I1–I6
J1–J5
K1–K3
L1–L5
```

---

## Phase 8. Local-first resilience

Complete:

```text
M1
M2
M3
M4
```

For a local-first application this should be treated as an important product capability rather than optional administration.

---

## Phase 9. Advanced capability

Consider:

```text
N1–N3
O1–O3
```

only after the core workflow is mature.

---

## Phase 10. Library and tab usability

Complete:

```text
Q1
Q2
Q3
```

These separate the tab strip from the saved library, so that closing a tab stops being a destructive act, and give a hand-written section a route into the component library.

---

# Open items

## Q1. Closing a tab should close it, not delete the prompt

**Priority:** P1  
**Model:** Opus 4.8  
**Size:** L

### Problem

Tabs and the saved library are the same list. `PromptContext` holds every persisted prompt in `prompts`, `PromptTabs` renders a tab for each one, and the tab's X calls `deletePrompt` with no confirmation — so the only way to tidy the tab strip is to permanently destroy a prompt and its workspace, which `prompt_workspaces` cascades away with it. The guard in `PromptTabs` only prevents this for the last remaining prompt.

There is also no persistent view of what has been saved. `PromptBrowser` finds a prompt by search, but nothing lists the library, and nothing offers a deliberate delete.

### Action

Introduce an open-tab set distinct from the saved library.

**Context and state** — `src/contexts/PromptContext.tsx`

- Add `openPromptIds: string[]` plus `openPrompt(promptId)` and `closePrompt(promptId)` to the context value. Order is the tab order; opening an already-open prompt just activates it.
- Tabs render from `openPromptIds`, not from `prompts`.
- `addPrompt`, `duplicatePrompt` and the markdown import path open the prompt they create. `createOptimistically` already sets the new prompt active — it must also add it to the open set, and take the temporary client id back out when the create fails.
- `deletePrompt` closes the prompt as well as deleting it.
- Rework the keep-a-prompt-selected effect: it must fall back to another **open** prompt, and allow "no prompt open" as a valid state rather than forcing `prompts[0]`.

**Persistence** — migration 8, `app_config.open_prompt_ids`

- Add `open_prompt_ids TEXT` to `createAppConfigTable` in `src/lib/migrations.mjs` and a `version: 8` migration guarded by the existing `hasColumn` helper, following the comment pattern established by migration 2: the baseline carries the column, so the migration is a no-op on a fresh install.
- A JSON array cannot carry the `ON DELETE SET NULL` foreign key that `active_prompt_id` has, so `settingsRepository.ts` must filter out ids with no row in `prompts` on both read and write. Reuse the existence check `saveConfig` already performs for `active_prompt_id`.
- Extend `StoredConfig` and `saveConfig` with `openPromptIds`, `updateSettingsRequestSchema` in `src/types/contracts.ts`, both handlers in `src/app/api/settings/route.ts`, and `fetchActivePromptId` / `saveActivePromptId` in `src/api/promptsApi.ts` — renamed, since they now carry both halves.
- Queue the write through the existing debounced saver: widen `queueActivePromptId` in `src/hooks/usePromptPersistence.ts` to take the active id and the open list together, so one POST carries both.
- On load, drop stored ids whose prompt no longer exists. If the open list is empty but prompts exist, open the stored active prompt, or the first prompt, so the app never starts with a blank editor over a full library.

**Tab strip** — `src/components/PromptEditor/PromptTabs.tsx`

- The X becomes Close: `title="Close Tab"`, a matching `aria-label`, and `closePrompt`. Remove the `prompts.length <= 1` guard and its `alert`.
- Accept the open prompts as the `prompts` prop from `PromptEditor/index.tsx`.

**Saved Prompts sidebar section** — new `src/components/Sidebar/SavedPrompts.tsx`

- Renders beneath `.tree-container` and above `FileControls` in `Sidebar/index.tsx`, with its own `<h2>Saved Prompts</h2>` header matching the existing Library header.
- A flat list of every prompt: favourite star, as `PromptBrowser` shows one; name; click to open and activate; and a delete button that appears on hover, as `.node-actions` does in `SideBar.scss`.
- A name filter input. Reuse `searchPrompts` from `src/domain/promptSearch.ts` with `{ filter: 'all', query, tag: null }` rather than writing new matching.
- Mark the prompts that are already open — a dot, or bold — so the list says what is in the tab strip.
- Delete confirms with `window.confirm`, as `TreeNode` does for a component, naming the prompt and saying that its saved working values go with it.
- Styles alongside the sidebar rules in `SideBar.scss`. The section scrolls independently and must not squeeze the component tree out of view.

**Empty state** — `PromptEditor/index.tsx`

- Distinguish "no prompt open" — offer to open one from Saved Prompts, plus Create Prompt — from "no prompts exist at all", where Create Prompt is the only move. The current copy, "No prompts available", is wrong once the tabs can be empty while the library is full.

### Acceptance

- Closing a tab leaves the prompt in Saved Prompts, and `GET /api/prompts` still returns it
- Reopening it from Saved Prompts restores its sections and its working values unchanged
- Closing every tab shows an empty state offering to open a saved prompt or create one, with the library intact
- Deleting from Saved Prompts asks for confirmation, removes the prompt from SQLite, and closes its tab if it is open
- Open tabs, their order, and the active tab survive a restart; ids for deleted prompts are dropped silently on load
- Creating, duplicating or importing a prompt opens it as a tab
- No path in the UI deletes a prompt without confirmation; the `prompts.length <= 1` guard and its `alert` are gone
- `tests/unit/migrations.test.ts` and `tests/unit/schemaConstraints.test.ts` pass against schema version 8
- A unit test covers close-then-reopen preserving the prompt, and delete removing it

---

## Q2. Relabel "Import Prompt" as "Import Prompt Component"

**Priority:** P2  
**Model:** Sonnet 5  
**Size:** S

### Problem

The sidebar button labelled "Import Prompt" sits under the component Library, and what it creates is a folder of library components plus a prompt whose sections are linked to them. The label reads as a prompt-only import, which hides what the control adds to the library.

### Action

- Change the button text in `src/components/Sidebar/index.tsx` to `Import Prompt Component`, and its `title` to match.
- Change the modal title in `src/components/Modal/ImportPromptModal.tsx` from `Import Prompt from Markdown` to `Import Prompt Component from Markdown`.
- Leave the class names `.import-prompt-btn` and `.import-prompt-modal`, the context field `importPromptPayload`, and all behaviour untouched. This is a wording change only.

### Acceptance

- The sidebar button reads "Import Prompt Component"
- The import modal's title matches the button's wording
- No behavioural change: importing still creates the folder of components and the linked prompt
- Existing tests pass with no selector changes

---

## Q3. Save a hand-written section as a prompt component

**Priority:** P3  
**Model:** Sonnet 5  
**Size:** M

### Problem

`saveSectionToComponentLibrary` in `src/hooks/usePrompts.ts` returns early unless the section has a `linkedComponentId`, and the "Save to Library" button only renders for a linked, dirty section. So it only ever pushes edits back to a component the section already came from.

A section written from scratch — the common case when authoring a new prompt — has no way into the component library, and reusable text has to be copied out by hand and re-entered through the sidebar. `ComponentModal` also has no folder picker: it writes to `selectedNode`, which is whatever the sidebar happens to have selected.

### Action

**Folder list helper** — `src/utils/treeUtils.ts`

- Add `listFolders(tree: FolderType[]): { id: string; name: string; depth: number }[]`, a depth-first walk returning every folder including the root, for indented rendering in a `<select>`. No such helper exists; `findNodeById` and `getAllComponentsFromFolder` are the nearest and neither fits.

**Folder picker in the component editor** — `src/components/Modal/ComponentModal.tsx`

- When adding a component, rather than editing one, render a `Folder:` `<select>` built from `listFolders(treeData)`, defaulting to `selectedNode` when it is a folder and to the root Components folder otherwise.
- `saveComponent` passes the chosen folder id to the existing `handleAddComponent(parentId, data)` from `TreeContext`. Do not add a new write path: that function already inserts optimistically and lets the `treeData` effect persist.
- Editing an existing component keeps its current behaviour and shows no picker.

**Section action** — `src/components/PromptEditor/Section/SectionHeader.tsx`

- Add a "Save as prompt component" icon button to `.section-actions`, beside the delete button, disabled when the section content is empty.
- It opens `ComponentModal` prefilled with the section's `name`, `content` and `type`: `componentBeingEdited` stays `null` and the form is seeded instead. Add a `componentDraft` field to `TreeContext` — name, content, component type, and the section it came from — so `ComponentModal`'s reset effect picks it up rather than clearing to defaults. Clear the draft when the modal closes.

**Linkage after saving** — `src/hooks/usePrompts.ts`, or the draft handler

- Once the component is created, update the originating section through `updateSection` with `linkedComponentId`, `originalContent` set to the saved content, and `linked: false`. The section then reads "Copied from &lt;name&gt;" and carries the existing "Link to component" affordance.
- Deliberately a copy, not a link: invariant 9 says insertion creates a copy, and invariant 10 says linking must be explicit.

### Acceptance

- A section with no `linkedComponentId` offers "Save as prompt component"
- The modal opens prefilled with the section's name, content and type
- The folder picker lists every library folder, indented by depth, defaulting sensibly
- Saving creates the component in the chosen folder and it appears in the sidebar tree
- The section afterwards reads "Copied from &lt;name&gt;" and offers "Link to component"; it is not linked automatically
- Editing a component from the sidebar is unchanged and shows no folder picker
- A unit test covers save-from-section creating the component in the chosen folder and setting the section's copy origin
- `listFolders` has a unit test alongside the existing tree utility tests

---

# Architectural invariants

The following should be treated as design rules for future development.

1. A source prompt is persistent.
2. A working prompt is temporary unless the user explicitly saves changes to the source.
3. Variable definitions belong to the source.
4. Variable option lists belong to the source.
5. Current variable values belong to working state by default.
6. Clearing a value must never remove its definition.
7. Preview and clipboard output must use the same compiler.
8. Components are reusable prompt fragments.
9. Component insertion creates a copy by default.
10. Linked components must be explicit.
11. SQLite is the authoritative persistence store.
12. The application remains local first.
13. Prompt Builder remains provider-neutral.
14. AI execution is outside the current product boundary.
15. JSON exports should contain an internal schema version.
16. React UI state must not leak into the persisted prompt model.
17. Persistence failures must never be silent.
18. Database schema changes must use migrations.
19. Data integrity takes precedence over optimistic UI behaviour.
20. New features should improve one or more stages of:

```text
Find → Select → Customise → Resolve → Copy
```
