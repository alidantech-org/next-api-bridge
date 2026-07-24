import type { ParsedCookie } from '../types';

const COOKIE_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function splitSetCookieHeader(header: string): string[] {
  return header
    .split(/,(?=\s*[^;,\s]+=)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseSetCookieHeader(header: string): ParsedCookie[] {
  const cookies: ParsedCookie[] = [];
  for (const value of splitSetCookieHeader(header)) {
    try {
      cookies.push(parseSetCookieString(value));
    } catch {
      // Invalid cookies are reported by the synchronization result.
    }
  }
  return cookies;
}

export function parseSetCookieString(cookieString: string): ParsedCookie {
  const parts = cookieString.split(';').map((part) => part.trim());
  const first = parts.shift();
  if (!first) throw new Error('Invalid Set-Cookie header');
  const equalsIndex = first.indexOf('=');
  if (equalsIndex <= 0) throw new Error('Invalid Set-Cookie name/value');

  const name = first.slice(0, equalsIndex).trim();
  const value = first.slice(equalsIndex + 1).trim();
  if (!COOKIE_NAME_PATTERN.test(name) || /[\r\n]/.test(value)) {
    throw new Error('Invalid Set-Cookie value');
  }

  const cookie: ParsedCookie = { name, value };

  for (const rawPart of parts) {
    const separator = rawPart.indexOf('=');
    const rawName = separator === -1 ? rawPart : rawPart.slice(0, separator);
    const rawValue = separator === -1 ? '' : rawPart.slice(separator + 1);
    const attribute = rawName.trim().toLowerCase();
    const attributeValue = rawValue.trim();

    if (attribute === 'httponly') cookie.httpOnly = true;
    else if (attribute === 'secure') cookie.secure = true;
    else if (attribute === 'partitioned') cookie.partitioned = true;
    else if (attribute === 'samesite') {
      const valueLower = attributeValue.toLowerCase();
      if (valueLower === 'strict' || valueLower === 'lax' || valueLower === 'none') cookie.sameSite = valueLower;
    } else if (attribute === 'max-age') {
      const valueNumber = Number.parseInt(attributeValue, 10);
      if (Number.isFinite(valueNumber)) cookie.maxAge = valueNumber;
    } else if (attribute === 'expires') {
      const date = new Date(attributeValue);
      if (!Number.isNaN(date.getTime())) cookie.expires = date;
    } else if (attribute === 'path') cookie.path = attributeValue;
    else if (attribute === 'domain') cookie.domain = attributeValue;
    else if (attribute === 'priority') {
      const priority = attributeValue.toLowerCase();
      if (priority === 'low' || priority === 'medium' || priority === 'high') cookie.priority = priority;
    }
  }

  return cookie;
}
