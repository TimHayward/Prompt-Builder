# The prompt model

Prompt Builder keeps three things apart. Most of the application's design
follows from this separation, and most of the bugs it used to have came from
mixing them.

## Source prompt

The reusable artefact: a name, ordered sections, and the variable definitions
written inside the section text.

```text
Review the {{technology}} environment for {{customer}}.

Produce the response in a {{tone: formal/technical/executive}} style.
```

The definitions — the variable's name, its label, and its list of choices —
belong to the source. Stored in the `prompts` table, one row per prompt with its
sections as JSON.

Sections carry no editor state. Whether a section is expanded, or has unsaved
changes against its component, exists only while the app is open; see
`src/utils/sectionState.ts`, which is the only place the two shapes meet.

## Working prompt

The values entered for the current use:

```text
technology = Microsoft Intune
customer    = Contoso
tone        = technical
```

Stored in `prompt_workspaces`, keyed by prompt id, and owned on the client by
`WorkspaceContext`. Filling in a variable is *using* a prompt, not editing it,
so nothing here writes to the source. That is what lets **Clear values** empty
the pane while the choice list stays exactly as written.

The table also has room for temporary section overrides — text changed for this
use only — which the backlog's K1 will use.

## Resolved prompt

What the clipboard gets:

```text
Review the Microsoft Intune environment for Contoso.

Produce the response in a technical style.
```

Produced by `compilePrompt` in `src/utils/compilePrompt.ts`, which is the only
implementation of this. The Preview tab and the Copy button call the same
function with the same inputs, so what you see is what you copy — there is a
test that renders the preview, clicks copy, and compares the two.

Compilation:

1. sections in order, blank ones dropped;
2. variables substituted, with anything unfilled resolving to nothing and
   reported back to the caller;
3. with markdown prompting on, a `# Type: Name` heading per section and the
   system prompt in front. A section whose text already begins with its own
   heading keeps that one rather than gaining a second.

## Why the separation matters

- Entering a value cannot corrupt a reusable prompt.
- Clearing values cannot lose a choice list.
- The preview cannot drift from the clipboard.
- Editor state cannot end up in the database.

These are the invariants the tests are there to hold.
