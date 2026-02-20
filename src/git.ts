import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type RunGitOptions = {
  cwd: string;
};

type Worktree = {
  path: string;
  branch?: string;
};

type CreateWorktreeInput = {
  cwd: string;
  branch: string;
  path: string;
  baseRef: string;
};

async function runGit(args: string[], { cwd }: RunGitOptions) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export async function getRepoRoot(cwd: string) {
  return runGit(['rev-parse', '--show-toplevel'], { cwd });
}

export async function getCurrentBranch(cwd: string) {
  return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
}

export async function getDefaultBaseBranch(cwd: string) {
  try {
    const ref = await runGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd });
    const parts = ref.split('/');
    return parts[parts.length - 1];
  } catch {
    return 'main';
  }
}

export async function getRemoteUrl(cwd: string) {
  return runGit(['config', '--get', 'remote.origin.url'], { cwd });
}

export async function createWorktree({ cwd, branch, path, baseRef }: CreateWorktreeInput) {
  return runGit(['worktree', 'add', '-B', branch, path, baseRef], { cwd });
}

export async function listWorktrees(cwd: string): Promise<Worktree[]> {
  const output = await runGit(['worktree', 'list', '--porcelain'], { cwd });
  if (!output) return [];
  
  const lines = output.split('\n');
  const worktrees: Worktree[] = [];
  let current: Worktree = { path: '' };
  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.slice('worktree '.length).trim() };
      continue;
    }
    if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '').trim();
    }
  }
  if (current.path) worktrees.push(current);
  return worktrees;
}

export async function getWorktreeForBranch(cwd: string, branch: string) {
  const worktrees = await listWorktrees(cwd);
  return worktrees.find((wt) => wt.branch === branch) || null;
}

export async function pruneWorktrees(cwd: string) {
  return runGit(['worktree', 'prune'], { cwd });
}

export async function getStatusPorcelain(cwd: string) {
  return runGit(['status', '--porcelain'], { cwd });
}

export async function addAllAndCommit(cwd: string, message: string) {
  await runGit(['add', '-A'], { cwd });
  return runGit(['commit', '-m', message], { cwd });
}

export async function pushBranch(cwd: string, branch: string) {
  return runGit(['push', '-u', 'origin', branch], { cwd });
}
