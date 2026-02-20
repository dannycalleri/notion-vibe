import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { startServer as startServerType } from '../src/server.ts';

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
  worktreeRoot: '.turbo-vibe/worktrees',
  baseBranch: undefined,
  agentCommand: 'codex',
  agentArgs: undefined,
  agentTrustLevel: 'trusted',
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

  gitMock.getRepoRoot.mockResolvedValue('/repo');
  gitMock.getDefaultBaseBranch.mockResolvedValue('main');
  gitMock.getCurrentBranch.mockResolvedValue('main');

  notionMock.getDatabase.mockResolvedValue({ data_sources: [{ id: 'ds_1', name: 'Primary' }] });
  notionMock.getDataSource.mockResolvedValue({ properties: {} });
  notionMock.queryDataSource.mockResolvedValue({ results: [] });
  notionMock.validateDataSourceSchema.mockReturnValue([]);

  agentMock.locateCodexBinary.mockResolvedValue('/usr/bin/codex');
  agentMock.runAgent.mockResolvedValue(undefined);
  agentMock.buildAgentArgs.mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
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

    expect(warnSpy).toHaveBeenCalledWith('[turbo-vibe] Notion database validation issues:');
    expect(warnSpy).toHaveBeenCalledWith('[turbo-vibe] - Issue 1');
  });
});
