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

# C. P1 Prompt Domain Model

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

---

# D. P1 Compilation and Clipboard Workflow

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

---

# E. P2 State and Architecture Refactoring

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

---

# F. P2 Automated Testing

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

---

## F4. Add persistence regression tests

**Priority:** P2  
**Size:** M

Cover:

- reorder then reload
- insert then reload
- delete then reload
- Prompt A and Prompt B edited inside debounce period

### Remaining

`tests/unit/promptPersistence.test.tsx` covers all four cases at the point of persistence — it asserts the payload each mutation sends, including two prompts edited inside one debounce window. What is left is the reload half: re-reading through the API and confirming the restored prompt matches, which needs the integration harness from [F5](#f5-add-sqlite-api-integration-tests).

---

## F5. Add SQLite API integration tests

**Priority:** P2  
**Size:** M

Use a temporary or isolated SQLite database.

Cover prompt and component CRUD.

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

---

# G. P2 CI and Repository Quality

## G1. Add typecheck script

Add:

```json
"typecheck": "tsc --noEmit"
```

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

---

## G4. Standardise formatting

Add Prettier and repository-wide formatting rules.

Standardise:

- quotes
- indentation
- trailing commas
- line wrapping
- import ordering where appropriate

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

---

## G6. Remove workstation-specific paths

Remove comments containing local machine paths such as:

```text
C:\Users\...
```

---

## G7. Remove dead files and dead code

Audit:

- unused hooks
- unused functions
- unused imports
- no-op UI buttons
- abandoned configuration fields

Remove only after confirming no references remain.

---

## G8. Remove large repository demo asset

Replace the approximately 30 MB animated GIF with a more appropriate mechanism such as:

- compressed WebM
- GitHub release asset
- externally hosted demo

---

# H. P2 Documentation

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

---

## H2. Correct database documentation

Document the actual database location:

```text
data/prompt_builder.db
```

and its backup implications.

---

## H3. Document the source/working/resolved model

Explain:

### Source Prompt

Persistent reusable template.

### Working Prompt

Current values and temporary preparation state.

### Resolved Prompt

Exact clipboard output.

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

---

# I. P3 Prompt Library Features

## I1. Complete prompt duplication

**Priority:** P3  
**Size:** S

Make duplicate prompt a fully supported and tested workflow.

### Acceptance

Duplicating a prompt creates an independent source prompt with independent section IDs and preserved variable definitions.

---

## I2. Add prompt descriptions

Allow prompts to have a short description explaining intended use.

---

## I3. Add tags

Example:

```text
Microsoft 365
Security
Development
Research
Writing
```

Allow multiple tags per prompt.

---

## I4. Add favourites

Allow prompts to be marked:

```text
★ Favourite
```

Provide a favourite filter.

---

## I5. Add recently used prompts

Track a local `last_used_at` timestamp.

Display recently used prompts.

---

## I6. Add prompt search

Search across:

- prompt name
- description
- tags
- section names
- section content
- variable names

SQLite FTS5 should be considered.

---

# J. P3 Variable Improvements

## J1. Preserve choice variables as source definitions

This is mandatory throughout future variable development.

Choice options must never be replaced by the last selected working value.

---

## J2. Add required variables

Support a way to designate a variable as required.

Example candidate syntax:

```text
{{!customer}}
```

or explicit metadata.

Do not commit to syntax until reviewed.

### Behaviour

Before copy:

```text
Customer has not been populated.
```

The application may warn without blocking.

---

## J3. Add variable descriptions

Allow variables to provide help text such as:

```text
customer
Customer organisation being assessed
```

This may ultimately require metadata beyond inline prompt syntax.

---

## J4. Add variable defaults

Allow a source definition to provide an optional default working value.

This must remain distinguishable from the currently selected value.

---

## J5. Improve Custom option behaviour

Choice variables must support:

```text
Custom…
```

A custom current value does not modify the persistent option list.

---

# K. P3 Working Prompt Enhancements

## K1. Temporary section overrides

Support making changes for the current prompt use without immediately modifying the source library prompt.

Example source:

```text
Produce a comprehensive assessment.
```

Temporary working change:

```text
Produce a concise assessment.
```

Copy uses the temporary version.

Reset returns to the stored source.

---

## K2. Explicit Edit Source mode

Provide a clear distinction between:

```text
Edit Source
```

and:

```text
Modify Current Copy
```

This prevents accidental corruption of reusable library prompts.

This requires careful UX design before implementation.

---

## K3. Reset Working Prompt

Provide:

```text
Reset working prompt
```

This clears:

- variable values
- temporary text overrides

while preserving:

- source prompt
- variable definitions
- variable option lists
- component definitions

---

# L. P3 Component Improvements

## L1. Default component insertion to Copy

Dragging or inserting a component into a prompt creates an independent section by default.

This protects existing prompts from future component modifications.

---

## L2. Explicit linked component option

Allow an advanced user to choose:

```text
Keep linked
```

when they genuinely want future component updates to flow into the prompt.

---

## L3. Show component origin

A copied component may optionally retain provenance metadata:

```text
Originally inserted from:
Security Reviewer
```

This is informational only.

It must not create automatic synchronisation.

---

## L4. Show linked status visually

Linked sections must be clearly identifiable.

Example:

```text
🔗 Linked: Security Reviewer
```

---

## L5. Warn before modifying a linked component

If a component change will affect multiple prompts, Prompt Builder should report the number of linked prompts before saving.

This applies only if linked components remain supported.

---

# M. P3 Backup, Import and Export

## M1. Export entire library

Provide:

```text
Export library
```

Create a JSON backup containing:

- prompts
- sections
- component hierarchy
- variable definitions
- relevant settings
- schema version

---

## M2. Import library backup

Support restoring the application-level JSON backup.

### Acceptance

Export a library from one clean installation and import it into another.

The resulting prompt library is functionally equivalent.

---

## M3. Add backup schema version

Every exported JSON backup must contain:

```json
{
  "schemaVersion": 1
}
```

This is not intended to create an external standard.

It exists solely to allow Prompt Builder to migrate its own historical exports.

---

## M4. Document database backup

Because Prompt Builder is local first, document safe SQLite backup behaviour.

Do not instruct users to casually copy an active WAL database without considering transaction state.

---

# N. P3 Prompt Quality Features

## N1. Prompt linting

Provide rule-based feedback such as:

```text
Unpopulated variable
Missing linked component
Duplicate section
No output format specified
Conflicting instructions
```

Start with deterministic rules rather than AI analysis.

---

## N2. Token estimation

Show approximate prompt size.

Possible output:

```text
Estimated tokens: 1,842
```

This should remain provider-neutral where possible.

Provider-specific tokenisers may be optional later.

---

## N3. Prompt statistics

Potentially show:

```text
Characters
Words
Sections
Variables
Estimated tokens
```

---

# O. P3 History and Recovery

## O1. Prompt revision history

Lower priority than working-state separation.

Allow deliberate source changes to create recoverable revisions.

Possible actions:

```text
View
Compare
Restore
```

---

## O2. Restore previous source prompt

Allow a previous source revision to become current.

Working values must not form part of revision history.

---

## O3. Component revision history

Only consider this if components become sufficiently important that accidental changes create significant user impact.

Do not implement before the component copy/link model is stable.

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
