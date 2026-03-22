import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { startServer as startServerType } from '../src/server.ts';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';

const gitMock = {
  getRepoRoot: vi.fn(),
  getCurrentBranch: vi.fn(),
  getDefaultBaseBranch: vi.fn(),
  getRemoteUrl: vi.fn(),
  createWorktree: vi.fn(),
  getWorktreeForBranch: vi.fn(),
  pruneWorktrees: vi.fn(),
  getStatusPorcelain: vi.fn(),
  addAllAndCommit: vi.fn(),
  pushBranch: vi.fn(),
};

const notionMock = {
  getDatabase: vi.fn(),
  getDataSource: vi.fn(),
  queryDataSource: vi.fn(),
  updatePage: vi.fn(),
  getAllBlocks: vi.fn(),
  getTitleFromPage: vi.fn(),
  blocksToPlainText: vi.fn(),
  validateDataSourceSchema: vi.fn(),
};

const githubMock = {
  parseGithubRepo: vi.fn(),
  createPullRequest: vi.fn(),
  getPullRequestFeedback: vi.fn(),
};

const agentMock = {
  locateCodexBinary: vi.fn(),
  runAgent: vi.fn(),
  buildAgentArgs: vi.fn(),
};

vi.mock('../src/git.js', () => gitMock);
vi.mock('../src/notion.js', () => notionMock);
vi.mock('../src/github.js', () => githubMock);
vi.mock('../src/agent.js', () => agentMock);

let startServer: typeof startServerType;
let scheduledJobs: Array<Promise<unknown>> = [];

async function flushScheduledJobs() {
  while (scheduledJobs.length > 0) {
    const jobs = scheduledJobs;
    scheduledJobs = [];
    await Promise.allSettled(jobs);
  }
}

const baseConfig = {
  notionToken: 'token',
  notionDbId: 'db_1',
  notionDataSourceId: undefined,
  notionDataSourceName: undefined,
  notionVersion: '2025-09-03',
  statusProperty: 'Status',
  statusTodo: 'Not started',
  statusInProgress: 'In progress',
  statusInReview: 'In review',
  statusDone: 'Done',
  prProperty: 'PR',
  pollIntervalMs: 1000,
  worktreeRoot: '.notion-vibe/worktrees',
  baseBranch: undefined,
  agentCommand: 'codex',
  agentArgs: undefined,
  agentApprovalPolicy: 'never',
  codexInstallCommand: undefined,
  ghInstallCommand: undefined,
  githubRepoUrl: undefined,
  dryRun: true,
  maxConcurrent: 1,
  projectDir: '/repo',
};

