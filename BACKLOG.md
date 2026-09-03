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

# I. P3 Prompt Library Features

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
