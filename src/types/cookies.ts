export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  priority?: 'low' | 'medium' | 'high';
  partitioned?: boolean;
}

export interface ParsedCookie extends CookieOptions {
  name: string;
  value: string;
}

export interface CookiePolicyOptions {
  domain?: 'drop' | 'preserve';
  path?: '/' | 'preserve';
  secure?: 'auto' | 'preserve';
  preserveExpires?: boolean;
  removeLegacyUnprefixedCookies?: boolean;
}

export interface NormalizedCookiePolicy {
  domain: 'drop' | 'preserve';
  path: '/' | 'preserve';
  secure: 'auto' | 'preserve';
  preserveExpires: boolean;
  removeLegacyUnprefixedCookies: boolean;
}