beforeAll(async () => {
  // Dynamic import ensures our vi.mock hooks are registered before the module loads.
  ({ startServer } = await import('../src/server.ts'));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as unknown as NodeJS.Timeout);
  vi.spyOn(globalThis, 'setImmediate').mockImplementation((fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
    const job = Promise.resolve().then(() => fn(...args));
    scheduledJobs.push(job);
    return 0 as unknown as NodeJS.Immediate;
  });

  gitMock.getRepoRoot.mockResolvedValue('/repo');
  gitMock.getDefaultBaseBranch.mockResolvedValue('main');
  gitMock.getCurrentBranch.mockResolvedValue('main');

  notionMock.getDatabase.mockResolvedValue({ data_sources: [{ id: 'ds_1', name: 'Primary' }] });
  notionMock.getDataSource.mockResolvedValue({ properties: {} });
  notionMock.queryDataSource.mockResolvedValue({ results: [] });
  notionMock.validateDataSourceSchema.mockReturnValue([]);
  notionMock.getTitleFromPage.mockReturnValue('Task title');
  notionMock.getAllBlocks.mockResolvedValue([{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Card body' }] } }]);
  notionMock.blocksToPlainText.mockReturnValue('Card body');

  agentMock.locateCodexBinary.mockResolvedValue('/usr/bin/codex');
  agentMock.runAgent.mockResolvedValue(undefined);
  agentMock.buildAgentArgs.mockReturnValue([]);
  githubMock.getPullRequestFeedback.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  scheduledJobs = [];
});

describe('startServer', () => {
  it('throws when NOTION_TOKEN is missing', async () => {
    await expect(startServer({ ...baseConfig, notionToken: undefined })).rejects.toThrow(
      'NOTION_TOKEN is required.'
    );
  });

  it('throws when NOTION_DB_ID is missing', async () => {
    await expect(startServer({ ...baseConfig, notionDbId: undefined })).rejects.toThrow(
      'NOTION_DB_ID is required.'
    );
  });

  it('requires a data source id when multiple data sources exist', async () => {
    notionMock.getDatabase.mockResolvedValue({
      data_sources: [
        { id: 'ds_1', name: 'Primary' },
        { id: 'ds_2', name: 'Secondary' },
      ],
    });

    await expect(startServer({ ...baseConfig, notionDataSourceId: undefined })).rejects.toThrow(
      'NOTION_DATA_SOURCE_ID is required when the database has multiple data sources.'
    );
  });

  it('selects data source by name when provided', async () => {
    notionMock.getDatabase.mockResolvedValue({
      data_sources: [
        { id: 'ds_main', name: 'Main' },
        { id: 'ds_other', name: 'Other' },
      ],
    });

    const config = { ...baseConfig, notionDataSourceName: 'Main' };

    await startServer(config);

    expect(notionMock.getDataSource).toHaveBeenCalledWith({
      token: 'token',
      version: '2025-09-03',
      dataSourceId: 'ds_main',
    });
  });

  it('uses provided baseBranch without calling getDefaultBaseBranch', async () => {
    await startServer({ ...baseConfig, baseBranch: 'origin/dev' });

    expect(gitMock.getDefaultBaseBranch).not.toHaveBeenCalled();
  });

  it('logs schema validation issues but continues', async () => {
    notionMock.validateDataSourceSchema.mockReturnValue(['Issue 1']);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await startServer(baseConfig);

    expect(warnSpy).toHaveBeenCalledWith('[notion-vibe] Notion database validation issues:');
    expect(warnSpy).toHaveBeenCalledWith('[notion-vibe] - Issue 1');
  });

  it('normalizes origin-prefixed baseBranch before PR creation', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'notion-vibe-base-branch-'));
    const worktreeRoot = '.notion-vibe/worktrees';
    const worktreePath = path.join(repoRoot, worktreeRoot, 'notion/task-title-page1234');

    await mkdir(worktreePath, { recursive: true });

    gitMock.getRepoRoot.mockResolvedValue(repoRoot);
    gitMock.getWorktreeForBranch.mockResolvedValue({ path: worktreePath, branch: 'notion/task-title-page1234' });
    gitMock.getStatusPorcelain.mockResolvedValue('M src/index.ts');
    notionMock.queryDataSource.mockResolvedValueOnce({
      results: [{ id: 'page-1234', properties: { PR: { type: 'url', url: null } } }],
    });
    githubMock.createPullRequest.mockResolvedValue({ html_url: 'https://github.com/octo-org/hello/pull/2' });

    await startServer({
      ...baseConfig,
      dryRun: false,
      baseBranch: 'origin/dev',
      worktreeRoot,
      projectDir: repoRoot,
    });
    await flushScheduledJobs();

    expect(githubMock.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      base: 'dev',
    }));
  });

  it('retries createWorktree with local ref when origin ref fails', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'notion-vibe-ref-fallback-'));
    const worktreeRoot = '.notion-vibe/worktrees';

    gitMock.getRepoRoot.mockResolvedValue(repoRoot);
    gitMock.getWorktreeForBranch.mockResolvedValue(null);
    gitMock.getStatusPorcelain.mockResolvedValue('');
    notionMock.queryDataSource.mockResolvedValueOnce({
      results: [{ id: 'page-1234', properties: { PR: { type: 'url', url: null } } }],
    });
    gitMock.createWorktree
      .mockImplementationOnce(async () => {
        throw new Error('unknown revision');
      })
      .mockImplementationOnce(async ({ path: wtPath }: { path: string }) => {
        await mkdir(wtPath, { recursive: true });
      });

    await startServer({
      ...baseConfig,
      dryRun: false,
      worktreeRoot,
      projectDir: repoRoot,
    });
    await flushScheduledJobs();

    expect(gitMock.createWorktree).toHaveBeenCalledTimes(2);
    expect(gitMock.createWorktree).toHaveBeenNthCalledWith(2, expect.objectContaining({
      baseRef: 'main',
    }));
  });

  it('dry run does not trigger git, PR, or Notion write side effects', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'notion-vibe-dry-run-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    gitMock.getRepoRoot.mockResolvedValue(repoRoot);
    notionMock.queryDataSource.mockResolvedValueOnce({
      results: [{ id: 'page-1234', properties: { PR: { type: 'url', url: null } } }],
    });

    await startServer({
      ...baseConfig,
      dryRun: true,
      projectDir: repoRoot,
    });
    await flushScheduledJobs();

    expect(gitMock.getWorktreeForBranch).not.toHaveBeenCalled();
    expect(gitMock.createWorktree).not.toHaveBeenCalled();
    expect(gitMock.getStatusPorcelain).not.toHaveBeenCalled();
    expect(gitMock.addAllAndCommit).not.toHaveBeenCalled();
    expect(gitMock.pushBranch).not.toHaveBeenCalled();
    expect(agentMock.runAgent).not.toHaveBeenCalled();
    expect(githubMock.createPullRequest).not.toHaveBeenCalled();
    expect(notionMock.updatePage).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      '[notion-vibe] [dry-run] No side effects: skipping worktree creation, agent execution, git commit/push, PR creation, and Notion updates.'
    );
  });

  it('retries PR creation without rerunning agent when content is unchanged and PR has no comments', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'notion-vibe-retry-'));
    const worktreeRoot = '.notion-vibe/worktrees';
    const worktreePath = path.join(repoRoot, worktreeRoot, 'notion/task-title-page1234');
    const statePath = path.join(repoRoot, worktreeRoot, '.task-state', 'page-1234.json');

    await mkdir(worktreePath, { recursive: true });
    await mkdir(path.dirname(statePath), { recursive: true });
    const contentHash = createHash('sha256').update('Task title\n\nCard body').digest('hex');
    await writeFile(
      statePath,
      `${JSON.stringify({ contentHash })}\n`,
      'utf8'
    );

    gitMock.getRepoRoot.mockResolvedValue(repoRoot);
    gitMock.getWorktreeForBranch.mockResolvedValue({ path: worktreePath, branch: 'notion/task-title-page1234' });
    gitMock.getStatusPorcelain.mockResolvedValue('');
    notionMock.queryDataSource.mockResolvedValueOnce({
      results: [{ id: 'page-1234', properties: { PR: { type: 'url', url: null } } }],
    });
    githubMock.createPullRequest.mockResolvedValue({ html_url: 'https://github.com/octo-org/hello/pull/1' });
    githubMock.parseGithubRepo.mockReturnValue({ owner: 'octo-org', repo: 'hello' });

    await startServer({
      ...baseConfig,
      dryRun: false,
      worktreeRoot,
      projectDir: repoRoot,
      githubRepoUrl: 'https://github.com/octo-org/hello',
    });
    await flushScheduledJobs();

    expect(agentMock.runAgent).not.toHaveBeenCalled();
    expect(githubMock.createPullRequest).toHaveBeenCalledTimes(1);
    expect(notionMock.updatePage).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        PR: { url: 'https://github.com/octo-org/hello/pull/1' },
      }),
    }));
  });

  it('reruns agent with PR feedback when comments exist and keeps existing PR URL', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'notion-vibe-feedback-'));
    const worktreeRoot = '.notion-vibe/worktrees';
    const worktreePath = path.join(repoRoot, worktreeRoot, 'notion/task-title-page1234');

    await mkdir(worktreePath, { recursive: true });

    gitMock.getRepoRoot.mockResolvedValue(repoRoot);
    gitMock.getWorktreeForBranch.mockResolvedValue({ path: worktreePath, branch: 'notion/task-title-page1234' });
    gitMock.getStatusPorcelain.mockResolvedValue('M src/index.ts');
    notionMock.queryDataSource.mockResolvedValueOnce({
      results: [{
        id: 'page-1234',
        properties: {
          PR: { type: 'url', url: 'https://github.com/octo-org/hello/pull/9' },
        },
      }],
    });
    githubMock.getPullRequestFeedback.mockResolvedValue(['Please add a test for edge case X']);

    await startServer({
      ...baseConfig,
      dryRun: false,
      worktreeRoot,
      projectDir: repoRoot,
    });
    await flushScheduledJobs();

    expect(agentMock.runAgent).toHaveBeenCalledTimes(1);
    expect(agentMock.buildAgentArgs).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.stringContaining('GitHub PR feedback:'),
    }));
    expect(gitMock.pushBranch).toHaveBeenCalledTimes(1);
    expect(githubMock.createPullRequest).not.toHaveBeenCalled();
    expect(notionMock.updatePage).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        PR: { url: 'https://github.com/octo-org/hello/pull/9' },
      }),
    }));
  });
});
