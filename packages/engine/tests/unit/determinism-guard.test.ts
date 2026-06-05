import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '../../src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('Determinismus-Guard (FR-028)', () => {
  const files = walk(srcDir);

  it('findet Engine-Quelldateien', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('keine src-Datei nutzt Math.random, Date.now oder new Date()', () => {
    const offenders: string[] = [];
    const pattern = /Math\s*\.\s*random|Date\s*\.\s*now|new\s+Date\s*\(/;
    // Kommentare entfernen, damit erläuternde Hinweise (z. B. „kein Math.random") nicht anschlagen.
    const stripComments = (code: string): string =>
      code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const f of files) {
      if (pattern.test(stripComments(readFileSync(f, 'utf8')))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
