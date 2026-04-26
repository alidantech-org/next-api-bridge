/**
 * Authentication Utility Functions
 * This file contains utility functions for authentication operations
 *
 * @module Auth Utils
 * @description Utility functions for authentication operations
 */

/**
 * Validates and sanitizes a redirect path to prevent open redirects
 * @param {string} redirectPath - The path to validate
 * @returns {string} A safe redirect path (defaults to "/")
 */
export function validateRedirectPath(redirectPath?: string): string {
  if (!redirectPath) return '/';

  // Remove any leading/trailing whitespace
  const trimmedPath = redirectPath.trim();

  // Only allow paths that start with / (same-origin redirects)
  if (!trimmedPath.startsWith('/')) return '/';

  // Split path and query string
  const [pathname, queryString] = trimmedPath.split('?');

  // Validate pathname (must start with / and not contain protocol)
  if (!pathname || pathname.includes('://') || pathname.includes('//')) return '/';

  // Build safe path
  let safePath = pathname;

  // Append query string if present
  if (queryString) {
    safePath += `?${queryString}`;
  }

  return safePath;
}

/**
 * Builds a URL with search parameters
 * @param {string} baseUrl - The base URL
 * @param {Record<string, string>} params - Search parameters to add
 * @returns {string} The complete URL with parameters
 */
export function buildUrlWithParams(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl, 'http://localhost'); // Dummy base for URL parsing

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  // Return only the pathname and search
  return url.pathname + url.search;
}
