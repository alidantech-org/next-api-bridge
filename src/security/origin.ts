export interface ClientOriginValidationOptions {
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
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
  const directOrigin = headers.get('origin');
  if (directOrigin && !/[\r\n]/.test(directOrigin)) {
    try {
      const parsed = new URL(directOrigin);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password) return parsed.origin;
    } catch {
      // Continue with trusted host/proto headers.
    }
  }
  const host = (headers.get('x-forwarded-host') ?? headers.get('host'))?.split(',')[0]?.trim();
  if (!host || /[\r\n/]/.test(host)) return undefined;
  const forwardedProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const protocol = forwardedProto === 'http' || forwardedProto === 'https'
    ? forwardedProto
    : /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host) ? 'http' : 'https';
  return `${protocol}://${host}`;
}
