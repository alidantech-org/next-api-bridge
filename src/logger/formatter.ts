import type { BridgeLogPayload, SafeLogEntry } from '../types';
import type { NormalizedLoggingOptions } from './config';
import { createTerminalColors, shouldUseColor } from './colors';

const PATH_WIDTH = 36;
const METHOD_WIDTH = 7;
const STATUS_WIDTH = 5;
const TIME_WIDTH = 8;

function trimNumber(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${trimNumber((bytes / 1024).toFixed(1))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${trimNumber((bytes / (1024 * 1024)).toFixed(1))} MB`;
  return `${trimNumber((bytes / (1024 * 1024 * 1024)).toFixed(1))} GB`;
}

export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return '';
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  return `${trimNumber((durationMs / 1000).toFixed(durationMs < 10_000 ? 2 : 1))}s`;
}

function compactPath(path?: string, url?: string): string {
  let value = path;
  if (!value && url) {
    try {
      value = new URL(url).pathname;
    } catch {
      value = url;
    }
  }
  value = value || '/';
  if (value.length <= PATH_WIDTH) return value;
  return `${value.slice(0, PATH_WIDTH - 3)}...`;
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

function largePayload(entry: SafeLogEntry, threshold: number | false): boolean {
  if (threshold === false) return false;
  return Math.max(entry.request?.bodyBytes ?? 0, entry.response?.bodyBytes ?? 0) >= threshold;
}

export function formatPrettyLogLine(
  entry: SafeLogEntry,
  options: NormalizedLoggingOptions,
): string {
  const useColor = shouldUseColor(options.color);
  const color = createTerminalColors(useColor);
  const methodRaw = (entry.method ?? '').toUpperCase().padEnd(METHOD_WIDTH);
  const pathRaw = compactPath(entry.path, entry.url).padEnd(PATH_WIDTH);
  const statusRaw = statusText(entry).padStart(STATUS_WIDTH);
  const durationRaw = formatDuration(entry.durationMs).padStart(TIME_WIDTH);

  const responseSize = payloadDescription(entry.response, false);
  const requestSize = payloadDescription(entry.request, true);
  const size = responseSize
    ? `${responseSize}${requestSize ? ` (${requestSize})` : ''}`
    : requestSize
      ? `(${requestSize})`
      : '';

  const slow = options.slowRequestMs !== false &&
    entry.durationMs !== undefined &&
    entry.durationMs >= options.slowRequestMs;
  const large = largePayload(entry, options.largeBodyBytes);

  const details: string[] = [];
  if (slow) details.push(color.yellow('SLOW'));
  if (large) details.push(color.yellow('LARGE'));
  if (options.level === 'debug' || options.level === 'trace') {
    if (entry.operationName) details.push(color.dim(`op=${entry.operationName}`));
    if (options.level === 'trace' && entry.requestId) details.push(color.dim(`id=${entry.requestId}`));
  }
  if (entry.errorCode) details.push(color.red(entry.errorCode));
  if (entry.message && entry.message !== 'OK' && entry.message !== 'Success') {
    details.push(entry.status !== undefined && entry.status >= 400 ? color.yellow(entry.message) : entry.message);
  }

  const coloredDuration = slow
    ? color.yellow(durationRaw)
    : color.dim(durationRaw);

  return [
    color.dim('API'),
    color.cyan(methodRaw),
    pathRaw,
    colorStatus(statusRaw, color),
    coloredDuration,
    size,
    details.join(' '),
  ].filter((part, index) => index < 5 || Boolean(part)).join('  ').trimEnd();
}
