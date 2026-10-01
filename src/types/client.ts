import type { BearerAuthConfig } from './auth';
import type { CookiePolicyOptions } from './cookies';
import type {
  BridgeLogger,
  BridgeLoggingOptions,
  RequestLoggingOptions,
} from './logging';

export type ForwardableRequestHeader =
  | 'user-agent'
  | 'accept-language'
  | 'traceparent'
  | 'baggage';

export type TrustProxyConfig =
  | false
  | 'vercel'
  | 'cloudflare'
  | {
      headers: string[];
      trustedProxyHops?: number;
    };

export interface RequestContextOptions {
  enabled?: boolean;
  forwardHeaders?: ForwardableRequestHeader[];
  requestId?: {
    incomingHeaders?: string[];
    outgoingHeader?: string;
    generateWhenMissing?: boolean;
  };
  clientIp?: {
    enabled?: boolean;
    trustProxy: TrustProxyConfig;
    outgoingHeader?: string;
  };
  clientOrigin?: {
    enabled?: boolean;
    cookieName?: string;
    allowedHosts?: string[];
    allowedOrigins?: string[];
    outgoingHeader?: string;
  };
}

export interface BridgeCachePolicy {
  /**
   * Cache lifetime in seconds. false keeps the entry until evicted or
   * invalidated explicitly.
   */
  revalidate: number | false;
  /** Additional cache tags. An endpoint-specific tag is added automatically. */
  tags?: string[];
}

export interface BridgeCacheRule extends BridgeCachePolicy {
  /**
   * Endpoint pattern. "*" matches one path segment and "**" matches any
   * remaining path, for example "/reference/**" or "/events/*".
   */
  match: string;
}

export interface BridgeCachingOptions {
  /** Caching stays off unless explicitly enabled. */
  enabled?: boolean;
  /** Optional fallback policy when no rule matches. */
  default?: false | BridgeCachePolicy;
  /** First matching endpoint rule wins. */
  rules?: BridgeCacheRule[];
}

export interface ApiBridgeOptions {
  baseUrl: string;
  cookiePrefix?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  auth?: BearerAuthConfig;
  /** @deprecated Use logging instead. */
  verbose?: string;
  /** @deprecated Use logging.logger instead. */
  logger?: BridgeLogger;
  logging?: BridgeLoggingOptions;
  caching?: BridgeCachingOptions;
  requestContext?: RequestContextOptions;
  cookiePolicy?: CookiePolicyOptions;
}

export interface NextCacheOptions {
  revalidate?: number | false;
  tags?: string[];
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  params?: string[];
  /**
   * High-level bridge cache override. false forces a live backend request.
   * Raw cache/next options remain available as an escape hatch.
   */
  caching?: false | BridgeCachePolicy;
  cache?: 'no-store' | 'force-cache' | 'only-if-cached';
  isMultipart?: boolean;
  next?: NextCacheOptions;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  operationName?: string;
  responseType?: 'json' | 'text';
  logging?: RequestLoggingOptions;
}

export interface ResolvedBridgeCache {
  mode: 'backend' | 'cache';
  revalidate?: number | false;
  tags?: string[];
  source: 'default' | 'rule' | 'request' | 'raw';
}

export interface PrepareRequestResult {
  url: string;
  fetchOptions: RequestInit & { next?: NextCacheOptions };
  requestId?: string;
  cache: ResolvedBridgeCache;
  cleanupSignal(): void;
  didTimeout(): boolean;
}
