import { GITHUB_API } from "./config.js";

type GithubRepo = {
  owner: string;
  repo: string;
};

type CreatePullRequestInput = {
  token: string;
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
};

export function parseGithubRepo(remoteUrl: string | null | undefined): GithubRepo | null {
  if (!remoteUrl) return null;

  if (remoteUrl.startsWith('git@')) {
    const match = remoteUrl.match(/git@[^:]+:([^/]+)\/(.+?)(\.git)?$/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  try {
    const url = new URL(remoteUrl);
    if (!url.hostname.includes('github.com')) return null;
    const [owner, repoWithGit] = url.pathname.replace(/^\//, '').split('/');
    if (!owner || !repoWithGit) return null;
    const repo = repoWithGit.replace(/\.git$/, '');
    return { owner, repo };
  } catch {
    return null;
  }
}

export async function createPullRequest({
  token,
  owner,
  repo,
  title,
  head,
  base,
  body,
}: CreatePullRequestInput): Promise<any> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ title, head, base, body }),
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(text || `GitHub API error: ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}
