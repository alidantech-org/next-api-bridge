import 'server-only';
import { cookies, headers } from 'next/headers';
import type { ApiBridgeOptions, RequestOptions, ApiBridgeResponse, PrepareRequestResult, CookieOptions } from './types';
import { EXCLUDED_QUERY_PARAMS } from './config/constants';
import { buildBackendCookieHeader } from './cookies/build-cookie-header';
import { syncResponseCookies } from './cookies/sync-response-cookies';
import { log, shouldLog } from './logger/logger';
import { colors } from './logger/colors';

/**
 * Normalized options with defaults applied.
 */
interface NormalizedOptions extends Required<Omit<ApiBridgeOptions, 'auth' | 'apiKey' | 'apiKeyHeader' | 'verbose'>> {
  auth?: ApiBridgeOptions['auth'];
  apiKey?: ApiBridgeOptions['apiKey'];
  apiKeyHeader?: ApiBridgeOptions['apiKeyHeader'];
  verbose?: ApiBridgeOptions['verbose'];
}

/**
 * Next.js API Bridge Client.
 * Provides cookie-aware HTTP requests to external backend APIs.
 */
export class NextApiBridgeClient {
  constructor(private readonly options: NormalizedOptions) {}

  /**
   * Sends an HTTP request to the backend server.
   */
  private async request<T>(method: string, path: string, body: any = {}, options: RequestOptions = {}): Promise<ApiBridgeResponse<T>> {
    const cookieStore = await cookies();
    const { query = {}, params = [], cache = 'no-store', isMultipart = false } = options;

    try {
      const { url, fetchOptions } = await this.prepareRequest(method, path, body, query, params, cache, isMultipart, cookieStore);

      if (shouldLog('request', this.options.verbose)) {
        console.log(colors.blue(`🚀 [REQUEST] ${method.toUpperCase()} ${url}`));
        console.log(colors.blue(`📋 [HEADERS] ${JSON.stringify(fetchOptions.headers, null, 2)}`));
      }

      if (shouldLog('body', this.options.verbose) && body && Object.keys(body).length > 0) {
        console.log(colors.magenta(`📦 [REQUEST BODY] ${JSON.stringify(body, null, 2)}`));
      }

      const response = await fetch(url, fetchOptions);

      await syncResponseCookies({
        response,
        cookieStore,
        cookiePrefix: this.options.cookiePrefix,
        verbose: this.options.verbose,
      });

      if (shouldLog('response', this.options.verbose)) {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        console.log(colors.cyan(`📨 [RESPONSE HEADERS] ${JSON.stringify(headers, null, 2)}`));

        const setCookieHeaders = response.headers.getSetCookie?.() || [];
        if (setCookieHeaders.length > 0) {
          console.log(colors.yellow(`🍪 [RESPONSE COOKIES] Found ${setCookieHeaders.length} cookie(s) in response`));
          setCookieHeaders.forEach((cookieHeader, index) => {
            console.log(colors.yellow(`   Cookie ${index + 1}: ${cookieHeader}`));
          });
        }
      }

      const result = await this.parseResponse<T>(response, url, method);

      if (shouldLog('response', this.options.verbose) && result.body) {
        console.log(colors.green(`📨 [RESPONSE BODY] ${JSON.stringify(result.body, null, 2)}`));
      }

      if (process.env.NODE_ENV === 'development' && result.message) {
        console.log(colors.blue(`💬 [RESPONSE MESSAGE] ${result.message}`));
      }

      return result;
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      log(`Error on ${method.toUpperCase()} ${path}: ${errorMessage}`, undefined, false);
      return { message: errorMessage, success: false, body: null };
    }
  }

