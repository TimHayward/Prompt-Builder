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
`WorkspaceContext`. Filling in a variable is _using_ a prompt, not editing it,
so nothing here writes to the source. That is what lets **Clear values** empty
the pane while the choice list stays exactly as written.

The same row holds temporary section overrides: text changed for this use
only, keyed by section id. They are applied on the way to the compiler and
never written back into the stored sections.

### Using, or editing the source

The editor is in one of two modes, and it opens in **Using**:

| Mode           | Typing in a section writes to              |
| -------------- | ------------------------------------------ |
| Using          | the workspace, as an override for this use |
| Editing source | the stored prompt, as it always did        |

Customising is the common act and editing the library is the rarer, riskier
one, so the safe mode is the default and editing the source is something you
choose. The mode is not persisted: every session starts in Using.

A section changed for this use says so, offers what the prompt says, and can be
reverted on its own. Typing the source text back in clears the override rather
than storing an identical copy, so a section is never marked as changed while
saying exactly what the prompt says.

The variables offered in the pane come from the text this use will resolve —
the stored sections with overrides applied — so a variable introduced by a
temporary change can still be filled in.

**Reset working prompt** clears the values and the overrides together, leaving
the prompt, its variable definitions and its option lists untouched. It asks
first when there are overrides, because text changed for this use is not
visible from the variables pane.

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

## Finding a prompt

Once there are more prompts than fit in a row of tabs, the tabs stop being a
way to find anything. The browser searches everything a prompt holds — name,
description, tags, section names, section text and variable names — and can
narrow to favourites, to recent use, or to one tag.

It is a pure function over the prompts already in memory,
`src/domain/promptSearch.ts`. The whole library is loaded on start, so this
needs no round trip and no index. SQLite's FTS5 was considered and left alone:
it would mean a shadow table and triggers kept in step with every write, to
search a list that fits in a variable. That trade changes only if the library
stops being loaded whole.

Using a prompt means copying it. The stamp is written when the text reaches the
clipboard, not when the button is pressed, so a refused copy is not a use.

## History

A deliberate change to a source — a prompt’s sections or name, a component’s
text — leaves the previous version recoverable. Metadata does not: marking a
favourite or adding a tag is not a change to the prompt.

Two rules keep the list worth reading, since saving is automatic:

- **One entry per editing session.** A revision records what something looked
  like _before_ a sitting. Saves within five minutes of the last revision add
  nothing, so a burst of typing leaves one recoverable point rather than fifty.
- **A cap of twenty.** History is a safety net for recent mistakes, not an
  archive. The export in Settings is the archive.

Restoring is itself a change to the source, so it records what it replaced:
a restore can be undone from the same list.

**Working values are never part of history.** A revision holds the source and
nothing about how one use of it was filled in, which is the same separation the
rest of this document describes. Each history table cascades from what it is the
history of, so a deleted prompt takes its revisions with it.

## Why the separation matters

- Entering a value cannot corrupt a reusable prompt.
- Clearing values cannot lose a choice list.
- The preview cannot drift from the clipboard.
- Editor state cannot end up in the database.

These are the invariants the tests are there to hold.
