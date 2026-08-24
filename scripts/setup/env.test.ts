import { describe, expect, it } from 'vitest';
import { parseEnv, quoteEnv, updateEnv } from './env';

describe('env handling', () => {
  it('uses later file values without process.env', () => {
    const merged = new Map([...parseEnv('A=one\n').values, ...parseEnv('A=two\n').values]);
    expect(merged.get('A')).toBe('two');
  });
  it('preserves unknown entries and removes managed duplicates', () => {
    const output = updateEnv(
      parseEnv('A=old\nUNKNOWN=yes\nA=duplicate\n'),
      new Map([['A', 'new value']]),
      new Set(['A'])
    );
    expect(output).toContain('A="new value"');
    expect(output).toContain('UNKNOWN=yes');
    expect(output.match(/^A=/gm)).toHaveLength(1);
  });
  it('round-trips special characters and rejects newlines', () => {
    const encoded = quoteEnv('p# ss$word');
    expect(parseEnv(`A=${encoded}`).values.get('A')).toBe('p# ss$word');
    expect(() => quoteEnv('bad\nvalue')).toThrow();
  });
});
