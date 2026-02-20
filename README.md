# turbo-vibe (beta)

## Overview

`turbo-vibe` is a headless orchestrator for running parallel coding agents that attaches to your existing kanban workflow.

It currently supports:

- Notion as the kanban system
- Codex as the coding agent

The goal is to power up engineer-led product management in the age of AI.

## Installation

```bash
npx turbo-vibe
```

Minimum requirements:

- Node.js 18+
- A git repository with an `origin` remote
- `gh` authenticated for PR creation (`gh auth login`)
- A Notion database with:
  - `Status` (status property)
  - `PR` (URL property)

Configure environment variables (typically in `.env`):

```bash
NOTION_TOKEN="..."
NOTION_DB_ID="..."
NOTION_DATA_SOURCE_ID="..." # required when the database has multiple data sources
```

Helpful optional flags:

```bash
npx turbo-vibe --project-dir /path/to/your/project --dry-run true
```

## Support

- Open an issue in this repository for bugs and feature requests.
- Include your command, environment variables used (redacted), and logs when reporting issues.

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a branch for your change.
3. Add or update tests.
4. Run lint, typecheck, and tests.
5. Open a pull request with a clear summary and verification steps.

Conventional Commits are preferred.

## Development

Clone and install:

```bash
git clone <repo-url>
cd turbo-vibe
npm install
```

Common commands:

```bash
npm run build
npm start -- --project-dir /path/to/your/project
npm test
npm run test:watch
npm run typecheck
npm run lint
```

Use dry run to validate orchestration flow without agent execution or git/PR side effects:

```bash
npm start -- --dry-run true
```
