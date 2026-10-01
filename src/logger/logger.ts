import type { BridgeLogger, SafeLogEntry } from '../types';
import { redactValue } from './redact';

export type VerboseLogOption = 'request' | 'body' | 'response';

export function shouldLog(option: VerboseLogOption, verbose?: string): boolean {
  return (verbose ?? '')
    .toLowerCase()
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(option);
}

function safeEntry(entry: SafeLogEntry): SafeLogEntry {
  return redactValue(entry) as SafeLogEntry;
}

function defaultWrite(level: 'debug' | 'info' | 'warn' | 'error', entry: SafeLogEntry): void {
  if (process.env.NODE_ENV === 'test') return;
  if (level === 'debug' && process.env.NODE_ENV !== 'development') return;
  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  writer(`[next-api-bridge] ${JSON.stringify(safeEntry(entry))}`);
}

export function emitLog(
  logger: BridgeLogger | undefined,
  level: 'debug' | 'info' | 'warn' | 'error',
  entry: SafeLogEntry,
): void {
  const sanitized = safeEntry(entry);
  const custom = logger?.[level];
  if (custom) {
    custom(sanitized);
    return;
  }
  defaultWrite(level, sanitized);
}

/** @deprecated Kept for 0.1.x compatibility. */
export function log(message: string, status?: number, success?: boolean): void {
  emitLog(undefined, success === false ? 'error' : 'info', {
    event: success === false ? 'error' : 'response',
    message,
    status,
  });
}
