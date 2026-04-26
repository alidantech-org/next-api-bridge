import { cookies } from 'next/headers';
import { parseSetCookieHeader } from './parse-set-cookie';
import { shouldLog } from '../logger/logger';
import { colors } from '../logger/colors';

/**
 * Syncs cookies from the API response to Next.js cookies.
 * Handles both getSetCookie() and fallback manual parsing.
 */
export async function syncResponseCookies({
  response,
  cookieStore,
  cookiePrefix,
  verbose,
}: {
  response: Response;
  cookieStore: Awaited<ReturnType<typeof cookies>>;
  cookiePrefix: string;
  verbose?: string;
}): Promise<void> {
  try {
    // Try to use getSetCookie() if available (modern fetch API - Node.js 18+)
    if (typeof response.headers.getSetCookie === 'function') {
      const setCookieHeaders = response.headers.getSetCookie();
      if (setCookieHeaders && setCookieHeaders.length > 0) {
        for (const cookieString of setCookieHeaders) {
          parseAndSetCookie(cookieString, cookieStore, cookiePrefix, verbose);
        }
        return;
      }
    }

    // Fallback: parse Set-Cookie header manually
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      const cookies = parseSetCookieHeader(setCookieHeader);
      for (const cookie of cookies) {
        const shouldDelete =
          (cookie.maxAge !== undefined && cookie.maxAge <= 0) ||
          (cookie.expires !== undefined && cookie.expires.getTime() < Date.now()) ||
          cookie.value === '' ||
          cookie.value === '""';

        const prefixedCookieName = `${cookiePrefix}${cookie.name}`;

        if (shouldDelete) {
          cookieStore.delete(prefixedCookieName);
          cookieStore.delete(cookie.name);
          if (shouldLog('response', verbose)) {
            console.log(colors.red(`🗑️  [COOKIE DELETE] ${cookie.name} (prefixed: ${prefixedCookieName})`));
          }
        } else {
          const existingCookie = cookieStore.get(prefixedCookieName);
          const isUpdate = existingCookie?.value !== undefined;

          cookieStore.set(prefixedCookieName, cookie.value, {
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite as 'strict' | 'lax' | 'none' | undefined,
            maxAge: cookie.maxAge,
            path: cookie.path,
            domain: cookie.domain,
          });
          cookieStore.delete(cookie.name);

          if (shouldLog('response', verbose)) {
            const action = isUpdate ? '🔄 [COOKIE UPDATE]' : '✅ [COOKIE SET]';
            const details = [
              `name: ${cookie.name}`,
              `value: ${cookie.value.substring(0, 20)}${cookie.value.length > 20 ? '...' : ''}`,
              `prefixed: ${prefixedCookieName}`,
              cookie.httpOnly ? 'httpOnly' : '',
              cookie.secure ? 'secure' : '',
              cookie.sameSite ? `sameSite=${cookie.sameSite}` : '',
              cookie.maxAge ? `maxAge=${cookie.maxAge}s` : '',
              cookie.path ? `path=${cookie.path}` : '',
              cookie.domain ? `domain=${cookie.domain}` : '',
            ]
              .filter(Boolean)
              .join(', ');

            console.log(colors.yellow(`${action} ${details}`));
          }
        }
      }
    }
  } catch (error: any) {
    // Cookies can only be modified in Server Actions or Route Handlers.
    // If we're in a Server Component context, silently skip cookie handling.
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('Cookies can only be modified')) {
      return;
    }
    // Log other cookie-related errors
    console.error(`Warning: Failed to handle cookies: ${errorMessage}`);
  }
}

/**
 * Parses and sets a single cookie from a Set-Cookie header string.
 */
function parseAndSetCookie(
  cookieString: string,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  cookiePrefix: string,
  verbose?: string
): void {
  try {
    const parts = cookieString.split(';').map((p) => p.trim());
    const [nameValue] = parts;
    const [name, ...valueParts] = nameValue.split('=');
    const value = valueParts.join('='); // Handle values that contain "="

    const cookieOptions: any = {};
    let shouldDelete = false;
    let expiresDate: Date | null = null;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      if (part === 'httponly') {
        cookieOptions.httpOnly = true;
      } else if (part === 'secure') {
        cookieOptions.secure = true;
      } else if (part.startsWith('samesite=')) {
        const sameSiteValue = part.split('=')[1];
        if (['strict', 'lax', 'none'].includes(sameSiteValue)) {
          cookieOptions.sameSite = sameSiteValue as 'strict' | 'lax' | 'none';
        }
      } else if (part.startsWith('max-age=')) {
        const maxAge = parseInt(part.split('=')[1], 10);
        if (!isNaN(maxAge)) {
          cookieOptions.maxAge = maxAge;
          if (maxAge <= 0) {
            shouldDelete = true;
          }
        }
      } else if (part.startsWith('path=')) {
        cookieOptions.path = part.split('=')[1];
      } else if (part.startsWith('domain=')) {
        cookieOptions.domain = part.split('=')[1];
      } else if (part.startsWith('expires=')) {
        const expiresValue = parts[i].substring(8);
        try {
          expiresDate = new Date(expiresValue);
          if (expiresDate.getTime() < Date.now()) {
            shouldDelete = true;
          }
        } catch (e) {
          // Invalid date format, ignore
        }
      }
    }

    const cookieName = name.trim();
    const prefixedCookieName = `${cookiePrefix}${cookieName}`;

    if (shouldDelete || value === '' || value === '""') {
      cookieStore.delete(prefixedCookieName);
      cookieStore.delete(cookieName);
      if (shouldLog('response', verbose)) {
        console.log(colors.red(`🗑️  [COOKIE DELETE] ${cookieName} (prefixed: ${prefixedCookieName})`));
      }
    } else {
      const existingCookie = cookieStore.get(prefixedCookieName);
      const isUpdate = existingCookie?.value !== undefined;

      cookieStore.set(prefixedCookieName, value, cookieOptions);
      cookieStore.delete(cookieName);

      if (shouldLog('response', verbose)) {
        const action = isUpdate ? '🔄 [COOKIE UPDATE]' : '✅ [COOKIE SET]';
        const details = [
          `name: ${cookieName}`,
          `value: ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`,
          `prefixed: ${prefixedCookieName}`,
          cookieOptions.httpOnly ? 'httpOnly' : '',
          cookieOptions.secure ? 'secure' : '',
          cookieOptions.sameSite ? `sameSite=${cookieOptions.sameSite}` : '',
          cookieOptions.maxAge ? `maxAge=${cookieOptions.maxAge}s` : '',
          cookieOptions.path ? `path=${cookieOptions.path}` : '',
          cookieOptions.domain ? `domain=${cookieOptions.domain}` : '',
        ]
          .filter(Boolean)
          .join(', ');

        console.log(colors.yellow(`${action} ${details}`));
      }
    }
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('Cookies can only be modified')) {
      return;
    }
    console.error(`Warning: Failed to parse/set cookie: ${errorMessage}`);
  }
}
