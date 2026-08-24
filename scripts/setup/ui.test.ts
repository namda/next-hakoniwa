import { describe, expect, it, vi } from 'vitest';
import { createSpinner, deployCommandFor } from './index';

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

  it('prints environment-specific one-line deploy commands', () => {
    const command = deployCommandFor('~/next-hakoniwa-dev1');
    expect(command).toContain('cd ~/next-hakoniwa-dev1 && docker compose');
    expect(command).not.toContain('\n');
    expect(command).not.toMatch(/password|pepper|secret/i);
  });
});
