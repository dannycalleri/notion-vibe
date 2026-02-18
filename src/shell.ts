import { execFile, spawn } from 'node:child_process';

export type CommandExecError = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
};

type RunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

type RunShellCommandOptions = RunCommandOptions & {
  stdio?: 'pipe' | 'inherit';
};

export type ParsedCommand = {
  command: string;
  args: string[];
};

const SHELL_CONTROL_CHARS = /[|&;<>()`$\n\r]/;

export async function runCommand(command: string, args: string[], { cwd, env }: RunCommandOptions) {
  return new Promise<string>((resolve, reject) => {
    const options = env ? { cwd, env } : { cwd };
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const err = error as CommandExecError;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function runShellCommand(
  command: string,
  { cwd, env, stdio = 'pipe' }: RunShellCommandOptions
) {
  if (stdio === 'inherit') {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, {
        cwd,
        env,
        stdio: 'inherit',
        shell: true,
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve('');
        else reject(new Error(`Command failed with code ${code}`));
      });
    });
  }

  if (process.platform === 'win32') {
    return runCommand('cmd.exe', ['/d', '/s', '/c', command], { cwd, env });
  }
  return runCommand('sh', ['-lc', command], { cwd, env });
}

export function parseSimpleCommand(command: string): ParsedCommand {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('Command cannot be empty.');
  }
  if (SHELL_CONTROL_CHARS.test(trimmed)) {
    throw new Error(`Command contains shell control characters and is not allowed: ${command}`);
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return {
    command: tokens[0],
    args: tokens.slice(1),
  };
}

export async function runParsedCommand(
  parsed: ParsedCommand,
  { cwd, env, stdio = 'pipe' }: RunShellCommandOptions
) {
  if (stdio === 'inherit') {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(parsed.command, parsed.args, {
        cwd,
        env,
        stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve('');
        else reject(new Error(`Command failed with code ${code}`));
      });
    });
  }
  return runCommand(parsed.command, parsed.args, { cwd, env });
}

export function isMissingCommandError(error: unknown) {
  return typeof error === 'object' && error !== null && (error as CommandExecError).code === 'ENOENT';
}
