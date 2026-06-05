import { describe, expect, it } from 'vitest';

import {
  generateLobbyCode,
  isValidLobbyCode,
  normalizeLobbyCode,
  type RandomFn,
} from '../../src/lobby/lobby-code';

// Deterministischer „Zufall": liefert eine feste Folge in [0,1).
function seq(values: number[]): RandomFn {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('generateLobbyCode (FR-002)', () => {
  it('ist deterministisch bei gegebener Zufallsquelle und formatiert mit Bindestrich', () => {
    const code = generateLobbyCode(seq([0, 0, 0, 0, 0, 0]));
    expect(code).toBe('000-000');
  });

  it('nutzt nur das ambiguitätsfreie Alphabet (kein I/L/O/U)', () => {
    const code = generateLobbyCode(seq([0.5, 0.99, 0.33, 0.1, 0.7, 0.86]));
    expect(code).toMatch(/^[0-9A-HJKMNPQRSTVWX]{3}-[0-9A-HJKMNPQRSTVWX]{3}$/);
    expect(code).not.toMatch(/[ILOU]/);
  });

  it('respektiert length/groupSize', () => {
    expect(generateLobbyCode(seq([0]), { length: 4, groupSize: 0 })).toBe('0000');
    expect(generateLobbyCode(seq([0]), { length: 8, groupSize: 4 })).toBe('0000-0000');
  });
});

describe('isValidLobbyCode / normalizeLobbyCode (FR-004)', () => {
  it('normalisiert Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(normalizeLobbyCode('  7k3-q9x ')).toBe('7K3-Q9X');
  });
  it('akzeptiert gültige, lehnt ungültige Codes ab', () => {
    expect(isValidLobbyCode('7K3-Q9X')).toBe(true);
    expect(isValidLobbyCode('abc-def')).toBe(true); // wird hochgesetzt
    expect(isValidLobbyCode('7I1-O0L')).toBe(false); // mehrdeutige Zeichen
    expect(isValidLobbyCode('')).toBe(false);
    expect(isValidLobbyCode('!!!')).toBe(false);
  });
});
