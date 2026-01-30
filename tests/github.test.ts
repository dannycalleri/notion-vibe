import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPullRequest, parseGithubRepo } from '../src/github.ts';

describe('github helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it('createPullRequest posts to GitHub and returns JSON', async () => {
    const json = vi.fn().mockResolvedValue({ html_url: 'https://github.com/octo-org/hello-world/pull/1' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201, json });

    vi.stubGlobal('fetch', fetchSpy);

    const pr = await createPullRequest({
      token: 'token',
      owner: 'octo-org',
      repo: 'hello-world',
      title: 'Add feature',
      head: 'octo-org:feature',
      base: 'main',
      body: 'Context',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/octo-org/hello-world/pulls');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer token');
    expect(pr).toEqual({ html_url: 'https://github.com/octo-org/hello-world/pull/1' });
  });

  it('createPullRequest throws with status on error', async () => {
    const text = vi.fn().mockResolvedValue('Bad Request');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 400, text });

    vi.stubGlobal('fetch', fetchSpy);

    await expect(() =>
      createPullRequest({
        token: 'token',
        owner: 'octo-org',
        repo: 'hello-world',
        title: 'Add feature',
        head: 'octo-org:feature',
        base: 'main',
      })
    ).rejects.toMatchObject({ message: 'Bad Request', status: 400 });
  });
});
