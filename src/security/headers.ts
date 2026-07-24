import { SAFE_RESPONSE_HEADERS } from '../config/constants';

const TOKEN_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const CRLF_PATTERN = /[\r\n]/;
const MAX_HEADER_VALUE_LENGTH = 8192;

const FORBIDDEN_EXACT = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'accept-encoding',
  'next-action',
  'next-router-state-tree',
  'next-url',
  'rsc',
]);

const FORBIDDEN_PREFIXES = [
  'x-middleware-',
  'x-nextjs-',
  'sec-fetch-',
  'sec-websocket-',
];

export function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase();
}

export function isValidHeaderName(name: string): boolean {
  return TOKEN_PATTERN.test(name);
}

export function assertValidHeaderName(name: string, label = 'header'): string {
  const normalized = normalizeHeaderName(name);
  if (!normalized || !isValidHeaderName(normalized)) {
    throw new Error(`next-api-bridge: invalid ${label} name`);
  }
  return normalized;
}

export function isForbiddenRequestHeader(name: string): boolean {
  const normalized = normalizeHeaderName(name);
  return FORBIDDEN_EXACT.has(normalized) || FORBIDDEN_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function validateHeaderValue(value: string, name = 'header'): string {
  if (CRLF_PATTERN.test(value)) {
    throw new Error(`next-api-bridge: ${name} value contains prohibited CR/LF characters`);
  }
  if (value.length > MAX_HEADER_VALUE_LENGTH) {
    throw new Error(`next-api-bridge: ${name} value exceeds ${MAX_HEADER_VALUE_LENGTH} characters`);
  }
  return value;
}

export function assertAllowedCustomHeaders(
  headers: Record<string, string> | undefined,
  managedHeaders: Iterable<string> = [],
): Record<string, string> {
  if (!headers) return {};

  const managed = new Set(Array.from(managedHeaders, normalizeHeaderName));
  const result: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    const normalized = assertValidHeaderName(name, 'custom header');
    if (isForbiddenRequestHeader(normalized) || managed.has(normalized)) {
      throw new Error(`next-api-bridge: custom header "${normalized}" is managed or forbidden`);
    }
    result[normalized] = validateHeaderValue(String(value), normalized);
  }

  return result;
}

export function getSafeIncomingHeader(headers: Headers, name: string): string | undefined {
  const normalized = assertValidHeaderName(name, 'incoming header');
  if (isForbiddenRequestHeader(normalized)) return undefined;
  const value = headers.get(normalized);
  if (value === null || value === '') return undefined;
  return validateHeaderValue(value, normalized);
}

export function collectSafeResponseHeaders(headers: Headers): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null && !CRLF_PATTERN.test(value) && value.length <= MAX_HEADER_VALUE_LENGTH) {
      result[name] = value;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

export function isSafeCookiePrefix(prefix: string): boolean {
  return prefix.length > 0 && TOKEN_PATTERN.test(prefix);
}
