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

## Phase 11. User-editable frameworks

Complete:

```text
R2
R3
R4
R5
```

R2 comes first and alone: it moves frameworks from source into the database and relaxes the section-type contract, and the other three have nothing to edit until it lands.

---

# Open items

## R2. Persist frameworks as editable data

**Priority:** P1  
**Model:** Opus 4.8  
**Size:** L

### Problem

Frameworks are hard-coded. `FRAMEWORK_DEFINITIONS` in `src/lib/sectionTypes.ts` is a `const` array, and `SECTION_TYPE_LABELS` beside it is a closed object whose keys are the section types. Nobody can add a framework, rename one, reorder its components or say what a component is for without editing TypeScript and rebuilding.

Two things stand in the way of making them data:

1. `SectionTypeValue` is `keyof typeof SECTION_TYPE_LABELS` — a static union of seventeen literals, and `TYPE_PRESENTATION` in `src/lib/frameworks.ts` is an exhaustive `Record` over it.
2. `sectionTypeSchema` in `src/types/contracts.ts` is `z.enum(ALL_TYPE_VALUES)`, and it gates three persisted fields: `section.type`, `component.componentType` and `settings.defaultSectionType`. Until that is relaxed, the API refuses to save a section using any component the user invented.

### Action

Move frameworks into the database and derive the registry from what is stored.

**Schema** — a migration adding two tables, seeded from `FRAMEWORK_DEFINITIONS` so an existing installation keeps the five frameworks it has, with the ids it already stores:

```text
frameworks            id, label, description, sort_order
framework_components  id, framework_id, label, description, example, sort_order
```

**The load-bearing rule: a component id is immutable, its label is not.** Stored sections reference the id, so renaming, re-describing and reordering all propagate without touching a single prompt. This is the same constraint `sectionTypes.ts` already states as "Legacy values — stored in existing DBs, must not be renamed"; the migration must therefore seed the built-in components under their current keys (`role`, `instruction`, `end-goal`, and the rest), never under fresh ones.

**Contract** — relax `sectionTypeSchema` from `z.enum` to `z.string().min(1)`, and make `SectionTypeValue` a `string` alias.

Record in the code why this is acceptable, because it is a deliberate loss: the enum guaranteed a stored type was one of seventeen known values, and after this it does not. What makes it safe is that no code branches on a type value — there is no `switch` and no exhaustive `Record` outside `TYPE_PRESENTATION` — and `getTypeMeta` already falls back to the default type for anything it does not recognise. An unknown type degrades to a default label and colour rather than breaking a prompt.

**Registry** — `getTypeLabel`, `getTypeColor` and `getFrameworkForType` read the loaded frameworks instead of the static maps, keeping their present signatures so the seventeen call sites do not change. `getFrameworkForType` must keep resolving a legacy type to the framework it resolves to today.

**Backups** — frameworks travel in a library export (`src/domain/backup.ts`, `src/lib/repositories/backupRepository.ts`). Without this an imported library arrives holding sections whose types nothing can name, which is the orphaning this item exists to prevent.

### Acceptance

- The five built-in frameworks survive the migration with their existing ids, labels and component order
- A prompt stored before the migration opens with every section labelled and coloured as it was
- A section whose type belongs to a user-created component saves and reloads intact
- A section whose type matches no component still renders, with the default label and colour
- A library export contains the frameworks, and importing it into an empty install reproduces them
- A migration test asserts the seeded rows, and the existing suite passes unchanged

---

## R3. Framework editor above the Library pane

**Priority:** P3  
**Model:** Opus 4.8  
**Size:** L

*Depends on R2.*

### Problem

Once frameworks are data there is still nothing to edit them with.

### Action

A collapsible **Frameworks** section above `.tree-container` in `src/components/Sidebar/index.tsx`, with its own `<h2>` header matching the `Saved Prompts` idiom Q1 introduced, so the sidebar reads as one design.

It must offer:

- Select an existing framework to edit
- Create a new framework
- Edit the framework name and description
- Add, remove and reorder its components. Reuse the up/down pattern of `moveNodeUp` and `moveNodeDown` in `src/utils/treeUtils.ts` rather than introducing drag-and-drop
- Edit each component name, description and example

The pane sits inside the resizable sidebar, so it must stay usable at the 200px floor `MIN_PANE_WIDTH` sets, and must not squeeze the component tree out of view — the same constraint `Saved Prompts` works under.

### Acceptance

- A new framework appears in the Framework dropdowns in `ComponentModal` and `SectionHeader`
- Reordering a framework, components reorders the Type dropdown to match
- **Renaming `R-C-T-C-S-O` to `RCTCSO` changes the name shown against existing prompt components, and no stored prompt changes.** This is what nothing storing a framework reference buys: a component records only its `componentType`, and the framework is derived from it. A future change must not denormalise a framework name onto a component
- Editing a component name relabels every section already using it, again with no stored prompt changing
- A component description and example are readable where someone is choosing a type
- The section is usable at the sidebar minimum width

---

## R4. Refuse to delete a framework component in use

**Priority:** P1  
**Model:** Sonnet 5  
**Size:** M

*Depends on R2.*

### Problem

Editing a framework can orphan data. Deleting a component whose id is stored on sections leaves those sections pointing at something that no longer exists; they would render with the default label and colour, silently losing what the section was for.

### Action

Refuse the deletion and say what is still using it.

Reuse `findComponentUsage` and `describeComponentUsage` in `src/domain/componentLinks.ts`. They exist to name what a change would reach and already phrase it for a user — the same machinery behind the warning shown when editing a library component that prompts follow.

Deleting a whole framework is refused while any of its components are in use.

### Acceptance

- Deleting a component used by a prompt section is refused, and the message names what uses it
- Deleting a component used by a library component is refused the same way
- Deleting an unused component succeeds
- Deleting a framework with any component in use is refused
- No path through the editor can leave a stored section referencing a component that does not exist

---

## R5. Appearance for user-created framework components

**Priority:** P2  
**Model:** Sonnet 5  
**Size:** S

*Depends on R2.*

### Problem

`TYPE_PRESENTATION` in `src/lib/frameworks.ts` assigns a colour and an icon to each of the seventeen built-in types by hand. A user-created component has no entry, so it falls back to the default type colour and is indistinguishable from an Instruction in the section stripe.

### Action

Assign a colour from the palette already in `TYPE_PRESENTATION`, chosen deterministically from the component id — a stable hash into the existing list, so the colour survives a reload and does not depend on insertion order. One generic icon for all custom components.

Deliberately not a colour picker: it is more UI to build and test, and it lets a user choose a colour that collides with a built-in type.

### Acceptance

- A user-created component gets a colour from the existing palette, not the default type colour
- Two custom components in the same framework differ in colour
- A component keeps its colour across a reload and across a restart
- The seventeen built-in types keep exactly the colours they have today

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
