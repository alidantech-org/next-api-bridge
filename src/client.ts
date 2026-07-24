import 'server-only';
import { cookies, headers as nextHeaders } from 'next/headers';
import type { ApiBridgeResponse, CookieOptions, RequestOptions } from './types';
import type { NormalizedOptions } from './config/validate';
import type { CookieStoreLike } from './cookies/sync-response-cookies';
import { executeBridgeRequest } from './request/execute';
import { isSafeCookiePrefix, validateHeaderValue } from './security/headers';

export class NextApiBridgeClient {
  constructor(private readonly options: NormalizedOptions) {}

  private async request<T>(
    method: string,
    path: string,
    body: unknown = undefined,
    options: RequestOptions = {},
  ): Promise<ApiBridgeResponse<T>> {
    const cookieStore = await cookies() as unknown as CookieStoreLike;
    const incomingHeaders = await nextHeaders();
    return executeBridgeRequest<T>({
      normalizedOptions: this.options,
      method,
      path,
      body,
      requestOptions: options,
      cookieStore,
      incomingHeaders,
    });
  }

  async get<T>(path: string, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  async delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiBridgeResponse<T>> {
    return this.request<T>('DELETE', path, body, options);
  }

  async setCookie(name: string, value: string, options?: CookieOptions): Promise<void> {
    if (!isSafeCookiePrefix(name)) throw new Error('next-api-bridge: cookie name is invalid');
    validateHeaderValue(value, `cookie ${name}`);
    const cookieStore = await cookies();
    cookieStore.set(`${this.options.cookiePrefix}${name}`, value, options);
    if (this.options.cookiePolicy.removeLegacyUnprefixedCookies) cookieStore.delete(name);
  }

  async getCookie(name: string): Promise<string | undefined> {
    if (!isSafeCookiePrefix(name)) throw new Error('next-api-bridge: cookie name is invalid');
    const cookieStore = await cookies();
    return cookieStore.get(`${this.options.cookiePrefix}${name}`)?.value ?? cookieStore.get(name)?.value;
  }

  async deleteCookies(cookieNames?: string[]): Promise<void> {
    const cookieStore = await cookies();
    if (cookieNames?.length) {
      for (const name of cookieNames) {
        if (!isSafeCookiePrefix(name)) throw new Error('next-api-bridge: cookie name is invalid');
        cookieStore.delete(`${this.options.cookiePrefix}${name}`);
        if (this.options.cookiePolicy.removeLegacyUnprefixedCookies) cookieStore.delete(name);
      }
      return;
    }
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.startsWith(this.options.cookiePrefix)) cookieStore.delete(cookie.name);
    }
  }
}
