import type { CookieOptions, CookieSyncInfo, NormalizedCookiePolicy, ParsedCookie } from '../types';
import { applyCookiePolicy, shouldDeleteCookie } from './policy';
import { parseSetCookieHeader, parseSetCookieString } from './parse-set-cookie';

export interface CookieStoreLike {
  get(name: string): { name: string; value: string } | undefined;
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: CookieOptions): unknown;
  delete(name: string): unknown;
}

function getSetCookieValues(headers: Headers): { values: string[]; invalid: boolean } {
  const enhanced = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof enhanced.getSetCookie === 'function') {
    const values = enhanced.getSetCookie();
    return { values, invalid: false };
  }
  const combined = headers.get('set-cookie');
  return combined ? { values: [combined], invalid: false } : { values: [], invalid: false };
}

function parseCookies(values: string[]): { cookies: ParsedCookie[]; invalid: boolean } {
  const cookies: ParsedCookie[] = [];
  let invalid = false;
  for (const value of values) {
    if (value.includes(',') && !value.includes('\n')) {
      const parsed = parseSetCookieHeader(value);
      if (!parsed.length) invalid = true;
      cookies.push(...parsed);
      continue;
    }
    try {
      cookies.push(parseSetCookieString(value));
    } catch {
      invalid = true;
    }
  }
  return { cookies, invalid };
}

function isReadOnlyCookieError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Cookies can only be modified') || message.includes('cookie') && message.includes('Server Action');
}

export async function syncResponseCookies({
  response,
  cookieStore,
  cookiePrefix,
  cookiePolicy,
  requestIsSecure,
}: {
  response: Response;
  cookieStore: CookieStoreLike;
  cookiePrefix: string;
  cookiePolicy: NormalizedCookiePolicy;
  requestIsSecure: boolean;
}): Promise<CookieSyncInfo> {
  const { values } = getSetCookieValues(response.headers);
  if (!values.length) return { attempted: false, applied: false, reason: 'no-set-cookie' };

  const { cookies, invalid } = parseCookies(values);
  if (!cookies.length) return { attempted: true, applied: false, reason: 'invalid-cookie' };

  try {
    for (const cookie of cookies) {
      const prefixedName = `${cookiePrefix}${cookie.name}`;
      const options = applyCookiePolicy(cookie, cookiePolicy, requestIsSecure);
      if (shouldDeleteCookie(cookie)) {
        cookieStore.set(prefixedName, '', { ...options, maxAge: 0, expires: new Date(0) });
      } else {
        cookieStore.set(prefixedName, cookie.value, options);
      }
      if (cookiePolicy.removeLegacyUnprefixedCookies) cookieStore.delete(cookie.name);
    }
    return { attempted: true, applied: true, reason: 'applied' };
  } catch (error) {
    if (isReadOnlyCookieError(error)) {
      return { attempted: true, applied: false, reason: 'read-only-context' };
    }
    return { attempted: true, applied: false, reason: invalid ? 'invalid-cookie' : 'invalid-cookie' };
  }
}
