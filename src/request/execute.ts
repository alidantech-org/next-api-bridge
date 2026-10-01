import type {
  ApiBridgeResponse,
  PrepareRequestResult,
  RequestOptions,
} from '../types';
import type { NormalizedOptions } from '../config/validate';
import { buildBackendCookieHeader } from '../cookies/build-cookie-header';
import { syncResponseCookies, type CookieStoreLike } from '../cookies/sync-response-cookies';
import { emitLog, shouldLog } from '../logger/logger';
import { sanitizeUrlForLog } from '../logger/redact';
import { assertAllowedCustomHeaders, validateHeaderValue } from '../security/headers';
import { buildRequestContextHeaders } from './context';
import { validateCacheOptions } from './cache';
import { combineAbortSignals } from './signal';
import { buildRequestUrl } from './url';
import { parseApiResponse } from '../response/parse-response';

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isReadableStream(value: unknown): value is ReadableStream {
  return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream;
}

export function serializeRequestBody(
  method: string,
  body: unknown,
  isMultipart: boolean,
): { body?: BodyInit; contentType?: string } {
  if (method === 'GET' || method === 'HEAD' || body === undefined) return {};
  if (isMultipart || isFormData(body)) return { body: body as BodyInit };
  if (body instanceof URLSearchParams || isBlob(body) || body instanceof ArrayBuffer ||
      ArrayBuffer.isView(body) || isReadableStream(body)) {
    return { body: body as BodyInit };
  }
  return { body: JSON.stringify(body), contentType: 'application/json' };
}

export async function prepareBridgeRequest({
  normalizedOptions,
  method,
  path,
  body,
  requestOptions,
  cookieStore,
  incomingHeaders,
}: {
  normalizedOptions: NormalizedOptions;
  method: string;
  path: string;
  body: unknown;
  requestOptions: RequestOptions;
  cookieStore: CookieStoreLike;
  incomingHeaders: Headers;
}): Promise<PrepareRequestResult> {
  validateCacheOptions(requestOptions);
  const url = buildRequestUrl(
    normalizedOptions.baseUrl,
    path,
    requestOptions.params,
    requestOptions.query,
  );
  const context = buildRequestContextHeaders(
    incomingHeaders,
    cookieStore,
    normalizedOptions.requestContext,
  );
  const authHeader = normalizedOptions.auth?.header?.toLowerCase() ?? 'authorization';
  const managedHeaders = new Set([
    'cookie',
    'host',
    'content-length',
    'x-api-bridge',
    authHeader,
    ...(normalizedOptions.apiKeyHeader ? [normalizedOptions.apiKeyHeader] : []),
    ...Object.keys(context.headers),
  ]);
  const outgoingHeaders: Record<string, string> = {
    ...assertAllowedCustomHeaders(requestOptions.headers, managedHeaders),
    ...context.headers,
  };

  const cookieHeader = buildBackendCookieHeader(cookieStore.getAll(), normalizedOptions.cookiePrefix);
  if (cookieHeader) outgoingHeaders.cookie = cookieHeader;

  if (normalizedOptions.auth?.type === 'bearer') {
    const token = cookieStore.get(`${normalizedOptions.cookiePrefix}${normalizedOptions.auth.tokenCookie}`)?.value
      ?? cookieStore.get(normalizedOptions.auth.tokenCookie)?.value;
    if (token) {
      const prefix = normalizedOptions.auth.prefix ?? 'Bearer';
      outgoingHeaders[authHeader] = validateHeaderValue(`${prefix} ${token}`, authHeader);
    }
  }

  if (normalizedOptions.apiKey && normalizedOptions.apiKeyHeader) {
    outgoingHeaders[normalizedOptions.apiKeyHeader] = validateHeaderValue(normalizedOptions.apiKey, normalizedOptions.apiKeyHeader);
  }

  const serialized = serializeRequestBody(method, body, requestOptions.isMultipart ?? false);
  if (serialized.contentType) outgoingHeaders['content-type'] = serialized.contentType;
  const combinedSignal = combineAbortSignals(requestOptions.signal, requestOptions.timeoutMs);
  const fetchOptions: RequestInit & { next?: RequestOptions['next'] } = {
    method,
    cache: requestOptions.cache ?? 'no-store',
    credentials: 'include',
    headers: outgoingHeaders,
    body: serialized.body,
    signal: combinedSignal.signal,
  };
  if (requestOptions.next) fetchOptions.next = requestOptions.next;

  return {
    url,
    fetchOptions,
    requestId: context.requestId,
    cleanupSignal: combinedSignal.cleanup,
    didTimeout: combinedSignal.didTimeout,
  };
}

