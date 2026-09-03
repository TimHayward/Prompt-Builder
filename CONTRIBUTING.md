# Contributing to Prompt Builder 👋

We welcome contributions from the community! Whether you're fixing bugs,
proposing new features, or improving documentation, your help makes this project
better for everyone.

---

## **Development Setup** 💻

### Prerequisites
- Node.js 24 or higher — `npm ci` needs npm 11 to install this lockfile
- A browser; there is no extension to load, it runs as a local web app

### Installation

```bash
git clone https://github.com/TimHayward/Prompt-Builder.git
cd Prompt-Builder
npm install
npm run db:init     # creates data/prompt_builder.db and runs the migrations
npm run dev         # http://localhost:3000
```

### Before opening a pull request

```bash
npm test           # unit and integration tests
npm run test:e2e   # Playwright smoke tests (first run: npx playwright install chromium)
npm run typecheck
npm run lint
npm run build
```

CI runs all of these on every pull request. The integration and smoke tests
build their own SQLite database in a temp directory, so they never touch your
library.

## Coding Standards 📜
- TypeScript with strict typing; avoid `any`, and map database rows through
  `src/lib/promptRows.ts` rather than asserting
- SCSS for styling, no inline CSS
- Functional React components with hooks
- Comments explain why something is the way it is; git history records what
  changed

Read [docs/architecture.md](docs/architecture.md) first — it says which layer a
change belongs in, and lists the rules worth keeping (one compiler, contracts
defined once, editor state out of the database, schema changes as migrations).

## Submitting Changes 🔄
Create a new branch:
  - `git checkout -b feat/your-feature-name` _or_ `git checkout -b fix/your-bug-fix`

Commit your changes with a descriptive message:
  - `git commit -m "feat: add undo/redo functionality"`

Push to your fork:
  - `git push origin your-branch-name`

Open a Pull Request against the main branch:
  - Include a clear description of your changes
  - Reference related GitHub issues (e.g., "Closes #12")
  - Keep commits squashed where appropriate

Planned work lives in [BACKLOG.md](BACKLOG.md); each item is written to be
picked up on its own, with the acceptance criteria it has to meet.

## Feature Requests & Bugs 🐛
Found a bug or have an idea? Open a GitHub Issue with:
- A descriptive title
- Detailed description (include steps to reproduce for bugs)
- Expected vs actual behavior
- Screenshots/GIFs (if relevant)
- Browser/OS version
