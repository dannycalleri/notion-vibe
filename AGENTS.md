# Repository Guidelines

## Project Structure & Module Organization

- `src/` holds the TypeScript runtime code. Key modules include `src/cli.ts` (entrypoint), `src/server.ts` (polling/automation loop), `src/config.ts` (env/CLI config), and service clients like `src/notion.ts`, `src/github.ts`, and `src/git.ts`.
- `tests/` contains Vitest test files (for example `tests/server.test.ts`, `tests/config.test.ts`).
- `dist/` contains compiled JavaScript output from `tsc` and is the executable target for the CLI.
- Configuration is loaded from environment variables via `dotenv/config`, with CLI flags overriding env values.

## Build, Test, and Development Commands

- `npm install`: install runtime dependencies.
- `npm run build`: compile TypeScript from `src/` to `dist/`.
- `npm start -- --project-dir /path/to/project`: run the compiled CLI (`node dist/cli.js -- ...`). `prestart` runs a build first.
- `node dist/cli.js --project-dir /path/to/project`: run directly against a specific project; defaults to `cwd` when `PROJECT_DIR` is not set.
- `npm test`: run the test suite once via Vitest (`vitest run`).
- `npm run test:watch`: run tests in watch mode.
- `npm run typecheck`: run TypeScript type-checking without emitting build artifacts.
- `npm start -- --dry-run true` (or `node dist/cli.js --dry-run true`): safe mode that skips agent execution and git/PR side effects.

## Coding Style & Naming Conventions

- TypeScript with NodeNext modules (`"type": "module"` in `package.json`), Node.js 18+.
- Indentation is 2 spaces; use semicolons and single quotes as shown in `src/*.ts` and `tests/*.ts`.
- File names are lower-case with hyphens or plain words (e.g., `server.ts`, `git.ts`).
- Keep ESM import paths consistent with the codebase convention (using `.js` extensions in source imports for NodeNext compatibility).
- Environment variables are upper snake case (e.g., `NOTION_TOKEN`, `GITHUB_TOKEN`).

## Testing Guidelines

- Vitest is configured (`vitest.config.ts`); keep tests in `tests/` and name files `*.test.ts`.
- Prioritize unit tests for `src/config.ts`, API clients, and server orchestration paths when behavior changes.
- Run `npm test` before finalizing changes; use `npm run test:watch` during development.
- Use `--dry-run true` for manual verification of control flow without external side effects.

## Commit & Pull Request Guidelines

- Commit messages follow a Conventional Commits–style prefix (e.g., `fix: ...`).
- Keep commits small and scoped; include concise, imperative summaries.
- PRs should include: a short problem statement, summary of changes, and how you verified (commands or manual steps).
- If changes affect Notion/GitHub behavior, call out required env vars and any schema assumptions.

## Security & Configuration Tips

- Store tokens in `.env` and never commit secrets.
- Review `NOTION_*`, `GITHUB_*`, and agent-related variables (`AGENT_*`, `CODEX_*`) in `README.md` when debugging config issues.
