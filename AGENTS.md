# Repository Guidelines

## Project Structure & Module Organization

- `src/` holds the runtime code for the CLI and server. Key modules include `src/cli.js` (entrypoint), `src/server.js` (polling/automation loop), and service clients like `src/notion.js` and `src/github.js`.
- There is no dedicated `tests/` or `assets/` directory in this repo today.
- Configuration is loaded from environment variables via `dotenv` (see `.env` usage below).

## Build, Test, and Development Commands

- `npm install`: install runtime dependencies.
- `npm start`: run the CLI (`node src/cli.js`).
- `node src/cli.js --project-dir /path/to/project`: run against a specific project; defaults to `cwd` when `PROJECT_DIR` is not set.
- `npm test`: currently exits with “no test specified”; add a test runner before relying on it.
- `node src/cli.js --dry-run true`: safe mode that skips agent execution and git/PR side effects.

## Coding Style & Naming Conventions

- JavaScript uses ES modules (`"type": "module"` in `package.json`), Node.js 18+.
- Indentation is 2 spaces; use semicolons and single quotes as shown in `src/*.js`.
- File names are lower-case with hyphens or plain words (e.g., `server.js`, `git.js`).
- Environment variables are upper snake case (e.g., `NOTION_TOKEN`, `GITHUB_TOKEN`).

## Testing Guidelines

- No testing framework is configured yet; add one if you introduce non-trivial logic.
- If you add tests, place them in a new `tests/` directory and name files with `.test.js`.
- Use `--dry-run true` for manual verification of control flow without external side effects.

## Commit & Pull Request Guidelines

- Commit messages follow a Conventional Commits–style prefix (e.g., `fix: ...`).
- Keep commits small and scoped; include concise, imperative summaries.
- PRs should include: a short problem statement, summary of changes, and how you verified (commands or manual steps).
- If changes affect Notion/GitHub behavior, call out required env vars and any schema assumptions.

## Security & Configuration Tips

- Store tokens in `.env` and never commit secrets.
- Review `NOTION_*` and `GITHUB_*` variables in `README.md` when debugging config issues.
