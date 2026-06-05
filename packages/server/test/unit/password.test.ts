import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../../src/auth/password';

describe('password hashing (argon2id)', () => {
  it('Hash unterscheidet sich vom Klartext und sieht wie ein argon2id-Hash aus', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toContain('correct horse battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verify ist true für das richtige Passwort', async () => {
    const hash = await hashPassword('s3cret-passphrase');
    expect(await verifyPassword(hash, 's3cret-passphrase')).toBe(true);
  });

  it('verify ist false für ein falsches Passwort', async () => {
    const hash = await hashPassword('s3cret-passphrase');
    expect(await verifyPassword(hash, 'wrong-passphrase')).toBe(false);
  });

  it('verify ist false (statt Fehler) bei kaputtem Hash', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever')).toBe(false);
  });

  it('zwei Hashes desselben Passworts unterscheiden sich (Salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });
});
