import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production Dockerfile', () => {
  it('copies builder source as the node user', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');
    const builder = dockerfile.split('AS builder', 2)[1]?.split(/\nFROM /, 1)[0];

    expect(builder).toBeDefined();
    expect(builder).toContain('COPY --chown=node:node . .');
    expect(builder).not.toMatch(/(?:^|\n)COPY \. \.(?:\n|$)/);
  });
});
