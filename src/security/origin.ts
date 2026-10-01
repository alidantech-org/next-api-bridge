export interface ClientOriginValidationOptions {
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function getForwardedParameter(value: string | null, parameter: 'host' | 'proto'): string | undefined {
  const firstValue = firstHeaderValue(value);
  if (!firstValue || /[\r\n]/.test(firstValue)) return undefined;

  for (const part of firstValue.split(';')) {
    const [rawKey, ...rawValueParts] = part.split('=');
    if (rawKey?.trim().toLowerCase() !== parameter) continue;
    const candidate = rawValueParts.join('=').trim().replace(/^["']|["']$/g, '');
    return candidate && !/[\r\n]/.test(candidate) ? candidate : undefined;
  }

  return undefined;
}

function normalizeDerivedHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = value.trim().replace(/^["']|["']$/g, '');
  if (!candidate || candidate.includes('://') || /[\\/?#\s]/u.test(candidate)) return undefined;

  try {
    const parsed = new URL(`http://${candidate}`);
    if (!parsed.host || parsed.username || parsed.password) return undefined;
    return parsed.host.toLowerCase().replace(/\.$/u, '');
  } catch {
    return undefined;
  }
}

export function validateClientOrigin(
  value: string,
  options: ClientOriginValidationOptions,
): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return undefined;
  if (url.username || url.password) return undefined;
  if (url.pathname !== '/' || url.search || url.hash) return undefined;

  const origin = url.origin;
  const allowedOrigins = new Set((options.allowedOrigins ?? []).map((item) => {
    try {
      return new URL(item).origin;
    } catch {
      return '';
    }
  }).filter(Boolean));
  const allowedHosts = new Set((options.allowedHosts ?? []).map(normalizeHost));

  if (allowedOrigins.has(origin)) return origin;
  if (allowedHosts.has(normalizeHost(url.host)) || allowedHosts.has(normalizeHost(url.hostname))) return origin;
  return undefined;
}

export function deriveClientOrigin(headers: Headers): string | undefined {
  const forwardedHost = normalizeDerivedHost(firstHeaderValue(headers.get('x-forwarded-host')));
  const standardForwardedHost = normalizeDerivedHost(getForwardedParameter(headers.get('forwarded'), 'host'));
  const directHost = normalizeDerivedHost(firstHeaderValue(headers.get('host')));
  const host = forwardedHost ?? standardForwardedHost ?? directHost;

  if (host) {
    const forwardedProto = firstHeaderValue(headers.get('x-forwarded-proto'))?.toLowerCase();
    const standardForwardedProto = getForwardedParameter(headers.get('forwarded'), 'proto')?.toLowerCase();
    const protocolCandidate = forwardedProto ?? standardForwardedProto;
    const protocol = protocolCandidate === 'http' || protocolCandidate === 'https'
      ? protocolCandidate
      : /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host) ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  const directOrigin = headers.get('origin');
  if (directOrigin && !/[\r\n]/.test(directOrigin)) {
    try {
      const parsed = new URL(directOrigin);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password) {
        return parsed.origin;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}
