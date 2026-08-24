import { describe, expect, it, vi } from 'vitest';
import { createSpinner, deployCommandFor, originDefaults, PERCENT_SETTING_KEYS } from './index';

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

  it('uses the actual repository root in one-line deploy commands', () => {
    const command = deployCommandFor('/srv/games/fast-world');
    expect(command).toContain('cd /srv/games/fast-world && docker compose');
    expect(command).not.toContain('\n');
    expect(command).not.toMatch(/password|pepper|secret/i);
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
