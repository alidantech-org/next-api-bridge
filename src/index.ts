import 'server-only';

export { createNextApiBridge } from './create-client';
export { NextApiBridgeClient } from './client';
export { serializeQuery } from './query';

export type {
  ApiBridgeOptions,
  ApiBridgeResponse,
  BearerAuthConfig,
  BridgeLogger,
  CookieOptions,
  CookiePolicyOptions,
  CookieSyncInfo,
  CookieSyncReason,
  FormActionResponse,
  ForwardableRequestHeader,
  NextCacheOptions,
  RequestContextOptions,
  RequestOptions,
  SafeLogEntry,
  TrustProxyConfig,
} from './types';
