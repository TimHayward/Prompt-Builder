# The database

SQLite, via better-sqlite3, is the authoritative store. There is no server and
no account: everything lives on the machine running the app.

## Where it is

```text
data/prompt_builder.db
```

Relative to where the app is started, and git-ignored. `PROMPT_BUILDER_DATA_DIR`
overrides the directory — the integration tests use it to work in a temp folder,
and a deployment can use it to put the data somewhere else. The Docker image
mounts a named volume at `/app/data`.

WAL mode is on, so alongside the database you will see `-wal` and `-shm` files.
They are part of the database, not scratch files.

## Tables

| Table               | Holds                                                                               |
| ------------------- | ----------------------------------------------------------------------------------- |
| `prompts`           | Source prompts; sections and variable defaults as JSON, plus library metadata       |
| `component_library` | The sidebar tree; `parent_id` is self-referential, `sort_order` gives sibling order |
| `prompt_workspaces` | Working values per prompt, and room for section overrides                           |
| `app_config`        | One row: settings JSON and the active prompt                                        |

Foreign keys are enabled on every connection, so deleting a folder takes its
children with it and deleting a prompt takes its working values.

## Migrations

Schema changes are numbered migrations recorded in SQLite's own
`PRAGMA user_version`, defined in `src/lib/migrations.mjs` and shared by the app
and `npm run db:init`. Each runs at most once, inside a transaction that also
writes the version stamp, so an interrupted migration leaves neither behind.

The application migrates on its first query, so an existing installation
upgrades by being started. To inspect the version:

```bash
sqlite3 data/prompt_builder.db "PRAGMA user_version;"
```

### Library metadata

A prompt carries more than its text. `description` says what it is for,
`is_favourite` marks the ones reached for often, `tags` is a JSON array of
labels, and `last_used_at` is stamped when the prompt is copied. All four
default to empty, so an existing library gains them without changing.

Searching them is done in the client, not in SQL — see
[prompt-model.md](prompt-model.md#finding-a-prompt).

Adding one: append an entry to `MIGRATIONS` with the next number. Never edit or
renumber a released migration — installations that ran it will not run it again.

## Backing up

Do not copy `prompt_builder.db` on its own while the app is running: with WAL,
recent transactions may live in the `-wal` file, and a copy without it can be
missing them or be inconsistent.

Either stop the app and copy all three files (`.db`, `-wal`, `-shm`), or take a
consistent snapshot while it runs:

```bash
sqlite3 data/prompt_builder.db ".backup 'backup.db'"
```

Both leave you with a single file you can restore by putting it back as
`data/prompt_builder.db`. The backup carries its schema version with it, so an
older backup migrates forward when the app next opens it.
