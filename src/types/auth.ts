/**
 * Bearer token authentication configuration.
 * Automatically reads token from cookies and adds it as an Authorization header.
 */
export interface BearerAuthConfig {
  type: 'bearer';
  /** Cookie name to read the token from (e.g., 'accessToken') */
  tokenCookie: string;
  /** Header name to set (default: 'Authorization') */
  header?: string;
  /** Prefix to use (default: 'Bearer') */
  prefix?: string;
}
