// Validiert eingehende Socket-Payloads gegen eine class-validator-DTO-Klasse.
// (WS hat keine globale ValidationPipe wie HTTP — daher explizit, synchron, ohne Netz.)

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

export function validatePayload<T extends object>(
  cls: new () => T,
  raw: unknown,
): { ok: true; value: T } | { ok: false } {
  if (raw === null || typeof raw !== 'object') return { ok: false };
  const instance = plainToInstance(cls, raw, { enableImplicitConversion: false });
  const errors = validateSync(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: true,
  });
  return errors.length === 0 ? { ok: true, value: instance } : { ok: false };
}
