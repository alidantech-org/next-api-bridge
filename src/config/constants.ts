import type { ForwardableRequestHeader, NormalizedCookiePolicy } from '../types';

export const PACKAGE_VERSION = '0.1.7';
export const DEFAULT_COOKIE_PREFIX = 'nab_';
export const EXCLUDED_QUERY_PARAMS = ['__auth_retry'] as const;
export const DEFAULT_FORWARD_HEADERS: ForwardableRequestHeader[] = [
  'user-agent',
  'accept-language',
  'traceparent',
];
export const DEFAULT_REQUEST_ID_HEADERS = ['x-request-id'];
export const DEFAULT_REQUEST_ID_OUTGOING_HEADER = 'x-request-id';
export const DEFAULT_CLIENT_IP_OUTGOING_HEADER = 'x-client-ip';
export const DEFAULT_CLIENT_ORIGIN_OUTGOING_HEADER = 'x-client-origin';
export const SAFE_RESPONSE_HEADERS = new Set([
  'x-request-id',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
]);
export const DEFAULT_COOKIE_POLICY: NormalizedCookiePolicy = {
  domain: 'drop',
  path: '/',
  secure: 'auto',
  preserveExpires: true,
  removeLegacyUnprefixedCookies: false,
};
