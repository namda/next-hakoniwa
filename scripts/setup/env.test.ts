import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProductionEnv, parseEnv, quoteEnv, updateEnv } from './env';

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
  it('loads common values and ignores .env.local when resolving production state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hakoniwa-env-'));
    try {
      await writeFile(join(root, '.env'), 'NEXT_PUBLIC_TITLE=Common\n');
      await writeFile(join(root, '.env.local'), 'NEXT_PUBLIC_RP_ID=development.local\n');
      await writeFile(join(root, '.env.production'), 'NEXT_PUBLIC_TITLE=Production\n');
      await writeFile(
        join(root, '.env.production.local'),
        'NEXT_PUBLIC_ORIGIN_URL=https://example.com\n'
      );
      const values = await loadProductionEnv(root);
      expect(values.get('NEXT_PUBLIC_TITLE')).toBe('Production');
      expect(values.get('NEXT_PUBLIC_RP_ID')).toBeUndefined();
      expect(values.get('NEXT_PUBLIC_ORIGIN_URL')).toBe('https://example.com');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
