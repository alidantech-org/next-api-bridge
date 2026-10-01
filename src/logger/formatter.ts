import { inspect } from 'node:util';
import type { BridgeLogPayload, SafeLogEntry } from '../types';
import type { NormalizedLoggingOptions } from './config';
import { createTerminalColors, shouldUseColor } from './colors';

interface PrettyDetail {
  label: string;
  value: unknown;
}

function trimNumber(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)}b`;
  if (bytes < 1024 * 1024) return `${trimNumber((bytes / 1024).toFixed(1))}kb`;
  if (bytes < 1024 * 1024 * 1024) return `${trimNumber((bytes / (1024 * 1024)).toFixed(1))}mb`;
  return `${trimNumber((bytes / (1024 * 1024 * 1024)).toFixed(1))}gb`;
}

export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return '';
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  return `${trimNumber((durationMs / 1000).toFixed(durationMs < 10_000 ? 2 : 1))}s`;
}

function formatCacheLifetime(revalidate?: number | false): string {
  if (revalidate === false || revalidate === undefined) return 'cache';
  if (revalidate >= 86_400 && revalidate % 86_400 === 0) return `cache ${revalidate / 86_400}d`;
  if (revalidate >= 3_600 && revalidate % 3_600 === 0) return `cache ${revalidate / 3_600}h`;
  if (revalidate >= 60 && revalidate % 60 === 0) return `cache ${revalidate / 60}m`;
  return `cache ${revalidate}s`;
}

function cacheDescription(entry: SafeLogEntry): string {
  if (!entry.cache || entry.cache.mode !== 'cache') return '';
  return formatCacheLifetime(entry.cache.revalidate);
}

function fullPath(path?: string, url?: string): string {
  if (path) return path;
  if (!url) return '/';
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function typeLabel(type?: string): string {
  if (!type) return '';
  const normalized = type.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  if (!normalized || normalized === 'json' || normalized === 'application/json' || normalized.endsWith('+json')) {
    return '';
  }
  if (normalized === 'multipart' || normalized.startsWith('multipart/')) return 'multipart';
  if (normalized === 'form' || normalized === 'application/x-www-form-urlencoded') return 'form';
  if (normalized === 'text' || normalized === 'text/plain') return 'text';
  if (normalized === 'text/csv') return 'csv';
  if (normalized === 'text/html') return 'html';
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized === 'binary' || normalized === 'application/octet-stream') return 'binary';
  if (normalized === 'stream') return 'stream';
  if (normalized.startsWith('image/')) return normalized;
  return normalized.includes('/') ? normalized.split('/').pop() ?? normalized : normalized;
}

function payloadDescription(payload: BridgeLogPayload | undefined, sent: boolean): string {
  if (!payload) return '';
  const label = typeLabel(payload.bodyType ?? payload.contentType);
  if (payload.bodyBytes === undefined) {
    if (!label) return '';
    return sent ? `${label} sent` : label;
  }

  const approximate = payload.multipart?.exact === false ? '+' : '';
  const size = `${formatBytes(payload.bodyBytes)}${approximate}`;
  if (sent) return `${size}${label ? ` ${label}` : ''} sent`;
  return `${size}${label ? ` ${label}` : ''}`;
}

function statusText(entry: SafeLogEntry): string {
  if (entry.status === undefined || entry.status === 0) return 'ERR';
  return String(entry.status);
}

function colorStatus(status: string, color: ReturnType<typeof createTerminalColors>): string {
  const numeric = Number(status);
  if (status === 'ERR' || numeric >= 500) return color.red(status);
  if (numeric >= 400) return color.yellow(status);
  if (numeric >= 300) return color.cyan(status);
  if (numeric >= 200) return color.green(status);
  return status;
}

function summarizeBody(body: unknown, bytes?: number): Record<string, unknown> {
  if (body === null) return { type: 'null', bytes };
  if (Array.isArray(body)) return { type: 'array', length: body.length, bytes };
  if (typeof body === 'string') return { type: 'string', length: body.length, bytes };
  if (body && typeof body === 'object') {
    return { type: 'object', keys: Object.keys(body as Record<string, unknown>).length, bytes };
  }
  return { type: typeof body, bytes };
}

function detailItemsForSide(
  side: 'request' | 'response',
  entry: SafeLogEntry,
  options: NormalizedLoggingOptions,
): PrettyDetail[] {
  const section = options[side];
  const payload = entry[side];
  if (!payload) return [];

  const details: PrettyDetail[] = [];
  if (section.headers && payload.headers) {
    details.push({ label: `${side} headers`, value: payload.headers });
  }

  if (section.body === 'summary') {
    if (payload.multipart) {
      details.push({
        label: `${side} body`,
        value: {
          type: 'multipart',
          fields: payload.multipart.fields,
          files: payload.multipart.files,
          payloadBytes: payload.multipart.payloadBytes,
          exactWireSize: false,
        },
      });
    } else if (payload.body !== undefined) {
      details.push({
        label: `${side} body`,
        value: summarizeBody(payload.body, payload.bodyBytes),
      });
    }
  }

  if (section.body === 'full' && payload.body !== undefined) {
    details.push({ label: `${side} body`, value: payload.body });
  }

  return details;
}

function isSimpleValue(value: unknown): boolean {
  return value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint';
}

function shouldInline(value: unknown): boolean {
  if (isSimpleValue(value)) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;

  const values = Object.values(value as Record<string, unknown>);
  return values.length <= 3 && values.every(isSimpleValue);
}

function inspectValue(
  value: unknown,
  options: NormalizedLoggingOptions,
  inline: boolean,
): string {
  return inspect(value, {
    depth: options.inspect.depth,
    maxArrayLength: options.inspect.maxArrayLength,
    maxStringLength: options.inspect.maxStringLength,
    breakLength: inline ? Number.POSITIVE_INFINITY : options.inspect.breakLength,
    compact: inline ? true : false,
    colors: false,
  });
}

export function formatPrettyLogDetails(
  entry: SafeLogEntry,
  options: NormalizedLoggingOptions,
): string[] {
  const details = [
    ...detailItemsForSide('request', entry, options),
    ...detailItemsForSide('response', entry, options),
  ];
  const lines: string[] = [];

  details.forEach((detail, index) => {
    const last = index === details.length - 1;
    const branch = last ? '  └─' : '  ├─';
    const continuation = last ? '     ' : '  │  ';
    const inline = shouldInline(detail.value);
    const rendered = inspectValue(detail.value, options, inline);

    if (inline && !rendered.includes('\n')) {
      lines.push(`${branch} ${detail.label} ${rendered}`);
      return;
    }

    lines.push(`${branch} ${detail.label}`);
    for (const renderedLine of rendered.split('\n')) {
      lines.push(`${continuation}${renderedLine}`);
    }
  });

  return lines;
}

export function formatJsonLogLine(
  entry: SafeLogEntry,
  options: NormalizedLoggingOptions,
): string {
  const json = JSON.stringify(entry);
  if (!shouldUseColor(options.color)) return json;

  const color = createTerminalColors(true);
  const token = /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  return json.replace(
    token,
    (
      match,
      stringValue: string | undefined,
      keySuffix: string | undefined,
      literal: string | undefined,
    ) => {
      if (stringValue !== undefined) {
        if (keySuffix !== undefined) {
          return `${color.cyan(stringValue)}${color.gray(keySuffix)}`;
        }
        return color.green(stringValue);
      }

      if (literal !== undefined) return color.magenta(literal);
      return color.yellow(match);
    },
  );
}

export function formatPrettyLogLine(
  entry: SafeLogEntry,
  options: NormalizedLoggingOptions,
): string {
  const useColor = shouldUseColor(options.color);
  const color = createTerminalColors(useColor);
  const method = (entry.method ?? '').toUpperCase() || 'REQUEST';
  const path = fullPath(entry.path, entry.url);
  const status = statusText(entry);
  const duration = formatDuration(entry.durationMs);
  const responseSize = payloadDescription(entry.response, false);
  const requestSize = payloadDescription(entry.request, true);
  const cache = cacheDescription(entry);

  const identity = color.cyan('↗');
  const target = color.cyan(`${method} ${path}`);
  const metadata = [
    duration,
    responseSize,
    requestSize ? `(${requestSize})` : '',
  ].filter(Boolean).join(' ');

  let line = [
    identity,
    colorStatus(status, color),
    target,
    metadata ? color.gray(metadata) : '',
    cache ? color.magenta(cache) : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (entry.errorCode) line += ` ${entry.errorCode}`;
  if (entry.message && entry.message !== 'OK' && entry.message !== 'Success') {
    line += ` — ${entry.message}`;
  }

  return line;
}
