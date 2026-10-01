import {
  DEFAULT_CLIENT_IP_OUTGOING_HEADER,
  DEFAULT_CLIENT_ORIGIN_OUTGOING_HEADER,
  DEFAULT_COOKIE_PREFIX,
  DEFAULT_FORWARD_HEADERS,
  DEFAULT_REQUEST_ID_HEADERS,
  DEFAULT_REQUEST_ID_OUTGOING_HEADER,
} from './constants';
import { normalizeCookiePolicy } from '../cookies/policy';
import {
  assertValidHeaderName,
  isForbiddenRequestHeader,
  isSafeCookiePrefix,
  validateHeaderValue,
} from '../security/headers';
import type {
  ApiBridgeOptions,
  BridgeLogger,
  ForwardableRequestHeader,
  NormalizedCookiePolicy,
  RequestContextOptions,
  TrustProxyConfig,
} from '../types';

export interface NormalizedRequestContextOptions {
  enabled: boolean;
  forwardHeaders: ForwardableRequestHeader[];
  requestId: {
    incomingHeaders: string[];
    outgoingHeader: string;
    generateWhenMissing: boolean;
  };
  clientIp: {
    enabled: boolean;
    trustProxy: TrustProxyConfig;
    outgoingHeader: string;
  };
  clientOrigin: {
    enabled: boolean;
    cookieName?: string;
    allowedHosts: string[];
    allowedOrigins: string[];
    outgoingHeader: string;
  };
}

export interface NormalizedOptions {
  baseUrl: string;
  cookiePrefix: string;
  apiKey?: string;
  apiKeyHeader?: string;
  auth?: ApiBridgeOptions['auth'];
  verbose?: string;
  logger?: BridgeLogger;
  requestContext: NormalizedRequestContextOptions;
  cookiePolicy: NormalizedCookiePolicy;
}

const FORWARDABLE = new Set<ForwardableRequestHeader>([
  'user-agent',
  'accept-language',
  'traceparent',
  'baggage',
]);

function validateOutgoingHeader(name: string, label: string): string {
  const normalized = assertValidHeaderName(name, label);
  if (isForbiddenRequestHeader(normalized)) {
    throw new Error(`next-api-bridge: ${label} "${normalized}" is forbidden`);
  }
  return normalized;
}

