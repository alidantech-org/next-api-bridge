import { DEFAULT_COOKIE_POLICY } from '../config/constants';
import type { CookieOptions, CookiePolicyOptions, NormalizedCookiePolicy, ParsedCookie } from '../types';

export function normalizeCookiePolicy(policy?: CookiePolicyOptions): NormalizedCookiePolicy {
  return { ...DEFAULT_COOKIE_POLICY, ...policy };
}

export function applyCookiePolicy(
  cookie: ParsedCookie,
  policy: NormalizedCookiePolicy,
  requestIsSecure: boolean,
): CookieOptions {
  const options: CookieOptions = {
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    maxAge: cookie.maxAge,
    priority: cookie.priority,
    partitioned: cookie.partitioned,
  };

  if (policy.preserveExpires) options.expires = cookie.expires;
  if (policy.domain === 'preserve') options.domain = cookie.domain;
  options.path = policy.path === 'preserve' ? cookie.path : '/';
  options.secure = policy.secure === 'preserve' ? cookie.secure : requestIsSecure || cookie.secure === true;

  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as CookieOptions;
}

export function shouldDeleteCookie(cookie: ParsedCookie, now = Date.now()): boolean {
  return cookie.value === '' || cookie.value === '""' || (cookie.maxAge !== undefined && cookie.maxAge <= 0) ||
    (cookie.expires !== undefined && cookie.expires.getTime() <= now);
}