function shouldEmitRequestLog(options: NormalizedOptions): boolean {
  return Boolean(options.logger) || shouldLog('request', options.verbose) || shouldLog('body', options.verbose);
}

function shouldEmitResponseLog(options: NormalizedOptions): boolean {
  return Boolean(options.logger) || shouldLog('response', options.verbose);
}

export async function executeBridgeRequest<T>({
  normalizedOptions,
  method,
  path,
  body,
  requestOptions = {},
  cookieStore,
  incomingHeaders,
  fetchImpl = fetch,
}: {
  normalizedOptions: NormalizedOptions;
  method: string;
  path: string;
  body?: unknown;
  requestOptions?: RequestOptions;
  cookieStore: CookieStoreLike;
  incomingHeaders: Headers;
  fetchImpl?: typeof fetch;
}): Promise<ApiBridgeResponse<T>> {
  const prepared = await prepareBridgeRequest({
    normalizedOptions,
    method,
    path,
    body,
    requestOptions,
    cookieStore,
    incomingHeaders,
  });
  const startedAt = Date.now();
  const logUrl = sanitizeUrlForLog(prepared.url);

  if (shouldEmitRequestLog(normalizedOptions)) {
    emitLog(normalizedOptions.logger, 'debug', {
      event: 'request',
      method,
      url: logUrl,
      requestId: prepared.requestId,
      operationName: requestOptions.operationName,
    });
  }

  try {
    const response = await fetchImpl(prepared.url, prepared.fetchOptions);
    const cookieSync = await syncResponseCookies({
      response,
      cookieStore,
      cookiePrefix: normalizedOptions.cookiePrefix,
      cookiePolicy: normalizedOptions.cookiePolicy,
      requestIsSecure: incomingHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https' ||
        process.env.NODE_ENV === 'production',
    });
    const result = await parseApiResponse<T>(response, requestOptions.responseType);
    result.cookieSync = cookieSync;

    if (shouldEmitResponseLog(normalizedOptions)) {
      emitLog(normalizedOptions.logger, response.ok ? 'info' : 'warn', {
        event: 'response',
        method,
        url: logUrl,
        status: result.status,
        durationMs: Date.now() - startedAt,
        requestId: prepared.requestId,
        operationName: requestOptions.operationName,
      });
    }
    return result;
  } catch (error) {
    const timedOut = prepared.didTimeout();
    const aborted = !timedOut && (requestOptions.signal?.aborted || (error instanceof Error && error.name === 'AbortError'));
    const errorCode = timedOut ? 'REQUEST_TIMEOUT' : aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR';
    const message = timedOut ? 'Backend request timed out' : aborted ? 'Backend request was aborted' : 'Backend request failed';
    emitLog(normalizedOptions.logger, 'error', {
      event: 'error',
      method,
      url: logUrl,
      durationMs: Date.now() - startedAt,
      requestId: prepared.requestId,
      operationName: requestOptions.operationName,
      errorCode,
      message,
    });
    return {
      success: false,
      message,
      body: null,
      status: 0,
      errorCode,
      cookieSync: { attempted: false, applied: false, reason: 'no-set-cookie' },
    };
  } finally {
    prepared.cleanupSignal();
  }
}
