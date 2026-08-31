import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildFreshBase,
  buildSetupBase,
  createSpinner,
  deployCommandsFor,
  mysqlConnectionStrings,
  originDefaults,
  PERCENT_SETTING_KEYS,
  selectComposeMysqlContainer,
  shellQuote,
} from './index';

describe('setup UI helpers', () => {
  it('updates a TTY spinner on one line and clears it', () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const output = {
      isTTY: true,
      write: (value: string) => {
        writes.push(value);
        return true;
      },
    } as any;
    const stop = createSpinner('読み込み中', output);
    vi.advanceTimersByTime(350);
    stop();
    expect(writes.join('')).toContain('\r読み込み中');
    expect(writes.filter((value) => value.includes('\n'))).toHaveLength(0);
    expect(writes.at(-1)).toContain('\x1b[2K');
    vi.useRealTimers();
  });

  it('uses a plain fallback for non-TTY output', () => {
    const writes: string[] = [];
    const output = {
      isTTY: false,
      write: (value: string) => {
        writes.push(value);
        return true;
      },
    } as any;
    createSpinner('読み込み中', output)();
    expect(writes).toEqual(['読み込み中\n']);
  });

  it('prints safe one-line commands for bundled web and external proxies', () => {
    const commands = deployCommandsFor('/srv/games/fast-world');
    expect(commands.bundledWeb).toContain("cd '/srv/games/fast-world' && docker compose");
    expect(commands.bundledWeb).toContain('up -d &&');
    expect(commands.externalProxy).toContain('up -d app &&');
    for (const command of Object.values(commands)) {
      expect(command).not.toContain('\n');
      expect(command).not.toMatch(/password|pepper|secret/i);
    }
  });
  it('uses common settings without treating .env.example as a value source', () => {
    const values = buildFreshBase(
      new Map([
        ['NEXT_PUBLIC_TURN_CRON', 'common-cron'],
        ['NEXT_PUBLIC_MAP_SIZE', '17'],
        ['NEXT_PUBLIC_MAX_MONEY', '9999999'],
      ])
    );
    expect(values.get('NEXT_PUBLIC_TURN_CRON')).toBe('common-cron');
    expect(values.get('NEXT_PUBLIC_MAP_SIZE')).toBe('17');
    expect(values.get('NEXT_PUBLIC_MAX_MONEY')).toBe('9999999');
    expect(values.get('ONLY_EXAMPLE')).toBeUndefined();
    expect(values.get('NEXT_PUBLIC_ORIGIN_URL')).toBe('https://localhost');
    expect(values.get('DOCKER_NEXT_PUBLIC_ORIGIN_URL')).toBe('https://localhost');
    expect(originDefaults(values.get('NEXT_PUBLIC_ORIGIN_URL')!)).toEqual({
      rpId: 'localhost',
      issuer: 'localhost',
    });
  });
  it('keeps an existing environment Origin during re-setup', () => {
    const existing = new Map([
      ['NEXT_PUBLIC_ORIGIN_URL', 'https://example.com'],
      ['NEXT_PUBLIC_RP_ID', 'example.com'],
      ['ISSUER', 'example.com'],
    ]);
    const values = buildSetupBase(true, existing, new Map());
    expect(values.get('NEXT_PUBLIC_ORIGIN_URL')).toBe('https://example.com');
    expect(values.get('NEXT_PUBLIC_RP_ID')).toBe('example.com');
    expect(values.get('ISSUER')).toBe('example.com');
  });
  it('shell-quotes repository paths containing spaces and metacharacters', () => {
    expect(shellQuote("/srv/Hakoniwa Server/a'b;touch bad")).toBe(
      "'/srv/Hakoniwa Server/a'\"'\"'b;touch bad'"
    );
  });
  it('uses one MySQL host port for local env and the host connection URL', () => {
    expect(mysqlConnectionStrings('hakoniwa', 'user', 'p@ss', 13306)).toEqual({
      host: 'mysql://user:p%40ss@127.0.0.1:13306/hakoniwa',
      docker: 'mysql://user:p%40ss@mysql:3306/hakoniwa',
    });
    expect(mysqlConnectionStrings('hakoniwa', 'user', 'pass', 13307).host).toContain(
      '127.0.0.1:13307'
    );
  });
  it('publishes the same configurable MySQL host port in Compose', async () => {
    const compose = await readFile(
      resolve(import.meta.dirname, '../../docker-compose.yml'),
      'utf8'
    );
    expect(compose).toContain('127.0.0.1:${MYSQL_HOST_PORT:-13306}:3306');
  });
  it('selects only the mysql container belonging to the repository working directory', () => {
    const containers = [
      {
        id: 'other',
        labels: {
          'com.docker.compose.service': 'mysql',
          'com.docker.compose.project.working_dir': '/srv/other',
        },
      },
      {
        id: 'target',
        labels: {
          'com.docker.compose.service': 'mysql',
          'com.docker.compose.project.working_dir': '/srv/hakoniwa',
        },
      },
    ];
    expect(selectComposeMysqlContainer(containers, '/srv/hakoniwa')).toBe('target');
    expect(selectComposeMysqlContainer(containers, '/srv/missing')).toBe('');
  });
  it('derives new-environment RP ID and issuer from Origin', () => {
    expect(originDefaults('https://game.example.com:8443')).toEqual({
      rpId: 'game.example.com',
      issuer: 'game.example.com',
    });
  });
  it('includes attempt, conditional, HEX, and village percentage settings', () => {
    expect(PERCENT_SETTING_KEYS).toEqual([
      'NEXT_PUBLIC_BURIED_TREASURE_RATE',
      'NEXT_PUBLIC_OIL_FIELD_RATE',
      'NEXT_PUBLIC_OIL_EXHAUSTION_RATE',
      'NEXT_PUBLIC_CONTINUOUS_METEORITE_RATE',
      'NEXT_PUBLIC_VILLAGE_APPEARANCE_RATE',
    ]);
  });
});
