# Variable grammar

One parser reads every variable, in `src/utils/variableUtils.ts`. Extraction,
the editor's highlighting, substitution and the Markdown import all use it, so
a token means the same thing everywhere.

## The grammar

Every part is optional:

```text
{{ [!] [label:] name-or-options [=default] [|help] }}
```

| Written                               | Key                   | Pane                                  |
| ------------------------------------- | --------------------- | ------------------------------------- |
| `{{tone}}`                            | `tone`                | Free-text box                         |
| `{{mail/teams/calendar}}`             | `mail/teams/calendar` | Dropdown of the three, plus `Custom…` |
| `{{channel: mail/teams/calendar}}`    | `channel`             | The same dropdown, labelled `channel` |
| `{{!customer}}`                       | `customer`            | Marked required with `*`              |
| `{{tone: formal/technical=formal}}`   | `tone`                | Dropdown showing `Default: formal`    |
| `{{customer\|Who is being assessed}}` | `customer`            | Help text under the label             |

All at once:

```text
{{!channel: mail/teams=mail|How the update is sent}}
```

The optional parts are stripped in a fixed order — the required marker, then
help text, then the default — before the label and options are read. Help text
comes off before the default, so prose containing `=` stays prose.

## Required, defaults and help

**A required variable is a warning, not a barrier.** Copy always goes through;
the toast names what the prompt expected — _"Copied. customer has not been
populated."_ — and the preview says the same above the text. A prompt with
deliberate gaps still copies.

**A default is not a value.** It is what the variable resolves to while the
working value is empty, shown in the pane as a placeholder rather than filled
in. That is what keeps it distinguishable from something the user chose, and
what lets **Clear values** return to it rather than past it. A default fills a
required variable, so a required variable with a default never warns.

**Help text belongs to the source prompt**, like the label and the option list,
so it travels with the prompt through export and import.

## Rules

**Whitespace is ignored.** `{{ mail / teams }}` and `{{mail/teams}}` are the
same variable, with the same key.

**A choice list needs two or more non-empty options.** That rule is what keeps
`{{https://example.com}}` and `{{a//b}}` as ordinary free-text variables rather
than mangled dropdowns.

**A repeated choice is dropped.** `{{Variables: one/two/one}}` offers `one` and
`two`; offering the same choice twice means nothing, and it used to break the
dropdown.

**A label only takes effect alongside options.** `{{Note: see below}}` has no
`/`, so it stays one free-text variable named `Note: see below`.

**The key is what carries the value.** For a labelled list that is the label, so
a bare `{{channel}}` elsewhere in the prompt shares the value. For an unlabelled
list it is the options joined by `/`, which is why spacing has to be ignored.

**Repeats share a value.** The same variable written twice is filled in once and
substituted in both places.

**A custom value is allowed.** Picking `Custom…` and typing something stores
that value; the option list in the source is untouched.

**Reserved tokens are left alone.** A token opening with `>` or `#` — such as
`{{> Component Name}}` — is not a variable, and passes through substitution
unchanged. These are held for future syntax. `!` was reserved alongside them
until it was given its meaning as the required marker.

**A variable is the same variable however it is written.** `{{!customer}}` and
`{{customer}}` share one entry and one value. Marking any occurrence required
makes the variable required; the first help text and the first default win, the
way the first label already does.

## Empty values

A variable with no value and one explicitly emptied resolve the same way: to
nothing. Copying then reports which were blank — _"Copied. One variable was left
empty: customer."_ — without blocking, since a prompt with gaps is often exactly
what you want to paste elsewhere.

An unknown variable is not left as `{{braces}}` in the output. Whatever the
prompt declares is either filled in or removed.

## Where the value lives

Values belong to the working prompt, not the source — see
[prompt-model.md](prompt-model.md). Clearing them leaves every definition and
option list exactly as written.
