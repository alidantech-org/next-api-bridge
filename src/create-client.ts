import { NextApiBridgeClient } from './client';
import { DEFAULT_COOKIE_PREFIX } from './config/constants';
import type { ApiBridgeOptions } from './types';

/**
 * Creates a new API bridge client instance.
 * Validates required options and applies defaults.
 */
export function createNextApiBridge(options: ApiBridgeOptions): NextApiBridgeClient {
  if (!options.baseUrl) {
    throw new Error('next-api-bridge: baseUrl is required');
  }

  return new NextApiBridgeClient({
    cookiePrefix: DEFAULT_COOKIE_PREFIX,
    ...options,
  });
}
