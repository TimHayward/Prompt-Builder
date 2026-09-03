# Architecture

Deliberately small: a Next.js app with its own SQLite database, no services, no
network calls of its own.

```text
   UI            components/, contexts/
     ↓
 domain/state    domain/, utils/, contexts/, hooks/
     ↓
   API           api/ (browser)  →  app/api/ (routes)
     ↓
 repositories    lib/repositories/
     ↓
   SQLite        data/prompt_builder.db
```

## The layers

**UI** — `src/components`. Presentational, plus the drag-and-drop wiring. Reads
state through contexts; contains no persistence.

**State** — `src/contexts`. `PromptContext` holds prompts and the active prompt
and orchestrates; `WorkspaceContext` holds working values; `TreeContext` holds
the component library; `AppContext` holds settings; `ToastContext` and
`SaveStateContext` carry feedback. Every context fails fast when used outside
its provider rather than handing back plausible no-ops.

**Domain** — `src/domain` and the pure helpers in `src/utils`. Prompt mutations,
the compiler, the variable grammar, the Markdown parser, the section
stored/editor split. No React, no fetch: these are the parts worth testing on
their own, and most of the test suite lives here.

**API client** — `src/api` over `src/lib/apiClient.ts`. The client checks status
codes and throws `ApiError`/`NetworkError`, because a bare `fetch` resolves
happily on a 500 and a rejected save would otherwise look like a successful one.

**Routes** — `src/app/api`. Validate the body against a Zod contract from
`src/types/contracts.ts`, call a repository, answer. A malformed payload is
rejected with 400 before any write, so nothing is left half-applied.

**Repositories** — `src/lib/repositories`. Every SQL statement. Routes deal in
prompts and components; columns and JSON blobs stop here.

## Rules worth keeping

- Contracts are defined once, in `src/types/contracts.ts`, and the TypeScript
  types are inferred from them — a contract cannot drift from its validation.
- Editor state never reaches the database: `sectionState.ts` strips it on save,
  and the contract does not accept it either.
- Working values never write to the source prompt.
- One compiler produces the resolved prompt, for both preview and clipboard.
- Persistence failures are visible: a toast, and the save indicator that follows
  the request rather than the intent.
- Schema changes are migrations, never ad-hoc `ALTER` at startup.

## Where to add things

| Adding | Goes in |
| --- | --- |
| A new way to change a prompt | `src/domain/promptMutations.ts`, exposed through `PromptContext` |
| A new endpoint | a contract in `src/types/contracts.ts`, a route in `src/app/api`, a repository function |
| A new stored field | a migration in `src/lib/migrations.mjs`, then the repository and the contract |
| Anything about resolved text | `src/utils/compilePrompt.ts` — not a second implementation |

## Tests

`tests/unit` covers the domain and the contexts with a mocked `fetch`.
`tests/integration` runs the real route handlers against a real SQLite database
in a temp directory, which is where migrations, constraints and routes are
checked against each other. Both run under `npm test`.

`tests/e2e` drives a real browser through the whole workflow with
`npm run test:e2e`: create, edit, reload, fill in a variable, preview, copy,
compare the clipboard, clear values. It builds into `.next-e2e` against a
throwaway database, so it can run while a dev server is using `.next`.
