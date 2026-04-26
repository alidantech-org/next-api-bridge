/**
 * Builds the Cookie header for outgoing requests.
 * Filters cookies by prefix and removes the prefix before sending to backend.
 */
export function buildBackendCookieHeader(
  allCookies: { name: string; value: string }[],
  cookiePrefix: string
): string | undefined {
  const backendCookies = allCookies
    .filter((cookie) => cookie.name.startsWith(cookiePrefix))
    .map((cookie) => {
      const backendCookieName = cookie.name.substring(cookiePrefix.length);
      return `${backendCookieName}=${cookie.value}`;
    });

  return backendCookies.length > 0 ? backendCookies.join('; ') : undefined;
}
