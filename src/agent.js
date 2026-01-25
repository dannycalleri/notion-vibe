import { spawn } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

async function pathExists(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findInDir(dir, name) {
  const fullPath = path.join(dir, name);
  if (await pathExists(fullPath)) return fullPath;
  return null;
}

async function findInPath(name) {
  const paths = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const found = await findInDir(dir, name);
    if (found) return found;
  }
  return null;
}

async function findCodexInHome() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const candidates = [
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.nvm', 'versions', 'node'),
  ];

  for (const base of candidates) {
    try {
      const stats = await readdir(base, { withFileTypes: true });
      if (base.endsWith(path.join('.nvm', 'versions', 'node'))) {
        for (const entry of stats) {
          if (!entry.isDirectory()) continue;
          const found = await findInDir(path.join(base, entry.name, 'bin'), 'codex');
          if (found) return found;
        }
      } else {
        const found = await findInDir(base, 'codex');
        if (found) return found;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function findCodexInProject(projectDir) {
  let current = projectDir;
  for (let i = 0; i < 4; i += 1) {
    const candidate = path.join(current, 'node_modules', '.bin', 'codex');
    if (await pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export async function locateCodexBinary(projectDir) {
  return (await findInPath('codex'))
    || (await findCodexInProject(projectDir))
    || (await findCodexInHome());
}

export async function runAgent({ command, args, cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Agent exited with code ${code}`));
    });
  });
}

function buildPrompt(title, context) {
  if (context) return `${title}\n\nContext:\n${context}`;
  return title;
}

export function buildAgentArgs({ command, trustLevel, title, context, argsTemplate }) {
  const prompt = buildPrompt(title, context);
  if (argsTemplate) {
    let tokens = [];
    const trimmed = argsTemplate.trim();
    if (trimmed.startsWith('[')) {
      try {
        tokens = JSON.parse(trimmed);
      } catch {
        tokens = trimmed.split(' ').filter(Boolean);
      }
    } else {
      tokens = trimmed.split(' ').filter(Boolean);
    }
    return tokens.map((token) => String(token)
      .replaceAll('{title}', title)
      .replaceAll('{context}', context)
      .replaceAll('{prompt}', prompt));
  }

  if (path.basename(command) === 'codex') {
    return [
      'exec',
      '--sandbox',
      'workspace-write',
      prompt,
    ];
  }
  return [];
}