  /**
   * Gets the client's full URL from headers.
   */
  private async getClientHost(cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<string> {
    const headersList = await headers();

    const clientUrlCookie = cookieStore.get('client_url')?.value;
    if (clientUrlCookie) {
      log(`🔍 [Client URL] Detected from middleware cookie: ${clientUrlCookie}`, undefined, true);
      return clientUrlCookie;
    }

    const host = headersList.get('host');
    if (!host) {
      throw new Error('No host header found in request');
    }

    const forwardedProto = headersList.get('x-forwarded-proto');
    let protocol = 'http';
    if (forwardedProto && ['http', 'https'].includes(forwardedProto)) {
      protocol = forwardedProto;
    } else {
      protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    }

    const fullUrl = `${protocol}://${host}`;
    log(`🔍 [Client URL] Detected from headers: ${fullUrl}`, undefined, true);
    return fullUrl;
  }

  /**
   * Prepares the request by building URL and fetch options.
   */
  private async prepareRequest(
    method: string,
    path: string,
    body: any,
    query: Record<string, unknown>,
    params: string[],
    cache: 'no-store' | 'force-cache' | 'only-if-cached',
    isMultipart: boolean,
    cookieStore: Awaited<ReturnType<typeof cookies>>,
  ): Promise<PrepareRequestResult> {
    let url = `${this.options.baseUrl}${path}`;

    if (params && params.length) {
      url += `/${params.join('/')}`;
    }

    if (query && Object.keys(query).length) {
      const queryPairs = Object.entries(query)
        .filter(([key]) => !EXCLUDED_QUERY_PARAMS.includes(key as any))
        .map(([key, value]) => {
          const stringValue = String(value);
          if (stringValue.includes(',')) {
            return `${key}=${stringValue}`;
          }
          return `${key}=${encodeURIComponent(stringValue)}`;
        });
      const queryString = queryPairs.join('&');
      url += `?${queryString}`;
    }

    const allCookies = cookieStore.getAll();
    const headers: Record<string, string> = {
      'Cache-Control': cache,
    };

    const clientUrl = await this.getClientHost(cookieStore);
    headers['x-client-url'] = clientUrl;

    const cookieHeader = buildBackendCookieHeader(allCookies, this.options.cookiePrefix);
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    if (!isMultipart && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    if (this.options.apiKey && this.options.apiKeyHeader) {
      headers[this.options.apiKeyHeader] = this.options.apiKey;
    }

    // Bearer token authentication
    if (this.options.auth?.type === 'bearer') {
      const token = await this.getCookie(this.options.auth.tokenCookie);
      if (token) {
        const header = this.options.auth.header ?? 'Authorization';
        const prefix = this.options.auth.prefix ?? 'Bearer';
        headers[header] = `${prefix} ${token}`;
      }
    }

    const fetchOptions: RequestInit = {
      method,
      cache: 'no-store',
      headers,
      body: method === 'GET' ? undefined : isMultipart ? body : JSON.stringify(body ?? {}),
      credentials: 'include',
    };

    return { url, fetchOptions };
  }

  /**
   * Parses the response and returns a standardized response object.
   */
  private async parseResponse<T>(response: Response, url: string, method: string): Promise<ApiBridgeResponse<T>> {
    const responseStatus = response.status;
    const isSuccess = response.ok;
    log(`${method.toUpperCase()} ${url}`, responseStatus, isSuccess);

    let responseData = null;
    try {
      responseData = await response.json();
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      log(`Error parsing JSON from ${url}: ${errorMessage}`);
    }

    const success = responseData?.success ?? response.ok;
    const message = responseData?.message || response.statusText;

    if (responseData?.success) {
      delete responseData.success;
    }
    if (responseData?.message) {
      delete responseData.message;
    }

    return {
      message: message,
      success: success,
      body: responseData ?? null,
      headers: response.headers,
    };
  }

  /**
   * Sends a GET request.
   */
  async get<T>(path: string, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('GET', path, {}, options);
  }

  /**
   * Sends a POST request.
   */
  async post<T>(path: string, body?: any, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('POST', path, body ?? {}, options);
  }

  /**
   * Sends a PATCH request.
   */
  async patch<T>(path: string, body?: any, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('PATCH', path, body ?? {}, options);
  }

  /**
   * Sends a PUT request.
   */
  async put<T>(path: string, body?: any, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('PUT', path, body ?? {}, options);
  }

  /**
   * Sends a DELETE request.
   */
  async delete<T>(path: string, body?: any, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('DELETE', path, body ?? {}, options);
  }

  /**
   * Sets a cookie that will be sent to the backend.
   */
  async setCookie(name: string, value: string, options?: CookieOptions): Promise<void> {
    const cookieStore = await cookies();
    const prefixedName = `${this.options.cookiePrefix}${name}`;

    try {
      cookieStore.set(prefixedName, value, {
        httpOnly: options?.httpOnly,
        secure: options?.secure,
        sameSite: options?.sameSite,
        maxAge: options?.maxAge,
        path: options?.path,
        domain: options?.domain,
      });

      cookieStore.delete(name);
      log(`Set cookie: ${prefixedName} (backend: ${name})`, undefined, true);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('Cookies can only be modified')) {
        return;
      }
      log(`Warning: Failed to set cookie: ${errorMessage}`, undefined, false);
    }
  }

  /**
   * Gets a cookie value by name.
   */
  async getCookie(name: string): Promise<string | undefined> {
    const cookieStore = await cookies();
    const prefixedName = `${this.options.cookiePrefix}${name}`;

    const prefixedCookie = cookieStore.get(prefixedName);
    if (prefixedCookie?.value) {
      return prefixedCookie.value;
    }

    const cookie = cookieStore.get(name);
    return cookie?.value;
  }

  /**
   * Deletes cookies.
   */
  async deleteCookies(cookieNames?: string[]): Promise<void> {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    let deletedCount = 0;

    if (cookieNames && cookieNames.length > 0) {
      for (const cookieName of cookieNames) {
        const prefixedName = `${this.options.cookiePrefix}${cookieName}`;
        cookieStore.delete(prefixedName);
        cookieStore.delete(cookieName);
        deletedCount++;
      }
    } else {
      for (const cookie of allCookies) {
        if (cookie.name.startsWith(this.options.cookiePrefix)) {
          cookieStore.delete(cookie.name);
          deletedCount++;
        }
      }
    }

    log(`Deleted ${deletedCount} cookie(s)`, undefined, true);
  }
}
