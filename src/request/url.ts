import { EXCLUDED_QUERY_PARAMS } from '../config/constants';
import { serializeQuery } from '../query';

export function buildRequestUrl(
  baseUrl: string,
  path: string,
  params: string[] = [],
  query: Record<string, unknown> = {},
): string {
  if (/[?#]/.test(path)) {
    throw new Error('next-api-bridge: request path must not contain a query string or fragment');
  }

  const url = new URL(baseUrl);
  const baseSegments = url.pathname.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);
  const encodedParams = params.map((param) => encodeURIComponent(String(param)));
  url.pathname = `/${[...baseSegments, ...pathSegments, ...encodedParams].join('/')}`;

  const queryString = serializeQuery(query, EXCLUDED_QUERY_PARAMS);
  url.search = queryString;
  url.hash = '';
  return url.toString();
}
