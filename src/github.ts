import { runCommand, runShellCommand, runParsedCommand, isMissingCommandError } from './shell.js';
import { parseAllowlistedGhInstallCommand } from './install-command.js';

type GithubRepo = {
  owner: string;
  repo: string;
};

type CreatePullRequestInput = {
  cwd: string;
  ghInstallCommand?: string;
  repo?: string;
  title: string;
  head: string;
  base: string;
  body?: string;
};

type ExecError = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
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

async function commandExists(command: string, cwd: string) {
  try {
    if (process.platform === 'win32') {
      await runCommand('where', [command], { cwd });
      return true;
    }
    await runShellCommand(`command -v ${command}`, { cwd });
    return true;
  } catch {
    return false;
  }
}

async function installGh(cwd: string, installCommand?: string) {
  if (installCommand) {
    const parsed = parseAllowlistedGhInstallCommand(installCommand);
    await runParsedCommand(parsed, { cwd });
    return;
  }

  if (process.platform === 'darwin' && await commandExists('brew', cwd)) {
    await runShellCommand('brew install gh', { cwd });
    return;
  }

  if (process.platform === 'linux') {
    const useSudo = typeof process.getuid === 'function' && process.getuid() !== 0 && await commandExists('sudo', cwd);
    const prefix = useSudo ? 'sudo ' : '';

    if (await commandExists('apt-get', cwd)) {
      await runShellCommand(`${prefix}apt-get update && ${prefix}apt-get install -y gh`, { cwd });
      return;
    }
    if (await commandExists('dnf', cwd)) {
      await runShellCommand(`${prefix}dnf install -y gh`, { cwd });
      return;
    }
    if (await commandExists('yum', cwd)) {
      await runShellCommand(`${prefix}yum install -y gh`, { cwd });
      return;
    }
    if (await commandExists('pacman', cwd)) {
      await runShellCommand(`${prefix}pacman -Sy --noconfirm github-cli`, { cwd });
      return;
    }
    if (await commandExists('zypper', cwd)) {
      await runShellCommand(`${prefix}zypper --non-interactive install gh`, { cwd });
      return;
    }
  }

  if (process.platform === 'win32') {
    if (await commandExists('winget', cwd)) {
      await runShellCommand('winget install --id GitHub.cli -e --source winget', { cwd });
      return;
    }
    if (await commandExists('choco', cwd)) {
      await runShellCommand('choco install gh -y', { cwd });
      return;
    }
    if (await commandExists('scoop', cwd)) {
      await runShellCommand('scoop install gh', { cwd });
      return;
    }
  }

  throw new Error(
    'GitHub CLI (gh) is required but not installed. Install it from https://cli.github.com/ or set GH_INSTALL_COMMAND.'
  );
}

async function ensureGhInstalled(cwd: string, installCommand?: string) {
  try {
    await runCommand('gh', ['--version'], { cwd });
    return;
  } catch (error) {
    if (!isMissingCommandError(error)) throw error;
  }

  await installGh(cwd, installCommand);
  try {
    await runCommand('gh', ['--version'], { cwd });
  } catch (error) {
    throw new Error(
      `GitHub CLI installation did not produce a working "gh" binary: ${String((error as ExecError)?.message || error)}`
    );
  }
}

async function ensureGhAuthenticated(cwd: string) {
  try {
    await runCommand('gh', ['auth', 'status', '--hostname', 'github.com'], { cwd });
  } catch (error) {
    const stderr = (error as ExecError)?.stderr?.trim();
    const details = stderr ? ` ${stderr}` : '';
    throw new Error(
      `GitHub CLI is not authenticated. Run "gh auth login --hostname github.com --web" and retry.${details}`
    );
  }
}

function extractPullRequestUrl(output: string) {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/^https?:\/\/\S+\/pull\/\d+/.test(line)) return line;
  }
  const match = output.match(/https?:\/\/\S+\/pull\/\d+/);
  return match?.[0] || null;
}

export async function createPullRequest({
  cwd,
  ghInstallCommand,
  repo,
  title,
  head,
  base,
  body,
}: CreatePullRequestInput): Promise<any> {
  await ensureGhInstalled(cwd, ghInstallCommand);
  await ensureGhAuthenticated(cwd);

  const args = ['pr', 'create', '--title', title, '--head', head, '--base', base, '--body', body ?? ''];
  if (repo) {
    args.push('--repo', repo);
  }

  const output = await runCommand('gh', args, { cwd });
  const htmlUrl = extractPullRequestUrl(output);
  if (!htmlUrl) {
    throw new Error(`Unable to parse pull request URL from gh output: ${output}`);
  }

  return { html_url: htmlUrl };
}
