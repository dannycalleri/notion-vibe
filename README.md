# turbo-vibe

Run a local server that watches a Notion Kanban database, executes Codex (or another agent) in an isolated git worktree, opens a GitHub PR, and updates the Notion card to "In review" with the PR URL.

## Requirements

- Node.js 18+ (for native fetch)
- Git repository with an `origin` remote
- GitHub CLI (`gh`) authenticated for PR creation (the server will attempt to install `gh` if missing)
- Notion database with:
  - `Status` property (type: status) with options: `Not started`, `In progress`, `In review`, `Done`
  - `PR` property (type: URL)

## Install / Run

From this repository root:

```bash
npm install
npm start -- --project-dir /path/to/your/project
```

`npm start` runs `prestart` first, which builds TypeScript into `dist/`.

Or build once and run from the target project root (if you want `PROJECT_DIR` to default to `cwd`):

```bash
npm --prefix /path/to/turbo-vibe run build
node /path/to/turbo-vibe/dist/cli.js
```

To run against a different project directory, use `--project-dir`:

```bash
node /path/to/turbo-vibe/dist/cli.js --project-dir /path/to/your/project
```

## Configuration

Set these environment variables (recommended in `.env` from your current working directory):

```bash
NOTION_TOKEN="..."
NOTION_DB_ID="..."
NOTION_DATA_SOURCE_ID="..." # required if the database has multiple data sources
NOTION_DATA_SOURCE_NAME="..." # optional alternative selector
```

Optional:

```bash
NOTION_VERSION="2025-09-03"
NOTION_STATUS_PROPERTY="Status"
NOTION_STATUS_TODO="Not started"
NOTION_STATUS_IN_PROGRESS="In progress"
NOTION_STATUS_IN_REVIEW="In review"
NOTION_STATUS_DONE="Done"
NOTION_PR_PROPERTY="PR"
POLL_INTERVAL_MS="30000"
WORKTREE_ROOT=".turbo-vibe/worktrees"
BASE_BRANCH="main"
AGENT_COMMAND="codex"
AGENT_ARGS='["exec","--sandbox","workspace-write","{prompt}"]'
CODEX_APPROVAL_POLICY="never" # optional; also accepts on-request, untrusted, on-failure
CODEX_INSTALL_COMMAND="npm i -g @openai/codex" # allowlisted values only
GH_INSTALL_COMMAND="brew install gh" # optional override if gh is missing, allowlisted values only
GITHUB_REPO_URL="git@github.com:owner/repo.git"
DRY_RUN="false"
MAX_CONCURRENT="1"
PROJECT_DIR="/path/to/your/project"
```

You can also pass CLI flags, which override env vars:

```bash
node dist/cli.js --notion-db-id YOUR_DB_ID --project-dir /path/to/your/project
```

## Usage Flow

1. Start the server: `npm start`
2. Create a task in your Notion database and set Status to `In progress`.
3. The server:
   - Creates a worktree on a new branch
   - Runs Codex (or your configured agent)
   - Commits and pushes changes
   - Opens a GitHub PR
   - Updates the Notion card to `In review` and fills the PR URL
   - If a card is moved back to `In progress`, unchanged content with no PR comments triggers a PR-only retry (no agent rerun); PR comments trigger a rerun with feedback appended to context

## Testing Safely

Use dry-run mode to skip agent execution and git/PR actions:

```bash
npm start -- --dry-run true
```

Run automated checks:

```bash
npm run lint
npm test
npm run typecheck
```

## CI/CD (GitHub Actions + npm Trusted Publishing)

- Workflow file: `.github/workflows/ci.yml`
- PRs: runs tests on every pull request.
- Mainline merges: runs tests on pushes to `main`/`master`.
- Publish: after tests pass on `main`/`master`, publishes to npm with provenance.

Trusted publishing setup (one-time in npm):

1. In npmjs.com package settings, add a Trusted Publisher for this GitHub repo.
2. Set workflow filename exactly to `ci.yml` (case-sensitive).
3. Keep publishing on GitHub-hosted runners (required by npm trusted publishing).

Notes:

- No `NPM_TOKEN` secret is needed for `npm publish` when trusted publishing is configured.
- If dependencies are private npm packages, `npm ci` may still need a separate read-only npm token.

## Notes

- Notion API `2025-09-03` splits databases into data sources. The database response includes a `data_sources` array; you must query a specific data source for rows and schema.
- Codex discovery: it searches PATH, local `node_modules/.bin`, and common home directory locations.
- If Codex is not found, the CLI prompts to install it using `CODEX_INSTALL_COMMAND` (restricted to an allowlist).
- PR creation uses `gh` and requires `gh auth login` to have been completed. If `gh` is not installed, the server attempts to install it automatically (or runs `GH_INSTALL_COMMAND` when provided).
- Agent prompts always include baseline security guardrails, and command logs redact full prompt arguments.
- The server only picks tasks with Status = `In progress`.
