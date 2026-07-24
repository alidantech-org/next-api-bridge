import { randomUUID } from 'node:crypto';
import { PACKAGE_VERSION } from '../config/constants';
import type { NormalizedRequestContextOptions } from '../config/validate';
import { getSafeIncomingHeader, validateHeaderValue } from '../security/headers';
import { resolveClientIp } from '../security/ip';
import { deriveClientOrigin, validateClientOrigin } from '../security/origin';

export interface ReadonlyCookieStoreLike {
  get(name: string): { name: string; value: string } | undefined;
}

export interface BuiltRequestContext {
  headers: Record<string, string>;
  requestId?: string;
  requestIsSecure: boolean;
}

function resolveRequestId(incoming: Headers, options: NormalizedRequestContextOptions['requestId']): string | undefined {
  for (const name of options.incomingHeaders) {
    const value = getSafeIncomingHeader(incoming, name);
    if (value) return value.slice(0, 256);
  }
  return options.generateWhenMissing ? randomUUID() : undefined;
}

function isSecureRequest(headers: Headers): boolean {
  const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (proto === 'https') return true;
  if (proto === 'http') return false;
  const origin = headers.get('origin');
  return origin?.startsWith('https://') ?? process.env.NODE_ENV === 'production';
}

export function buildRequestContextHeaders(
  incoming: Headers,
  cookieStore: ReadonlyCookieStoreLike,
  options: NormalizedRequestContextOptions,
): BuiltRequestContext {
  const outgoing: Record<string, string> = {
    'x-api-bridge': `next-api-bridge/${PACKAGE_VERSION}`,
  };
  const requestIsSecure = isSecureRequest(incoming);

  if (!options.enabled) return { headers: outgoing, requestIsSecure };

  for (const name of options.forwardHeaders) {
    const value = getSafeIncomingHeader(incoming, name);
    if (value) outgoing[name] = value;
  }

  const requestId = resolveRequestId(incoming, options.requestId);
  if (requestId) outgoing[options.requestId.outgoingHeader] = validateHeaderValue(requestId, 'request ID');

  if (options.clientIp.enabled) {
    const ip = resolveClientIp(incoming, options.clientIp.trustProxy);
    if (ip) outgoing[options.clientIp.outgoingHeader] = ip;
  }

  if (options.clientOrigin.enabled) {
    const cookieCandidate = options.clientOrigin.cookieName
      ? cookieStore.get(options.clientOrigin.cookieName)?.value
      : undefined;
    const candidate = cookieCandidate ?? deriveClientOrigin(incoming);
    const origin = candidate ? validateClientOrigin(candidate, options.clientOrigin) : undefined;
    if (origin) outgoing[options.clientOrigin.outgoingHeader] = origin;
  }

  return { headers: outgoing, requestId, requestIsSecure };
}
