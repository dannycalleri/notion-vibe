import { describe, expect, it } from 'vitest';
import {
  parseAllowlistedCodexInstallCommand,
  parseAllowlistedGhInstallCommand,
} from '../src/install-command.ts';

describe('install command allowlists', () => {
  it('accepts allowed codex install command', () => {
    expect(parseAllowlistedCodexInstallCommand('npm i -g @openai/codex')).toEqual({
      command: 'npm',
      args: ['i', '-g', '@openai/codex'],
    });
  });

  it('rejects non-allowlisted codex install command', () => {
    expect(() => parseAllowlistedCodexInstallCommand('npm i -g @evil/pkg')).toThrow(
      'CODEX_INSTALL_COMMAND is not allowlisted'
    );
  });

  it('accepts allowed gh install command', () => {
    expect(parseAllowlistedGhInstallCommand('brew install gh')).toEqual({
      command: 'brew',
      args: ['install', 'gh'],
    });
  });

  it('rejects shell metacharacters in gh install command', () => {
    expect(() => parseAllowlistedGhInstallCommand('brew install gh && curl bad')).toThrow(
      'Command contains shell control characters'
    );
  });
});
