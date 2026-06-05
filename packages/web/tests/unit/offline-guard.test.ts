import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Der SPIELABLAUF bleibt vollständig clientseitig (002, FR-001/018): kein Netzwerkzugriff im
// Spielcode. Ausnahme ab Feature 003 (Identität & Persistenz): der Netzwerkzugriff ist auf die
// einzige, explizite API-Grenze `src/api/` beschränkt (Auth/Stats). Alles andere bleibt offline.
const here = dirname(fileURLToPath(import.meta.url));
const roots = [join(here, '../../src'), join(here, '../../app')];

// Bewusste Netzwerk-Grenze (Feature 003): hier ist `fetch` erlaubt.
const ALLOWED = [join('src', 'api')];

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
      .filter((f) => !ALLOWED.some((allowed) => f.includes(allowed)))
      .filter((f) => pattern.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
