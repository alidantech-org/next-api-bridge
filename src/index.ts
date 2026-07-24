import 'server-only';

export { createNextApiBridge } from './create-client';
export { NextApiBridgeClient } from './client';
export { serializeQuery } from './query';

export type {
  ApiBridgeOptions,
  RequestOptions,
  ApiBridgeResponse,
  FormActionResponse,
  CookieOptions,
  BearerAuthConfig,
} from './types/index';
