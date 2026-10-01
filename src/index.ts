import 'server-only';

export { createNextApiBridge } from './create-client';
export { NextApiBridgeClient } from './client';
export { serializeQuery } from './query';

export type {
  ApiBridgeOptions,
  ApiBridgeResponse,
  BearerAuthConfig,
  BridgeLogBodyMode,
  BridgeLogColor,
  BridgeLogFormat,
  BridgeLogInspectOptions,
  BridgeLogLevel,
  BridgeLogPayload,
  BridgeLogger,
  BridgeLoggingOptions,
  BridgeLogRedactOptions,
  BridgeLogSectionOptions,
  CookieOptions,
  CookiePolicyOptions,
  CookieSyncInfo,
  CookieSyncReason,
  FormActionResponse,
  ForwardableRequestHeader,
  NextCacheOptions,
  RequestContextOptions,
  RequestLoggingOptions,
  RequestOptions,
  SafeLogEntry,
  TrustProxyConfig,
} from './types';
