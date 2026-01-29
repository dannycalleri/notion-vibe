# notion-vibe

Run a local server that watches a Notion Kanban database, executes Codex (or another agent) in an isolated git worktree, opens a GitHub PR, and updates the Notion card to "In review" with the PR URL.

## Requirements

- Node.js 18+ (for native fetch)
- Git repository with an `origin` remote
- Notion database with:
  - `Status` property (type: status) with options: `Not started`, `In progress`, `In review`, `Done`
  - `PR` property (type: URL)

## Install / Run

From this repository root:

```bash
npm install
npm start -- --project-dir /path/to/your/project
```

Or build once and run from the target project root (if you want `PROJECT_DIR` to default to `cwd`):

```bash
npm --prefix /path/to/notion-vibe run build
node /path/to/notion-vibe/dist/cli.js
```

To run against a different project directory, use `--project-dir`:

```bash
node /path/to/notion-vibe/dist/cli.js --project-dir /path/to/your/project
```

## Configuration

Set these environment variables (recommended in `.env` from your current working directory):

```bash
NOTION_TOKEN="..."
NOTION_DB_ID="..."
GITHUB_TOKEN="..."
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
WORKTREE_ROOT=".notion-vibe/worktrees"
BASE_BRANCH="main"
AGENT_COMMAND="codex"
AGENT_ARGS='["exec","--sandbox","workspace-write","{prompt}"]'
CODEX_TRUST_LEVEL="trusted"
CODEX_INSTALL_COMMAND="npm i -g @openai/codex"
GITHUB_REPO_URL="git@github.com:owner/repo.git"
DRY_RUN="false"
MAX_CONCURRENT="1"
PROJECT_DIR="/path/to/your/project"
```

You can also pass CLI flags, which override env vars:

```bash
node dist/cli.js --notion-db-id YOUR_DB_ID --github-token YOUR_GH_TOKEN --project-dir /path/to/your/project
```

## Usage Flow

1. Start the server: `npm start` or `node src/cli.js`.
2. Create a task in your Notion database and set Status to `In progress`.
3. The server:
   - Creates a worktree on a new branch
   - Runs Codex (or your configured agent)
   - Commits and pushes changes
   - Opens a GitHub PR
   - Updates the Notion card to `In review` and fills the PR URL

## Testing Safely

Use dry-run mode to skip agent execution and git/PR actions:

```bash
node src/cli.js --dry-run true
```

## Notes

- Notion API `2025-09-03` splits databases into data sources. The database response includes a `data_sources` array; you must query a specific data source for rows and schema.
- Codex discovery: it searches PATH, local `node_modules/.bin`, and common home directory locations.
- If Codex is not found, the CLI prompts to install it using `CODEX_INSTALL_COMMAND`.
- The server only picks tasks with Status = `In progress`.
