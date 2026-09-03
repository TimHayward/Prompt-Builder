# Prompt Builder 🧩

A local-first library and editor for reusable prompts. Assemble a prompt from
sections and saved components, fill in its variables for the job at hand, and
copy the result.

Prompt Builder does not send prompts to any model. Its responsibility ends when
the resolved prompt is on your clipboard, which keeps it provider-neutral.

_A demo recording is attached to the [latest release](https://github.com/TimHayward/Prompt-Builder/releases)._

## How it works

```text
Find → Select → Customise → Resolve → Copy
```

Three things are kept apart, which is the idea the rest of the app is built on:

| | |
| --- | --- |
| **Source prompt** | The reusable text and its variable definitions. Stored. |
| **Working prompt** | The values you enter for this use. Stored separately; clearing them never touches the source. |
| **Resolved prompt** | What lands on the clipboard. The Preview tab shows exactly this. |

[docs/prompt-model.md](docs/prompt-model.md) explains the model in full.

## Getting started

Requires **Node.js 24** or newer — `npm ci` needs npm 11 to install this
lockfile.

```bash
git clone https://github.com/TimHayward/Prompt-Builder.git
cd Prompt-Builder
npm install
npm run db:init     # creates data/prompt_builder.db and runs the migrations
npm run dev         # http://localhost:3000
```

Your prompts, components and working values live in `data/prompt_builder.db`,
which is git-ignored — see [docs/database.md](docs/database.md) for where it
lives, how migrations work, and how to back it up safely.

### With Docker

```bash
docker compose up --build
```

Builds a production image and serves it on port 3000, with the database on a
named volume. A failed database initialisation stops the container rather than
serving a half-working application.

## Variables 🔤

Anything wrapped in double braces becomes an editable field in the Variables
pane, and is substituted when you copy the prompt.

| Syntax | Pane shows |
| --- | --- |
| `{{tone}}` | A free-text box |
| `{{mail/teams/calendar}}` | A dropdown of the three options, plus `Custom…` for free text |
| `{{channel: mail/teams/calendar}}` | The same dropdown, labelled `channel` |

A `/` only creates a choice list when there are at least two options and none of
them are empty, so `{{https://example.com}}` stays a plain free-text variable.
Spacing is ignored — `{{ mail / teams }}` and `{{mail/teams}}` are the same
variable. A variable left empty resolves to nothing, and the copy tells you
which ones were blank. Full grammar: [docs/variables.md](docs/variables.md).

## Components

The sidebar holds reusable fragments. Inserting one **copies** its text into
your prompt, so editing the component later leaves existing prompts alone. A
section can be linked explicitly if you want it to follow the component; the
editor says which it is.

## Development

```bash
npm test           # unit and integration tests
npm run typecheck  # tsc --noEmit
npm run lint
npm run build
```

The same four run in CI on every push and pull request. Integration tests
exercise the real API routes against a throwaway SQLite database, so they never
touch your library.

Architecture, and where to add things:
[docs/architecture.md](docs/architecture.md).

## Contributing 🤝

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Backlog 💡

Planned remediations, enhancements and new features live in
[BACKLOG.md](BACKLOG.md). Finished items are archived in
[BACKLOG-completed.md](BACKLOG-completed.md), each with the commit that closed
it.

## Built with 🔧

Next.js (App Router), React, TypeScript, SCSS, SQLite via better-sqlite3, Zod
for API contracts, Vitest for tests.

## License 📄

Apache License 2.0. See [LICENSE](LICENSE).
