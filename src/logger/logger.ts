import type { BridgeLogger, SafeLogEntry } from '../types';
import type { NormalizedLoggingOptions } from './config';
import { isLogLevelEnabled } from './config';
import { formatJsonLogLine, formatPrettyLogDetails, formatPrettyLogLine } from './formatter';
import { redactValue } from './redact';

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
    writer(formatJsonLogLine(sanitized, options));
    return;
  }

  writer(formatPrettyLogLine(sanitized, options));
  for (const line of formatPrettyLogDetails(sanitized, options)) {
    writer(line);
  }
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
