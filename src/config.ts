export type AppConfig = {
  notionToken?: string;
  notionDbId?: string;
  notionDataSourceId?: string;
  notionDataSourceName?: string;
  notionVersion: string;
  statusProperty: string;
  statusTodo: string;
  statusInProgress: string;
  statusInReview: string;
  statusDone: string;
  prProperty: string;
  pollIntervalMs: number;
  worktreeRoot: string;
  baseBranch?: string;
  agentCommand?: string;
  agentArgs?: string;
  agentTrustLevel: string;
  codexInstallCommand?: string;
  ghInstallCommand?: string;
  githubRepoUrl?: string;
  dryRun: boolean;
  maxConcurrent: number;
  projectDir: string;
};

export function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    
    // Ignore all arguments not starting with '--'
    if (!arg.startsWith('--')) continue;
    const [key, eqValue] = arg.slice(2).split('=');
    if (eqValue !== undefined) {
      out[key] = eqValue;
      continue;
    }
    // Support both `--key value` and `--flag` forms. Example:
    // argv = ["--project-dir", "/tmp/app", "--dry-run"] =>
    // out["project-dir"] = "/tmp/app", out["dry-run"] = "true".
    const next = argv[i + 1];

    // This case means that next argument is actually the value
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      // This case means the argument is value less, like --dry-run
      out[key] = 'true';
    }
  }
  return out;
}

export function toNumber(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function toBool(value: unknown, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase().trim();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function loadConfig(argv: string[]): AppConfig {
  const DEFAULT_NOTION_VERSION = '2025-09-03';
  const args = parseArgs(argv);
  return {
    notionToken: args['notion-token'] ?? process.env.NOTION_TOKEN,
    notionDbId: args['notion-db-id'] ?? process.env.NOTION_DB_ID,
    notionDataSourceId: args['notion-data-source-id'] ?? process.env.NOTION_DATA_SOURCE_ID,
    notionDataSourceName: args['notion-data-source-name'] ?? process.env.NOTION_DATA_SOURCE_NAME,
    notionVersion: args['notion-version'] ?? process.env.NOTION_VERSION ?? DEFAULT_NOTION_VERSION,
    statusProperty: args['status-property'] ?? process.env.NOTION_STATUS_PROPERTY ?? 'Status',
    statusTodo: args['status-todo'] ?? process.env.NOTION_STATUS_TODO ?? 'Not started',
    statusInProgress: args['status-in-progress'] ?? process.env.NOTION_STATUS_IN_PROGRESS ?? 'In progress',
    statusInReview: args['status-in-review'] ?? process.env.NOTION_STATUS_IN_REVIEW ?? 'In review',
    statusDone: args['status-done'] ?? process.env.NOTION_STATUS_DONE ?? 'Done',
    prProperty: args['pr-property'] ?? process.env.NOTION_PR_PROPERTY ?? 'PR',
    pollIntervalMs: toNumber(args['poll-interval-ms'] ?? process.env.POLL_INTERVAL_MS, 30000),
    worktreeRoot: args['worktree-root'] ?? process.env.WORKTREE_ROOT ?? '.notion-vibe/worktrees',
    baseBranch: args['base-branch'] ?? process.env.BASE_BRANCH,
    agentCommand: args['agent-command'] ?? process.env.AGENT_COMMAND,
    agentArgs: args['agent-args'] ?? process.env.AGENT_ARGS,
    agentTrustLevel: args['agent-trust-level'] ?? process.env.CODEX_TRUST_LEVEL ?? 'trusted',
    codexInstallCommand: args['codex-install-command'] ?? process.env.CODEX_INSTALL_COMMAND,
    ghInstallCommand: args['gh-install-command'] ?? process.env.GH_INSTALL_COMMAND,
    githubRepoUrl: args['github-repo-url'] ?? process.env.GITHUB_REPO_URL,
    dryRun: toBool(args['dry-run'] ?? process.env.DRY_RUN, false),
    maxConcurrent: toNumber(args['max-concurrent'] ?? process.env.MAX_CONCURRENT, 1),
    projectDir: args['project-dir'] ?? process.env.PROJECT_DIR ?? process.cwd(),
  };
}
