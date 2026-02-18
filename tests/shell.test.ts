import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  runCommand as runCommandType,
  runShellCommand as runShellCommandType,
  runParsedCommand as runParsedCommandType,
  parseSimpleCommand as parseSimpleCommandType,
  isMissingCommandError as isMissingCommandErrorType,
} from '../src/shell.ts';

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

let runCommand: typeof runCommandType;
let runShellCommand: typeof runShellCommandType;
let runParsedCommand: typeof runParsedCommandType;
let parseSimpleCommand: typeof parseSimpleCommandType;
let isMissingCommandError: typeof isMissingCommandErrorType;

describe('shell helpers', () => {
  beforeAll(async () => {
    ({ runCommand, runShellCommand, runParsedCommand, parseSimpleCommand, isMissingCommandError } = await import('../src/shell.ts'));
  });

  afterEach(() => {
    execFileMock.mockReset();
    spawnMock.mockReset();
  });

  it('runCommand returns trimmed stdout', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, '  hello world  \n', '');
    });

    const output = await runCommand('gh', ['--version'], { cwd: '/repo' });
    expect(output).toBe('hello world');
    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      ['--version'],
      { cwd: '/repo' },
      expect.any(Function)
    );
  });

  it('runCommand enriches errors with stdout/stderr', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      const error = Object.assign(new Error('boom'), { code: 'EFAIL' });
      callback(error, 'partial output', 'stderr output');
    });

    await expect(runCommand('gh', ['auth', 'status'], { cwd: '/repo' })).rejects.toMatchObject({
      message: 'boom',
      code: 'EFAIL',
      stdout: 'partial output',
      stderr: 'stderr output',
    });
  });

  it('runShellCommand pipe mode uses shell command execution', async () => {
    execFileMock.mockImplementation((command, args, options, callback) => {
      expect(command).toBe(process.platform === 'win32' ? 'cmd.exe' : 'sh');
      expect(args).toEqual(process.platform === 'win32'
        ? ['/d', '/s', '/c', 'echo ok']
        : ['-lc', 'echo ok']);
      expect(options).toEqual({ cwd: '/repo' });
      callback(null, 'ok\n', '');
    });

    const output = await runShellCommand('echo ok', { cwd: '/repo' });
    expect(output).toBe('ok');
  });

  it('runShellCommand inherit mode uses spawn and resolves on zero exit', async () => {
    let exitHandler: ((code: number | null) => void) | undefined;
    let errorHandler: ((error: Error) => void) | undefined;

    spawnMock.mockImplementation((_command, options) => {
      expect(options).toEqual({
        cwd: '/repo',
        env: undefined,
        stdio: 'inherit',
        shell: true,
      });

      return {
        on(event: string, handler: (value: any) => void) {
          if (event === 'exit') exitHandler = handler as (code: number | null) => void;
          if (event === 'error') errorHandler = handler as (error: Error) => void;
          return this;
        },
      };
    });

    const pending = runShellCommand('npm i -g tool', { cwd: '/repo', stdio: 'inherit' });
    expect(errorHandler).toBeDefined();
    expect(exitHandler).toBeDefined();
    exitHandler?.(0);
    await expect(pending).resolves.toBe('');
  });

  it('runShellCommand inherit mode rejects on non-zero exit', async () => {
    let exitHandler: ((code: number | null) => void) | undefined;

    spawnMock.mockImplementation(() => ({
      on(event: string, handler: (value: any) => void) {
        if (event === 'exit') exitHandler = handler as (code: number | null) => void;
        return this;
      },
    }));

    const pending = runShellCommand('bad command', { cwd: '/repo', stdio: 'inherit' });
    exitHandler?.(2);
    await expect(pending).rejects.toThrow('Command failed with code 2');
  });

  it('parseSimpleCommand rejects shell metacharacters', () => {
    expect(() => parseSimpleCommand('npm i -g @openai/codex && rm -rf /')).toThrow(
      'Command contains shell control characters'
    );
  });

  it('runParsedCommand executes command and args without a shell', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, 'ok\n', '');
    });

    const output = await runParsedCommand(
      { command: 'brew', args: ['install', 'gh'] },
      { cwd: '/repo' }
    );

    expect(output).toBe('ok');
    expect(execFileMock).toHaveBeenCalledWith(
      'brew',
      ['install', 'gh'],
      { cwd: '/repo' },
      expect.any(Function)
    );
  });

  it('isMissingCommandError detects ENOENT only', () => {
    expect(isMissingCommandError(Object.assign(new Error('missing'), { code: 'ENOENT' }))).toBe(true);
    expect(isMissingCommandError(Object.assign(new Error('other'), { code: 'EACCES' }))).toBe(false);
    expect(isMissingCommandError(new Error('plain'))).toBe(false);
    expect(isMissingCommandError(null)).toBe(false);
  });
});
