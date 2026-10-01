import { validateHeaderValue } from '../security/headers';

const COOKIE_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function buildBackendCookieHeader(
  allCookies: { name: string; value: string }[],
  cookiePrefix: string,
): string | undefined {
  const backendCookies = allCookies
    .filter((cookie) => cookie.name.startsWith(cookiePrefix))
    .map((cookie) => {
      const name = cookie.name.slice(cookiePrefix.length);
      if (!COOKIE_NAME_PATTERN.test(name)) {
        throw new Error('next-api-bridge: backend cookie name is invalid');
      }
      return `${name}=${validateHeaderValue(cookie.value, `cookie ${name}`)}`;
    });
  return backendCookies.length ? backendCookies.join('; ') : undefined;
}
