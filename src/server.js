import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import {
  getRepoRoot,
  getCurrentBranch,
  getDefaultBaseBranch,
  getRemoteUrl,
  createWorktree,
  getWorktreeForBranch,
  pruneWorktrees,
  getStatusPorcelain,
  addAllAndCommit,
  pushBranch,
} from './git.js';
import {
  getDatabase,
  getDataSource,
  queryDataSource,
  updatePage,
  getAllBlocks,
  getTitleFromPage,
  blocksToPlainText,
  validateDataSourceSchema,
} from './notion.js';
import { parseGithubRepo, createPullRequest } from './github.js';
import { locateCodexBinary, runAgent, buildAgentArgs } from './agent.js';

function log(message, ...args) {
  console.log(`[notion-vibe] ${message}`, ...args);
}

function warn(message, ...args) {
  console.warn(`[notion-vibe] ${message}`, ...args);
}

function formatCommand(command, args) {
  const escape = (value) => {
    const str = String(value);
    if (/^[a-zA-Z0-9._/:-]+$/.test(str)) return str;
    return `'${str.replace(/'/g, `'\"'\"'`)}'`;
  };
  return [command, ...(args || [])].map(escape).join(' ');
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40) || 'task';
}

function buildBranchName(title, pageId) {
  const slug = slugify(title);
  const shortId = pageId.replace(/-/g, '').slice(0, 8);
  return `notion/${slug}-${shortId}`;
}

function getWorktreePath(repoRoot, worktreeRoot, branchName) {
  return path.join(repoRoot, worktreeRoot, branchName);
}

async function promptYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return ['y', 'yes'].includes(String(answer).trim().toLowerCase());
}

async function runShellCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

async function ensureAgentCommand(config, projectDir) {
  if (config.agentCommand) return config.agentCommand;

  const codexPath = await locateCodexBinary(projectDir);
  if (codexPath) return codexPath;

  log('Codex CLI not found in PATH or common install locations.');
  const wantsInstall = await promptYesNo('Install Codex now? (y/N) ');
  if (!wantsInstall) return null;

  if (!config.codexInstallCommand) {
    warn('Set CODEX_INSTALL_COMMAND to run the install automatically.');
    return null;
  }

  await runShellCommand(config.codexInstallCommand, projectDir);
  return locateCodexBinary(projectDir);
}

async function ensureWorktree({ repoRoot, worktreeRoot, branchName, baseRef }) {
  const existing = await getWorktreeForBranch(repoRoot, branchName);
  if (existing?.path) {
    try {
      await access(existing.path);
      return existing.path;
    } catch {
      await pruneWorktrees(repoRoot);
    }
  }
  const worktreePath = getWorktreePath(repoRoot, worktreeRoot, branchName);
  await mkdir(path.dirname(worktreePath), { recursive: true });
  try {
    await access(worktreePath);
    return worktreePath;
  } catch {
    try {
      await createWorktree({ cwd: repoRoot, branch: branchName, path: worktreePath, baseRef });
    } catch (err) {
      if (baseRef.startsWith('origin/')) {
        const fallbackRef = baseRef.replace(/^origin\\/, '');
        await createWorktree({ cwd: repoRoot, branch: branchName, path: worktreePath, baseRef: fallbackRef });
      } else {
        throw err;
      }
    }
  }
  return worktreePath;
}

async function createPrIfPossible({
  config,
  repoRoot,
  worktreePath,
  branchName,
  baseBranch,
  title,
  context,
}) {
  if (!config.githubToken) {
    warn('GITHUB_TOKEN missing; skipping PR creation.');
    return null;
  }

  const remoteUrl = config.githubRepoUrl || await getRemoteUrl(repoRoot);
  const repo = parseGithubRepo(remoteUrl);
  if (!repo) {
    warn('Unable to parse GitHub repo from remote URL; skipping PR creation.');
    return null;
  }

  await pushBranch(worktreePath, branchName);

  const body = context ? `Context:\n\n${context}` : undefined;
  const headRef = `${repo.owner}:${branchName}`;
  log(`Creating PR on ${repo.owner}/${repo.repo} head=${headRef} base=${baseBranch}`);
  const pr = await createPullRequest({
    token: config.githubToken,
    owner: repo.owner,
    repo: repo.repo,
    title,
    head: headRef,
    base: baseBranch,
    body,
  });

  log(`Created PR: ${pr.html_url}`);
  return pr.html_url;
}

async function updateNotionStatus({ config, pageId, statusName, prUrl }) {
  const properties = {
    [config.statusProperty]: { status: { name: statusName } },
  };
  if (prUrl) {
    properties[config.prProperty] = { url: prUrl };
  }
  await updatePage({
    token: config.notionToken,
    version: config.notionVersion,
    pageId,
    properties,
  });
}

