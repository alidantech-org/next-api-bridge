import type { ApiBridgeResponse } from '../types';
import { collectSafeResponseHeaders } from '../security/headers';

export async function parseApiResponse<T>(
  response: Response,
  responseType?: 'json' | 'text',
): Promise<ApiBridgeResponse<T>> {
  const status = response.status;
  const statusText = response.statusText || undefined;
  const headers = collectSafeResponseHeaders(response.headers);

  if (status === 204 || status === 205) {
    return {
      success: response.ok,
      message: statusText ?? '',
      body: null,
      status,
      statusText,
      headers,
    };
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const shouldUseText = responseType === 'text' || (responseType !== 'json' && contentType.startsWith('text/'));
  let body: unknown = null;

  try {
    if (shouldUseText) {
      body = await response.text();
    } else if (contentType.includes('application/json') || responseType === 'json') {
      const text = await response.text();
      body = text ? JSON.parse(text) : null;
    } else {
      const text = await response.text();
      body = text || null;
    }
  } catch {
    return {
      success: false,
      message: 'Invalid backend response',
      body: null,
      status,
      statusText,
      headers,
      errorCode: 'INVALID_RESPONSE',
    };
  }

  const envelope = body && typeof body === 'object' ? body as Record<string, unknown> : undefined;
  const success = typeof envelope?.success === 'boolean' ? envelope.success : response.ok;
  const message = typeof envelope?.message === 'string' ? envelope.message : statusText ?? (success ? 'Success' : 'Request failed');

  return {
    success,
    message,
    body: body as T | null,
    status,
    statusText,
    headers,
  };
}
