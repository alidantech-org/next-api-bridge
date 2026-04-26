/**
 * Cookie options for setting cookies.
 */
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  path?: string;
  domain?: string;
}

/**
 * Parsed cookie from Set-Cookie header.
 */
export interface ParsedCookie {
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
}
