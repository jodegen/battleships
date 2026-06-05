import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// FR-018 / SC-006: Der Spielablauf ist vollständig clientseitig — kein Netzwerkzugriff.
const here = dirname(fileURLToPath(import.meta.url));
const roots = [join(here, '../../src'), join(here, '../../app')];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

describe('Offline-Guard (FR-018)', () => {
  it('kein Netzwerkzugriff (fetch/XHR/WebSocket/sendBeacon) im Spielcode', () => {
    const pattern = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|navigator\.sendBeacon|\baxios\b/;
    const stripComments = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const offenders = roots
      .flatMap(walk)
      .filter((f) => pattern.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
