const GITHUB_API = 'https://api.github.com';

export function parseGithubRepo(remoteUrl) {
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

export async function createPullRequest({ token, owner, repo, title, head, base, body }) {
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
    const error = new Error(text || `GitHub API error: ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}
