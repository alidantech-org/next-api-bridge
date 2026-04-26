import type { ParsedCookie } from '../types';

/**
 * Parses a Set-Cookie header string into an array of cookie objects.
 * Handles multiple cookies separated by commas with proper parsing.
 */
export function parseSetCookieHeader(setCookieHeader: string): ParsedCookie[] {
  const cookies: ParsedCookie[] = [];

  // Split by comma, but be careful - cookie values can contain commas
  // We'll split on ", " (comma followed by space) which is the standard separator
  // and check if the next part looks like a cookie name (contains "=" before any ";")
  let currentCookie = '';
  const parts = setCookieHeader.split(', ');

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // Check if this part starts a new cookie (has "=" before ";")
    const equalsIndex = part.indexOf('=');
    const semicolonIndex = part.indexOf(';');

    if (equalsIndex !== -1 && (semicolonIndex === -1 || equalsIndex < semicolonIndex)) {
      // This is a new cookie
      if (currentCookie) {
        parseCookieString(currentCookie, cookies);
      }
      currentCookie = part;
    } else {
      // This is a continuation of the current cookie
      currentCookie += ', ' + part;
    }
  }

  // Parse the last cookie
  if (currentCookie) {
    parseCookieString(currentCookie, cookies);
  }

  return cookies;
}

/**
 * Parses a single cookie string into a cookie object.
 */
export function parseSetCookieString(cookieString: string): ParsedCookie {
  const parts = cookieString.split(';').map((p) => p.trim());
  const [nameValue] = parts;
  const equalsIndex = nameValue.indexOf('=');

  if (equalsIndex === -1) {
    throw new Error('Invalid cookie string: no equals sign found');
  }

  const name = nameValue.substring(0, equalsIndex).trim();
  const value = nameValue.substring(equalsIndex + 1).trim();

  const cookie: ParsedCookie = { name, value };

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].toLowerCase();
    if (part === 'httponly') {
      cookie.httpOnly = true;
    } else if (part === 'secure') {
      cookie.secure = true;
    } else if (part.startsWith('samesite=')) {
      cookie.sameSite = part.split('=')[1];
    } else if (part.startsWith('max-age=')) {
      const maxAge = parseInt(part.split('=')[1], 10);
      if (!isNaN(maxAge)) {
        cookie.maxAge = maxAge;
      }
    } else if (part.startsWith('expires=')) {
      const expiresValue = parts[i].substring(8); // Get value after "expires=" (case-sensitive)
      try {
        cookie.expires = new Date(expiresValue);
      } catch (e) {
        // Invalid date format, ignore
      }
    } else if (part.startsWith('path=')) {
      cookie.path = part.split('=')[1];
    } else if (part.startsWith('domain=')) {
      cookie.domain = part.split('=')[1];
    }
  }

  return cookie;
}

/**
 * Internal helper to parse cookie string and push to array.
 */
function parseCookieString(cookieString: string, cookies: ParsedCookie[]): void {
  try {
    const cookie = parseSetCookieString(cookieString);
    cookies.push(cookie);
  } catch (e) {
    // Skip invalid cookies
  }
}
