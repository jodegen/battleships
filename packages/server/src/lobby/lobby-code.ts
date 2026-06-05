// Reiner, gut lesbarer Lobby-Code-Generator (research.md §6, FR-002).
// Crockford-Base32 ohne mehrdeutige Zeichen (kein I/L/O/U), gruppiert wie `7K3-Q9X`.
// Zufall wird injiziert (kein globaler Zufall) — deterministisch testbar.

// Crockford-Alphabet minus leicht verwechselbarer Zeichen → 30 eindeutige Symbole.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWX';

/** Liefert eine Zufallszahl in [0, 1). Kompatibel zu `Math.random`. */
export type RandomFn = () => number;

export interface LobbyCodeOptions {
  /** Anzahl Symbole gesamt (Default 6 → Raum 30^6 ≈ 729 Mio.). */
  readonly length?: number;
  /** Gruppengröße für die Bindestrich-Formatierung (Default 3 → `XXX-XXX`). */
  readonly groupSize?: number;
}

export function generateLobbyCode(random: RandomFn, options: LobbyCodeOptions = {}): string {
  const length = options.length ?? 6;
  const groupSize = options.groupSize ?? 3;

  const symbols: string[] = [];
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(random() * ALPHABET.length) % ALPHABET.length;
    symbols.push(ALPHABET[idx]);
  }

  if (groupSize <= 0 || groupSize >= length) return symbols.join('');

  const groups: string[] = [];
  for (let i = 0; i < symbols.length; i += groupSize) {
    groups.push(symbols.slice(i, i + groupSize).join(''));
  }
  return groups.join('-');
}

const VALID = new RegExp(`^[${ALPHABET}]+(-[${ALPHABET}]+)*$`);

/** Normalisiert Nutzereingaben (Großschreibung, Leerzeichen entfernt). */
export function normalizeLobbyCode(input: string): string {
  return input.trim().toUpperCase();
}

/** Prüft das Codeformat (nach Normalisierung). Schützt vor offensichtlichem Unsinn (FR-004). */
export function isValidLobbyCode(input: string): boolean {
  const c = normalizeLobbyCode(input);
  return c.length > 0 && c.length <= 16 && VALID.test(c);
}
