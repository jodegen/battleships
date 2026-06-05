import type { CookieOptions, Response } from 'express';

import type { AppConfig } from '../config/app-config';

export const SESSION_COOKIE = 'sid';
export const GUEST_COOKIE = 'guest';

function baseOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(config), maxAge: config.sessionTtlMs });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(SESSION_COOKIE, baseOptions(config));
}

export function setGuestCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(GUEST_COOKIE, token, { ...baseOptions(config), maxAge: config.guestTtlMs });
}

export function clearGuestCookie(res: Response, config: AppConfig): void {
  res.clearCookie(GUEST_COOKIE, baseOptions(config));
}
