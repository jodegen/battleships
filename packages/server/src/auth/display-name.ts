import { registerDecorator, type ValidationOptions } from 'class-validator';

// Anzeigenamen-Regeln (FR-013). v1: 3–20 Zeichen, erlaubte Zeichen + minimale
// projekteigene Blocklist. Eine externe Schimpfwort-Bibliothek bleibt spätere Erweiterung.

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 20;

const ALLOWED = /^[\p{L}\p{N} _.\-]+$/u;
const BLOCKLIST = ['admin', 'fuck', 'shit', 'arsch', 'nazi'];

export function isAllowedDisplayName(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const name = raw.trim();
  if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) return false;
  if (!ALLOWED.test(name)) return false;
  const lower = name.toLowerCase();
  return !BLOCKLIST.some((word) => lower.includes(word));
}

/** class-validator-Dekorator, der `isAllowedDisplayName` durchsetzt. */
export function IsDisplayName(options?: ValidationOptions) {
  return function registerIsDisplayName(object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDisplayName',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          return isAllowedDisplayName(value);
        },
        defaultMessage(): string {
          return `Anzeigename muss ${DISPLAY_NAME_MIN}–${DISPLAY_NAME_MAX} Zeichen lang sein, nur erlaubte Zeichen enthalten und keinen gesperrten Begriff.`;
        },
      },
    });
  };
}
