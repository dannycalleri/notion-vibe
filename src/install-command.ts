import { parseSimpleCommand, type ParsedCommand } from './shell.js';

const CODEX_INSTALL_ALLOWLIST: string[][] = [
  ['npm', 'i', '-g', '@openai/codex'],
  ['npm', 'install', '-g', '@openai/codex'],
  ['pnpm', 'add', '-g', '@openai/codex'],
  ['yarn', 'global', 'add', '@openai/codex'],
];

const GH_INSTALL_ALLOWLIST: string[][] = [
  ['brew', 'install', 'gh'],
  ['apt-get', 'install', '-y', 'gh'],
  ['dnf', 'install', '-y', 'gh'],
  ['yum', 'install', '-y', 'gh'],
  ['pacman', '-sy', '--noconfirm', 'github-cli'],
  ['zypper', '--non-interactive', 'install', 'gh'],
  ['winget', 'install', '--id', 'github.cli', '-e', '--source', 'winget'],
  ['choco', 'install', 'gh', '-y'],
  ['scoop', 'install', 'gh'],
];

function normalizeTokens(tokens: string[]) {
  return tokens.map((token) => token.toLowerCase());
}

function tokensForMatching(parsed: ParsedCommand) {
  const tokens = [parsed.command, ...parsed.args];
  if (tokens[0]?.toLowerCase() === 'sudo') {
    return tokens.slice(1);
  }
  return tokens;
}

function matchesAllowlist(tokens: string[], allowlist: string[][]) {
  const normalized = normalizeTokens(tokens);
  return allowlist.some((allowed) => {
    const normalizedAllowed = normalizeTokens(allowed);
    return normalized.length === normalizedAllowed.length
      && normalized.every((token, i) => token === normalizedAllowed[i]);
  });
}

function assertAllowed(command: string, allowlist: string[][], name: string): ParsedCommand {
  const parsed = parseSimpleCommand(command);
  const tokens = tokensForMatching(parsed);
  if (!matchesAllowlist(tokens, allowlist)) {
    const allowed = allowlist.map((entry) => entry.join(' ')).join(', ');
    throw new Error(`${name} is not allowlisted. Allowed commands: ${allowed}`);
  }
  return parsed;
}

export function parseAllowlistedCodexInstallCommand(command: string) {
  return assertAllowed(command, CODEX_INSTALL_ALLOWLIST, 'CODEX_INSTALL_COMMAND');
}

export function parseAllowlistedGhInstallCommand(command: string) {
  return assertAllowed(command, GH_INSTALL_ALLOWLIST, 'GH_INSTALL_COMMAND');
}
