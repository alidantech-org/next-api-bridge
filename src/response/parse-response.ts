import type { ApiBridgeResponse } from '../types';
import { utf8ByteLength, classifyContentType } from '../logger/metadata';
import { collectSafeResponseHeaders } from '../security/headers';

export interface ResponseParseMetadata {
  bodyBytes?: number;
  bodyType?: string;
  contentType?: string;
}

export interface ParsedApiResponse<T> {
  result: ApiBridgeResponse<T>;
  metadata: ResponseParseMetadata;
}

export async function parseApiResponseWithMeta<T>(
  response: Response,
  responseType?: 'json' | 'text',
  measureBodyBytes = false,
): Promise<ParsedApiResponse<T>> {
  const status = response.status;
  const statusText = response.statusText || undefined;
  const headers = collectSafeResponseHeaders(response.headers);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const bodyType = classifyContentType(contentType);

  if (status === 204 || status === 205) {
    return {
      result: {
        success: response.ok,
        message: statusText ?? '',
        body: null,
        status,
        statusText,
        headers,
      },
      metadata: {
        bodyBytes: measureBodyBytes ? 0 : undefined,
        bodyType,
        contentType: contentType || undefined,
      },
    };
  }

  const shouldUseText = responseType === 'text' ||
    (responseType !== 'json' && contentType.startsWith('text/'));
  let body: unknown = null;
  let rawText = '';

  try {
    rawText = await response.text();
    if (shouldUseText) {
      body = rawText;
    } else if (contentType.includes('application/json') || responseType === 'json') {
      body = rawText ? JSON.parse(rawText) : null;
    } else {
      body = rawText || null;
    }
  } catch {
    return {
      result: {
        success: false,
        message: 'Invalid backend response',
        body: null,
        status,
        statusText,
        headers,
        errorCode: 'INVALID_RESPONSE',
      },
      metadata: {
        bodyBytes: measureBodyBytes ? utf8ByteLength(rawText) : undefined,
        bodyType,
        contentType: contentType || undefined,
      },
    };
  }

  const envelope = body && typeof body === 'object' ? body as Record<string, unknown> : undefined;
  const success = typeof envelope?.success === 'boolean' ? envelope.success : response.ok;
  const message = typeof envelope?.message === 'string'
    ? envelope.message
    : statusText ?? (success ? 'Success' : 'Request failed');

  return {
    result: {
      success,
      message,
      body: body as T | null,
      status,
      statusText,
      headers,
    },
    metadata: {
      bodyBytes: measureBodyBytes ? utf8ByteLength(rawText) : undefined,
      bodyType: bodyType ?? (shouldUseText ? 'text' : undefined),
      contentType: contentType || undefined,
    },
  };
}

export async function parseApiResponse<T>(
  response: Response,
  responseType?: 'json' | 'text',
): Promise<ApiBridgeResponse<T>> {
  return (await parseApiResponseWithMeta<T>(response, responseType)).result;
}