function normalizeRequestContext(options?: RequestContextOptions): NormalizedRequestContextOptions {
  const forwardHeaders = options?.forwardHeaders ?? DEFAULT_FORWARD_HEADERS;
  for (const name of forwardHeaders) {
    if (!FORWARDABLE.has(name)) {
      throw new Error(`next-api-bridge: unsupported forwarded header "${String(name)}"`);
    }
  }

  const incomingHeaders = options?.requestId?.incomingHeaders ?? DEFAULT_REQUEST_ID_HEADERS;
  if (!incomingHeaders.length) throw new Error('next-api-bridge: requestId.incomingHeaders must not be empty');
  const normalizedIncoming = incomingHeaders.map((name) => validateOutgoingHeader(name, 'request ID incoming header'));
  const requestIdOutgoing = validateOutgoingHeader(
    options?.requestId?.outgoingHeader ?? DEFAULT_REQUEST_ID_OUTGOING_HEADER,
    'request ID outgoing header',
  );

  let trustProxy = options?.clientIp?.trustProxy ?? false;
  if (typeof trustProxy === 'object') {
    if (!trustProxy.headers?.length) {
      throw new Error('next-api-bridge: custom trustProxy.headers must not be empty');
    }
    const normalizedProxyHeaders = trustProxy.headers.map((name) => {
      const normalized = assertValidHeaderName(name, 'trusted proxy header');
      if (isForbiddenRequestHeader(normalized)) {
        throw new Error(`next-api-bridge: trusted proxy header "${normalized}" is forbidden`);
      }
      return normalized;
    });
    trustProxy = { ...trustProxy, headers: normalizedProxyHeaders };
    if (trustProxy.trustedProxyHops !== undefined &&
      (!Number.isInteger(trustProxy.trustedProxyHops) || trustProxy.trustedProxyHops < 0)) {
      throw new Error('next-api-bridge: trustedProxyHops must be a non-negative integer');
    }
  }

  const clientIpEnabled = options?.clientIp?.enabled ?? false;
  if (clientIpEnabled && trustProxy === false) {
    throw new Error('next-api-bridge: clientIp.trustProxy must be configured when client IP forwarding is enabled');
  }

  const clientOriginEnabled = options?.clientOrigin?.enabled ?? false;
  const clientOriginCookieName = options?.clientOrigin?.cookieName;
  if (clientOriginCookieName && !isSafeCookiePrefix(clientOriginCookieName)) {
    throw new Error('next-api-bridge: clientOrigin.cookieName must be a safe cookie name');
  }
  const allowedHosts = options?.clientOrigin?.allowedHosts ?? [];
  if (allowedHosts.some((host) => !host || /[\r\n/?#]/.test(host))) {
    throw new Error('next-api-bridge: clientOrigin.allowedHosts contains an invalid host');
  }
  const allowedOrigins = options?.clientOrigin?.allowedOrigins ?? [];
  if (clientOriginEnabled && !allowedHosts.length && !allowedOrigins.length) {
    throw new Error('next-api-bridge: clientOrigin requires allowedHosts or allowedOrigins');
  }
  for (const origin of allowedOrigins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('next-api-bridge: clientOrigin.allowedOrigins contains an invalid URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('next-api-bridge: clientOrigin.allowedOrigins must contain origin-only HTTP(S) URLs');
    }
  }

  return {
    enabled: options?.enabled ?? true,
    forwardHeaders: [...forwardHeaders],
    requestId: {
      incomingHeaders: normalizedIncoming,
      outgoingHeader: requestIdOutgoing,
      generateWhenMissing: options?.requestId?.generateWhenMissing ?? true,
    },
    clientIp: {
      enabled: clientIpEnabled,
      trustProxy,
      outgoingHeader: validateOutgoingHeader(
        options?.clientIp?.outgoingHeader ?? DEFAULT_CLIENT_IP_OUTGOING_HEADER,
        'client IP outgoing header',
      ),
    },
    clientOrigin: {
      enabled: clientOriginEnabled,
      cookieName: clientOriginCookieName,
      allowedHosts: [...allowedHosts],
      allowedOrigins: [...allowedOrigins],
      outgoingHeader: validateOutgoingHeader(
        options?.clientOrigin?.outgoingHeader ?? DEFAULT_CLIENT_ORIGIN_OUTGOING_HEADER,
        'client origin outgoing header',
      ),
    },
  };
}

export function validateAndNormalizeOptions(options: ApiBridgeOptions): NormalizedOptions {
  if (!options || typeof options !== 'object') {
    throw new Error('next-api-bridge: options are required');
  }

  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    throw new Error('next-api-bridge: baseUrl must be a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new Error('next-api-bridge: baseUrl must use http or https');
  }
  if (base.username || base.password) {
    throw new Error('next-api-bridge: baseUrl must not contain credentials');
  }
  if (base.search || base.hash) {
    throw new Error('next-api-bridge: baseUrl must not contain a query string or fragment');
  }
  base.pathname = base.pathname.replace(/\/+$/, '') || '/';

  const cookiePrefix = options.cookiePrefix ?? DEFAULT_COOKIE_PREFIX;
  if (!isSafeCookiePrefix(cookiePrefix)) {
    throw new Error('next-api-bridge: cookiePrefix must be a non-empty safe cookie-name prefix');
  }

  if (Boolean(options.apiKey) !== Boolean(options.apiKeyHeader)) {
    throw new Error('next-api-bridge: apiKey and apiKeyHeader must be provided together');
  }
  if (options.apiKey) validateHeaderValue(options.apiKey, 'apiKey');
  const apiKeyHeader = options.apiKeyHeader
    ? validateOutgoingHeader(options.apiKeyHeader, 'API-key header')
    : undefined;

  if (options.auth?.type === 'bearer') {
    if (!options.auth.tokenCookie || !isSafeCookiePrefix(options.auth.tokenCookie)) {
      throw new Error('next-api-bridge: auth.tokenCookie must be a safe cookie name');
    }
    if (options.auth.prefix) validateHeaderValue(options.auth.prefix, 'bearer auth prefix');
    if (options.auth.header) {
      const authHeader = assertValidHeaderName(options.auth.header, 'bearer auth header');
      if (authHeader !== 'authorization' && isForbiddenRequestHeader(authHeader)) {
        throw new Error(`next-api-bridge: bearer auth header "${authHeader}" is forbidden`);
      }
    }
    if (apiKeyHeader && (options.auth.header ?? 'authorization').toLowerCase() === apiKeyHeader) {
      throw new Error('next-api-bridge: API-key and bearer authentication cannot use the same header');
    }
  }

  return {
    baseUrl: base.toString(),
    cookiePrefix,
    apiKey: options.apiKey,
    apiKeyHeader,
    auth: options.auth,
    verbose: options.verbose,
    logger: options.logger,
    requestContext: normalizeRequestContext(options.requestContext),
    cookiePolicy: normalizeCookiePolicy(options.cookiePolicy),
  };
}
