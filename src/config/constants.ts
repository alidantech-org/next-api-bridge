/**
 * Default cookie prefix for identifying backend cookies.
 * This prefix is used internally in Next.js and removed before sending to the backend.
 */
export const DEFAULT_COOKIE_PREFIX = 'nab_';

/**
 * System query parameters that should be excluded from backend requests.
 * These are used internally by the frontend and should not be forwarded.
 */
export const EXCLUDED_QUERY_PARAMS = ['__auth_retry'] as const;
