import type { BridgeLogger, SafeLogEntry } from '../types';
import type { NormalizedLoggingOptions } from './config';
import { isLogLevelEnabled } from './config';
import { formatPrettyLogLine } from './formatter';
import { redactValue } from './redact';
import { shouldUseColor } from './colors';

export type VerboseLogOption = 'request' | 'body' | 'response';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function shouldLog(option: VerboseLogOption, verbose?: string): boolean {
  return (verbose ?? '')
    .toLowerCase()
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(option);
}

function isNormalizedLoggingOptions(
  value: BridgeLogger | NormalizedLoggingOptions | undefined,
): value is NormalizedLoggingOptions {
  return Boolean(value && 'level' in value && 'format' in value && 'inspect' in value);
}

function safeEntry(
  entry: SafeLogEntry,
  options?: NormalizedLoggingOptions,
): SafeLogEntry {
  const additions = options
    ? [...options.redact.keys, ...options.redact.headers]
    : [];
  return redactValue(entry, '', additions) as SafeLogEntry;
}

function writerFor(level: LogLevel): typeof console.log {
  if (level === 'error') return console.error;
  if (level === 'warn') return console.warn;
  return console.log;
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

function writeObject(
  label: string,
  value: unknown,
  options: NormalizedLoggingOptions,
): void {
  console.log(`  ${label}`);
  console.dir(value, {
    depth: options.inspect.depth,
    maxArrayLength: options.inspect.maxArrayLength,
    maxStringLength: options.inspect.maxStringLength,
    breakLength: options.inspect.breakLength,
    compact: options.inspect.compact,
    colors: shouldUseColor(options.color),
  });
}

function writePayloadDetails(
  side: 'request' | 'response',
  entry: SafeLogEntry,
  options: NormalizedLoggingOptions,
): void {
  const section = options[side];
  const payload = entry[side];
  if (!payload) return;

  if (section.headers && payload.headers) {
    writeObject(`${side}.headers`, payload.headers, options);
  }

  if (section.body === 'summary') {
    if (payload.multipart) {
      writeObject(`${side}.body`, {
        type: 'multipart',
        fields: payload.multipart.fields,
        files: payload.multipart.files,
        payloadBytes: payload.multipart.payloadBytes,
        exactWireSize: false,
      }, options);
    } else if (payload.body !== undefined) {
      writeObject(`${side}.body`, summarizeBody(payload.body, payload.bodyBytes), options);
    }
  }

  if (section.body === 'full' && payload.body !== undefined) {
    writeObject(`${side}.body`, payload.body, options);
  }
}

function writeConfiguredLog(
  level: LogLevel,
  entry: SafeLogEntry,
  options: NormalizedLoggingOptions,
): void {
  if (!isLogLevelEnabled(options.level, level)) return;

  const sanitized = safeEntry(entry, options);
  const custom = options.logger?.[level];
  if (custom) {
    custom(sanitized);
    return;
  }

  const writer = writerFor(level);
  if (options.format === 'json') {
    writer(JSON.stringify(sanitized));
    return;
  }

  writer(formatPrettyLogLine(sanitized, options));
  writePayloadDetails('request', sanitized, options);
  writePayloadDetails('response', sanitized, options);
}

function writeLegacyLog(
  logger: BridgeLogger | undefined,
  level: LogLevel,
  entry: SafeLogEntry,
): void {
  const sanitized = safeEntry(entry);
  const custom = logger?.[level];
  if (custom) {
    custom(sanitized);
    return;
  }

  if (process.env.NODE_ENV === 'test') return;
  if (level === 'debug' && process.env.NODE_ENV !== 'development') return;
  writerFor(level)(`[next-api-bridge] ${JSON.stringify(sanitized)}`);
}

export function emitLog(
  logging: BridgeLogger | NormalizedLoggingOptions | undefined,
  level: LogLevel,
  entry: SafeLogEntry,
): void {
  if (isNormalizedLoggingOptions(logging)) {
    writeConfiguredLog(level, entry, logging);
    return;
  }
  writeLegacyLog(logging, level, entry);
}

/** @deprecated Kept for 0.1.x compatibility. */
export function log(message: string, status?: number, success?: boolean): void {
  emitLog(undefined, success === false ? 'error' : 'info', {
    event: success === false ? 'error' : 'response',
    message,
    status,
  });
}