async function handlePage({ page, config, repoRoot, baseBranch, agentCommand }) {
  const title = getTitleFromPage(page);
  const blocks = await getAllBlocks({
    token: config.notionToken,
    version: config.notionVersion,
    blockId: page.id,
  });
  const context = blocksToPlainText(blocks);

  const branchName = buildBranchName(title, page.id);
  const baseRef = baseBranch.startsWith('origin/') ? baseBranch : `origin/${baseBranch}`;

  log(`Starting task "${title}" on ${branchName}`);
  const worktreePath = await ensureWorktree({
    repoRoot,
    worktreeRoot: config.worktreeRoot,
    branchName,
    baseRef,
  });
  try {
    await access(worktreePath);
  } catch {
    throw new Error(`Worktree path not found: ${worktreePath}`);
  }

  if (!config.dryRun) {
    const args = buildAgentArgs({
      command: agentCommand,
      trustLevel: config.agentTrustLevel,
      title,
      context,
      argsTemplate: config.agentArgs,
    });

    log(`Agent command: ${formatCommand(agentCommand, args)}`);
    await runAgent({
      command: agentCommand,
      args,
      cwd: worktreePath,
      env: {
        TASK_TITLE: title,
        TASK_CONTEXT: context,
        NOTION_PAGE_ID: page.id,
      },
    });
  } else {
    log('Dry run enabled; skipping agent execution.');
  }

  const status = await getStatusPorcelain(worktreePath);
  if (!status) {
    warn('No git changes detected after agent run.');
  } else if (!config.dryRun) {
    await addAllAndCommit(worktreePath, `notion: ${title} (${page.id})`);
  }

  let prUrl = null;
  if (status && !config.dryRun) {
    try {
      prUrl = await createPrIfPossible({
        config,
        repoRoot,
        worktreePath,
        branchName,
        baseBranch,
        title,
        context,
      });
    } catch (err) {
      warn('PR creation failed:', err?.message || err);
    }
  }

  await updateNotionStatus({
    config,
    pageId: page.id,
    statusName: config.statusInReview,
    prUrl,
  });
}

async function pollDatabase({ config, dataSourceId, inFlight, queue }) {
  const res = await queryDataSource({
    token: config.notionToken,
    version: config.notionVersion,
    dataSourceId,
    filter: {
      property: config.statusProperty,
      status: { equals: config.statusInProgress },
    },
    sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
  });

  for (const page of res.results ?? []) {
    if (inFlight.has(page.id)) continue;
    inFlight.add(page.id);
    queue.push(page);
  }
}

async function startQueue({ config, repoRoot, baseBranch, agentCommand, dataSourceId }) {
  const inFlight = new Set();
  const queue = [];
  let running = 0;

  const drain = async () => {
    if (running >= config.maxConcurrent) return;
    const page = queue.shift();
    if (!page) return;
    running += 1;
    try {
      await handlePage({ page, config, repoRoot, baseBranch, agentCommand });
    } catch (err) {
      warn(`Task ${page.id} failed:`, err?.message || err);
    } finally {
      running -= 1;
      inFlight.delete(page.id);
      setImmediate(drain);
    }
  };

  let polling = false;
  const tick = async () => {
    if (polling) return;
    polling = true;
    try {
      await pollDatabase({ config, dataSourceId, inFlight, queue });
      if (queue.length > 0) setImmediate(drain);
    } catch (err) {
      warn('Poll failed:', err?.message || err);
    } finally {
      polling = false;
    }
  };

  await tick();
  setInterval(tick, config.pollIntervalMs);
}

export async function startServer(config) {
  if (!config.notionToken) {
    throw new Error('NOTION_TOKEN is required.');
  }
  if (!config.notionDbId) {
    throw new Error('NOTION_DB_ID is required.');
  }

  const repoRoot = await getRepoRoot(config.projectDir);
  const rawBaseBranch = config.baseBranch || await getDefaultBaseBranch(repoRoot) || await getCurrentBranch(repoRoot);
  const baseBranch = rawBaseBranch.replace(/^origin\\/, '');

  const agentCommand = await ensureAgentCommand(config, config.projectDir);
  if (!agentCommand) {
    throw new Error('Agent command not available; aborting.');
  }

  const database = await getDatabase({
    token: config.notionToken,
    version: config.notionVersion,
    databaseId: config.notionDbId,
  });

  const dataSources = database?.data_sources ?? [];
  let dataSourceId = config.notionDataSourceId;
  if (!dataSourceId && config.notionDataSourceName) {
    const match = dataSources.find((source) => source?.name === config.notionDataSourceName);
    dataSourceId = match?.id;
  }
  if (!dataSourceId && dataSources.length === 1) {
    dataSourceId = dataSources[0].id;
  }
  if (!dataSourceId) {
    throw new Error('NOTION_DATA_SOURCE_ID is required when the database has multiple data sources.');
  }

  const dataSource = await getDataSource({
    token: config.notionToken,
    version: config.notionVersion,
    dataSourceId,
  });

  const issues = validateDataSourceSchema(dataSource, {
    statusProperty: config.statusProperty,
    prProperty: config.prProperty,
    statuses: [
      config.statusTodo,
      config.statusInProgress,
      config.statusInReview,
      config.statusDone,
    ],
  });

  if (issues.length > 0) {
    warn('Notion database validation issues:');
    for (const issue of issues) warn(`- ${issue}`);
  }

  log('Server started. Watching for "In progress" tasks...');
  log(`Repo: ${repoRoot}`);
  log(`Base branch: ${baseBranch}`);
  log(`Poll interval: ${config.pollIntervalMs}ms`);

  await startQueue({ config, repoRoot, baseBranch, agentCommand, dataSourceId });
}
