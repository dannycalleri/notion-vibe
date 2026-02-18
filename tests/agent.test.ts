import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const accessMock = vi.fn();
const readdirMock = vi.fn();
const spawnMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: accessMock,
  readdir: readdirMock,
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

let agent: typeof import('../src/agent.ts');
let accessiblePaths: Set<string>;
let readdirEntries: Map<string, Array<{ name: string; isDirectory: () => boolean }>>;

function setAccessible(paths: string[]) {
  accessiblePaths = new Set(paths);
}

function setReaddir(dir: string, entries: Array<{ name: string; isDirectory: () => boolean }>) {
  readdirEntries.set(dir, entries);
}

function createChild() {
  const handlers: Record<string, (...args: any[]) => void> = {};
  return {
    on(event: string, handler: (...args: any[]) => void) {
      handlers[event] = handler;
    },
    trigger(event: string, ...args: any[]) {
      handlers[event]?.(...args);
    },
  };
}

beforeAll(async () => {
  // Dynamic import ensures our vi.mock hooks are registered before the module loads.
  agent = await import('../src/agent.ts');
});

beforeEach(() => {
  accessiblePaths = new Set();
  readdirEntries = new Map();
  accessMock.mockReset();
  readdirMock.mockReset();
  spawnMock.mockReset();

  accessMock.mockImplementation(async (filePath: string) => {
    if (accessiblePaths.has(filePath)) return;
    throw new Error('ENOENT');
  });

  readdirMock.mockImplementation(async (dir: string) => {
    const entries = readdirEntries.get(dir);
    if (!entries) throw new Error('ENOENT');
    return entries;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('locateCodexBinary', () => {
  it('finds codex in PATH first', async () => {
    vi.stubEnv('PATH', '/usr/bin:/opt/bin');
    setAccessible(['/opt/bin/codex']);

    const found = await agent.locateCodexBinary('/repo');

    expect(found).toBe('/opt/bin/codex');
  });

  it('finds codex in a parent project node_modules', async () => {
    vi.stubEnv('PATH', '');
    setAccessible(['/repo/node_modules/.bin/codex']);

    const found = await agent.locateCodexBinary('/repo/apps/app1');

    expect(found).toBe('/repo/node_modules/.bin/codex');
  });

  it('finds codex in home (nvm) when not in path or project', async () => {
    vi.stubEnv('PATH', '');
    vi.stubEnv('HOME', '/home/me');

    setReaddir('/home/me/.nvm/versions/node', [
      { name: 'v20.0.0', isDirectory: () => true },
    ]);
    setAccessible(['/home/me/.nvm/versions/node/v20.0.0/bin/codex']);

    const found = await agent.locateCodexBinary('/repo');

    expect(found).toBe('/home/me/.nvm/versions/node/v20.0.0/bin/codex');
  });
});

describe('buildAgentArgs', () => {
  it('substitutes tokens from JSON argsTemplate', () => {
    const args = agent.buildAgentArgs({
      command: 'codex',
      trustLevel: 'trusted',
      title: 'Fix bug',
      context: 'Details',
      argsTemplate: '["exec","{prompt}"]',
    });

    expect(args).toEqual([
      'exec',
      expect.stringContaining('Task:\nFix bug\n\nContext:\nDetails'),
    ]);
  });

  it('supports trust level placeholder in argsTemplate', () => {
    const args = agent.buildAgentArgs({
      command: 'codex',
      trustLevel: 'sandboxed',
      title: 'Fix bug',
      argsTemplate: '["exec","--trust-level","{trustLevel}"]',
    });

    expect(args).toEqual(['exec', '--trust-level', 'sandboxed']);
  });

  it('defaults to codex args and passes trust-level when no template is provided', () => {
    const args = agent.buildAgentArgs({
      command: '/usr/local/bin/codex',
      trustLevel: 'trusted',
      title: 'Fix bug',
      context: 'Details',
    });

    expect(args).toEqual([
      'exec',
      '--sandbox',
      'workspace-write',
      '--trust-level',
      'trusted',
      expect.stringContaining('Task:\nFix bug\n\nContext:\nDetails'),
    ]);
  });

  it('returns empty args for non-codex commands without a template', () => {
    const args = agent.buildAgentArgs({
      command: '/usr/local/bin/other',
      title: 'Fix bug',
      context: 'Details',
    });

    expect(args).toEqual([]);
  });
});

describe('runAgent', () => {
  it('resolves on exit code 0 and merges env', async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child);
    vi.stubEnv('FROM_PROCESS', 'yes');

    const promise = agent.runAgent({
      command: 'codex',
      args: ['exec'],
      cwd: '/repo',
      env: { FROM_ENV: 'ok', FROM_PROCESS: 'override' },
    });

    child.trigger('exit', 0);

    await expect(promise).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledWith(
      'codex',
      ['exec'],
      expect.objectContaining({
        cwd: '/repo',
        stdio: 'inherit',
        env: expect.objectContaining({
          FROM_ENV: 'ok',
          FROM_PROCESS: 'override',
        }),
      })
    );
  });

  it('rejects on non-zero exit codes', async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child);

    const promise = agent.runAgent({
      command: 'codex',
      args: ['exec'],
      cwd: '/repo',
    });

    child.trigger('exit', 1);

    await expect(promise).rejects.toThrow('Agent exited with code 1');
  });
});
