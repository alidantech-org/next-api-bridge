import type { BearerAuthConfig } from './auth';
import type { CookiePolicyOptions } from './cookies';
import type { SafeLogEntry } from './logging';

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

export interface BridgeLogger {
  debug?(entry: SafeLogEntry): void;
  info?(entry: SafeLogEntry): void;
  warn?(entry: SafeLogEntry): void;
  error?(entry: SafeLogEntry): void;
}

export interface ApiBridgeOptions {
  baseUrl: string;
  cookiePrefix?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  auth?: BearerAuthConfig;
  verbose?: string;
  logger?: BridgeLogger;
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
  cache?: 'no-store' | 'force-cache' | 'only-if-cached';
  isMultipart?: boolean;
  next?: NextCacheOptions;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  operationName?: string;
  responseType?: 'json' | 'text';
}

export interface PrepareRequestResult {
  url: string;
  fetchOptions: RequestInit & { next?: NextCacheOptions };
  requestId?: string;
  cleanupSignal(): void;
  didTimeout(): boolean;
}
