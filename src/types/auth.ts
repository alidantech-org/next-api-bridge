export interface BearerAuthConfig {
  type: 'bearer';
  tokenCookie: string;
  header?: string;
  prefix?: string;
}
