import * as argon2 from 'argon2';

// OWASP-orientierte argon2id-Parameter (research.md §2). Bewusst rechenintensiv.
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MiB
  timeCost: 2,
  parallelism: 1,
};

/** Erzeugt einen argon2id-Hash (inkl. Salt) für ein Klartext-Passwort (FR-006). */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

/** Prüft ein Passwort gegen seinen Hash; liefert bei kaputtem Hash `false` statt zu werfen. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
