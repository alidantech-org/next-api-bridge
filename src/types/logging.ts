export type BridgeLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type BridgeLogFormat = 'pretty' | 'json';
export type BridgeLogBodyMode = false | 'summary' | 'full';
export type BridgeLogColor = 'auto' | boolean;

export interface BridgeLogInspectOptions {
  depth?: number;
  maxArrayLength?: number;
  maxStringLength?: number;
  breakLength?: number;
  compact?: boolean;
}

export interface BridgeLogSectionOptions {
  headers?: boolean;
  body?: BridgeLogBodyMode;
}

export interface BridgeLogRedactOptions {
  keys?: string[];
  headers?: string[];
}

export interface BridgeLogger {
  debug?(entry: SafeLogEntry): void;
  info?(entry: SafeLogEntry): void;
  warn?(entry: SafeLogEntry): void;
  error?(entry: SafeLogEntry): void;
}

export interface BridgeLoggingOptions {
  level?: BridgeLogLevel;
  format?: BridgeLogFormat;
  color?: BridgeLogColor;
  request?: BridgeLogSectionOptions;
  response?: BridgeLogSectionOptions;
  inspect?: BridgeLogInspectOptions;
  slowRequestMs?: number | false;
  largeBodyBytes?: number | false;
  redact?: BridgeLogRedactOptions;
  logger?: BridgeLogger;
}

export interface RequestLoggingOptions {
  level?: BridgeLogLevel;
  request?: BridgeLogSectionOptions;
  response?: BridgeLogSectionOptions;
  inspect?: BridgeLogInspectOptions;
}

export interface BridgeLogPayload {
  body?: unknown;
  bodyBytes?: number;
  bodyType?: string;
  contentType?: string;
  headers?: Record<string, string>;
  multipart?: {
    fields: number;
    files: number;
    payloadBytes: number;
    exact: false;
  };
}

export interface BridgeLogCache {
  mode: 'backend' | 'cache';
  revalidate?: number | false;
  tags?: string[];
  source?: 'default' | 'rule' | 'request' | 'raw';
}

export interface SafeLogEntry {
  event: 'request' | 'response' | 'error' | 'cookie' | 'cache';
  method?: string;
  path?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  requestId?: string;
  operationName?: string;
  message?: string;
  errorCode?: string;
  request?: BridgeLogPayload;
  response?: BridgeLogPayload;
  cache?: BridgeLogCache;
  details?: Record<string, unknown>;
}
