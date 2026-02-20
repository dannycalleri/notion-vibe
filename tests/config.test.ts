import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, parseArgs, toBool, toNumber } from '../src/config.ts';

describe('config helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parseArgs supports --key value and --key=value forms', () => {
    const args = parseArgs(['--project-dir', '/tmp/app', '--max-concurrent=3']);
    expect(args).toEqual({ 'project-dir': '/tmp/app', 'max-concurrent': '3' });
  });

  it('parseArgs treats standalone flags as true', () => {
    const args = parseArgs(['--dry-run']);
    expect(args).toEqual({ 'dry-run': 'true' });
  });

  it('toNumber returns fallback for non-numeric input', () => {
    expect(toNumber('10', 1)).toBe(10);
    expect(toNumber('nope', 1)).toBe(1);
  });

  it('toBool understands common truthy/falsey strings', () => {
    expect(toBool('true')).toBe(true);
    expect(toBool('yes')).toBe(true);
    expect(toBool('0')).toBe(false);
    expect(toBool('off')).toBe(false);
  });

  it('loadConfig composes defaults, env, and args', () => {
    vi.stubEnv('NOTION_TOKEN', 'env-token');
    vi.stubEnv('POLL_INTERVAL_MS', '15000');
    vi.stubEnv('GH_INSTALL_COMMAND', 'brew install gh');

    const config = loadConfig(['--notion-token', 'arg-token', '--dry-run']);

    expect(config.notionToken).toBe('arg-token');
    expect(config.pollIntervalMs).toBe(15000);
    expect(config.ghInstallCommand).toBe('brew install gh');
    expect(config.dryRun).toBe(true);
    expect(config.statusProperty).toBe('Status');
  });
});
