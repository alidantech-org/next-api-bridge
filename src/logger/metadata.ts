import { Buffer } from 'node:buffer';
import type { BridgeLogBodyMode, BridgeLogPayload } from '../types';

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isReadableStream(value: unknown): value is ReadableStream {
  return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function classifyContentType(contentType?: string): string | undefined {
  const type = contentType?.toLowerCase().split(';', 1)[0]?.trim();
  if (!type) return undefined;
  if (type === 'application/json' || type.endsWith('+json')) return 'json';
  if (type.startsWith('multipart/')) return 'multipart';
  if (type === 'application/x-www-form-urlencoded') return 'form';
  if (type === 'text/plain') return 'text';
  if (type === 'text/csv') return 'csv';
  if (type === 'text/html') return 'html';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'application/octet-stream') return 'binary';
  if (type.startsWith('image/')) return type;
  return type;
}

function appendMultipartValue(
  result: Record<string, unknown>,
  name: string,
  value: unknown,
): void {
  if (!(name in result)) {
    result[name] = value;
    return;
  }
  const current = result[name];
  result[name] = Array.isArray(current) ? [...current, value] : [current, value];
}

function multipartPayload(
  form: FormData,
  bodyMode: BridgeLogBodyMode,
): BridgeLogPayload {
  let fields = 0;
  let files = 0;
  let payloadBytes = 0;
  const body = bodyMode === 'full' ? {} as Record<string, unknown> : undefined;

  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      fields += 1;
      payloadBytes += utf8ByteLength(value);
      if (body) appendMultipartValue(body, name, value);
      continue;
    }

    files += 1;
    payloadBytes += value.size;
    if (body) {
      appendMultipartValue(body, name, {
        name: 'name' in value ? String(value.name) : undefined,
        type: value.type || undefined,
        size: value.size,
      });
    }
  }

  return {
    body,
    bodyBytes: payloadBytes,
    bodyType: 'multipart',
    multipart: {
      fields,
      files,
      payloadBytes,
      exact: false,
    },
  };
}

export function buildRequestLogPayload({
  originalBody,
  serializedBody,
  contentType,
  bodyMode,
}: {
  originalBody: unknown;
  serializedBody?: BodyInit;
  contentType?: string;
  bodyMode: BridgeLogBodyMode;
}): BridgeLogPayload | undefined {
  if (originalBody === undefined) return undefined;

  if (typeof FormData !== 'undefined' && originalBody instanceof FormData) {
    return multipartPayload(originalBody, bodyMode);
  }

  if (originalBody instanceof URLSearchParams) {
    const text = originalBody.toString();
    return {
      body: bodyMode === false ? undefined : Object.fromEntries(originalBody.entries()),
      bodyBytes: utf8ByteLength(text),
      bodyType: 'form',
      contentType: 'application/x-www-form-urlencoded',
    };
  }

  if (isBlob(originalBody)) {
    return {
      body: bodyMode === false ? undefined : {
        type: originalBody.type || undefined,
        size: originalBody.size,
      },
      bodyBytes: originalBody.size,
      bodyType: originalBody.type || 'binary',
      contentType: originalBody.type || undefined,
    };
  }

  if (originalBody instanceof ArrayBuffer) {
    return {
      body: bodyMode === false ? undefined : { byteLength: originalBody.byteLength },
      bodyBytes: originalBody.byteLength,
      bodyType: 'binary',
    };
  }

  if (ArrayBuffer.isView(originalBody)) {
    return {
      body: bodyMode === false ? undefined : { byteLength: originalBody.byteLength },
      bodyBytes: originalBody.byteLength,
      bodyType: 'binary',
    };
  }

  if (isReadableStream(originalBody)) {
    return {
      bodyType: 'stream',
    };
  }

  const serialized = typeof serializedBody === 'string'
    ? serializedBody
    : typeof originalBody === 'string'
      ? originalBody
      : undefined;

  return {
    body: bodyMode === false ? undefined : originalBody,
    bodyBytes: serialized === undefined ? undefined : utf8ByteLength(serialized),
    bodyType: classifyContentType(contentType) ?? 'json',
    contentType,
  };
}

export function headersToRecord(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) return undefined;
  return Object.fromEntries(new Headers(headers).entries());
}
