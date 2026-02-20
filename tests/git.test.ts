import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as gitModule from '../src/git.ts';

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('node:util', () => ({
  promisify: (fn: any) => {
    return (...args: any[]) => new Promise((resolve, reject) => {
      fn(...args, (err: Error | null, stdout: string, stderr: string) => {
        if (err) return reject(err);
        resolve({ stdout, stderr });
      });
    });
  },
}));

let git: typeof gitModule;
let responses: Array<string | Error> = [];

beforeAll(async () => {
  // Dynamic import ensures the vi.mock hooks are registered before the module loads.
  git = await import('../src/git.ts');
});

beforeEach(() => {
  responses = [];
  execFileMock.mockReset();
execFileMock.mockImplementation((cmd: string, args: string[], options: { cwd: string }, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
    const next = responses.shift();
    if (next instanceof Error) {
      cb(next);
      return;
    }
    cb(null, next ?? '', '');
  });
});

describe('git helpers', () => {
  it('getRepoRoot runs rev-parse', async () => {
    responses.push('/repo\n');

    const root = await git.getRepoRoot('/work');

    expect(root).toBe('/repo');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: '/work' },
      expect.any(Function)
    );
  });

  it('getDefaultBaseBranch parses origin HEAD', async () => {
    responses.push('refs/remotes/origin/develop\n');

    const branch = await git.getDefaultBaseBranch('/work');

    expect(branch).toBe('develop');
  });

  it('getDefaultBaseBranch falls back to main on error', async () => {
    responses.push(new Error('boom'));

    const branch = await git.getDefaultBaseBranch('/work');

    expect(branch).toBe('main');
  });

  it('listWorktrees parses porcelain output', async () => {
    responses.push(
      [
        'worktree /repo',
        'HEAD abc',
        'branch refs/heads/main',
        'worktree /repo/.wt/feature',
        'HEAD def',
        'branch refs/heads/feature',
      ].join('\n') + '\n'
    );

    const worktrees = await git.listWorktrees('/repo');

    expect(worktrees).toEqual([
      { path: '/repo', branch: 'main' },
      { path: '/repo/.wt/feature', branch: 'feature' },
    ]);
  });

  it('getWorktreeForBranch returns matching worktree', async () => {
    responses.push(
      [
        'worktree /repo',
        'HEAD abc',
        'branch refs/heads/main',
        'worktree /repo/.wt/feature',
        'HEAD def',
        'branch refs/heads/feature',
      ].join('\n') + '\n'
    );

    const worktree = await git.getWorktreeForBranch('/repo', 'feature');

    expect(worktree).toEqual({ path: '/repo/.wt/feature', branch: 'feature' });
  });

  it('addAllAndCommit stages then commits', async () => {
    responses.push('', 'Committed');

    await git.addAllAndCommit('/repo', 'chore: update');

    expect(execFileMock).toHaveBeenNthCalledWith(
      1,
      'git',
      ['add', '-A'],
      { cwd: '/repo' },
      expect.any(Function)
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      'git',
      ['commit', '-m', 'chore: update'],
      { cwd: '/repo' },
      expect.any(Function)
    );
  });
});
