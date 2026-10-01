import type {
  ApiBridgeOptions,
  BridgeLogBodyMode,
  BridgeLogColor,
  BridgeLogFormat,
  BridgeLogLevel,
  BridgeLogger,
  RequestLoggingOptions,
} from '../types';

export interface NormalizedLogSection {
  headers: boolean;
  body: BridgeLogBodyMode;
}

export interface NormalizedLogInspect {
  depth: number;
  maxArrayLength: number;
  maxStringLength: number;
  breakLength: number;
  compact: boolean;
}

export interface NormalizedLoggingOptions {
  level: BridgeLogLevel;
  format: BridgeLogFormat;
  color: BridgeLogColor;
  request: NormalizedLogSection;
  response: NormalizedLogSection;
  inspect: NormalizedLogInspect;
  slowRequestMs: number | false;
  largeBodyBytes: number | false;
  redact: {
    keys: string[];
    headers: string[];
  };
  logger?: BridgeLogger;
}

const LEVELS = new Set<BridgeLogLevel>(['silent', 'error', 'warn', 'info', 'debug', 'trace']);
const FORMATS = new Set<BridgeLogFormat>(['pretty', 'json']);
const BODY_MODES = new Set<BridgeLogBodyMode>([false, 'summary', 'full']);

const LEVEL_RANK: Record<BridgeLogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

function defaultLevel(): BridgeLogLevel {
  if (process.env.NODE_ENV === 'test') return 'silent';
  if (process.env.NODE_ENV === 'development') return 'info';
  return 'warn';
}

function assertNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`next-api-bridge: ${label} must be a non-negative integer`);
  }
  return value;
}

function normalizeThreshold(
  value: number | false | undefined,
  fallback: number,
  label: string,
): number | false {
  if (value === false) return false;
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`next-api-bridge: ${label} must be false or a non-negative number`);
  }
  return value;
}

function normalizeBodyMode(value: BridgeLogBodyMode | undefined, fallback: BridgeLogBodyMode): BridgeLogBodyMode {
  const result = value ?? fallback;
  if (!BODY_MODES.has(result)) {
    throw new Error('next-api-bridge: logging body mode must be false, "summary", or "full"');
  }
  return result;
}

function verboseOptions(verbose?: string): Set<string> {
  return new Set(
    (verbose ?? '')
      .toLowerCase()
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function normalizeLogging(options: ApiBridgeOptions): NormalizedLoggingOptions {
  const logging = options.logging ?? {};
  const legacyVerbose = verboseOptions(options.verbose);
  const explicitLevel = logging.level;

  if (explicitLevel !== undefined && !LEVELS.has(explicitLevel)) {
    throw new Error('next-api-bridge: logging.level is invalid');
  }
  if (logging.format !== undefined && !FORMATS.has(logging.format)) {
    throw new Error('next-api-bridge: logging.format must be "pretty" or "json"');
  }

  let level = explicitLevel ?? defaultLevel();
  if (explicitLevel === undefined && (logging.logger || options.logger)) level = 'info';
  if (explicitLevel === undefined && legacyVerbose.size) {
    level = legacyVerbose.has('body') ? 'trace' : 'debug';
  }

  const depth = assertNonNegativeInteger(logging.inspect?.depth ?? 3, 'logging.inspect.depth');
  const maxArrayLength = assertNonNegativeInteger(
    logging.inspect?.maxArrayLength ?? 20,
    'logging.inspect.maxArrayLength',
  );
  const maxStringLength = assertNonNegativeInteger(
    logging.inspect?.maxStringLength ?? 500,
    'logging.inspect.maxStringLength',
  );
  const breakLength = assertNonNegativeInteger(
    logging.inspect?.breakLength ?? 120,
    'logging.inspect.breakLength',
  );

  return {
    level,
    format: logging.format ?? 'pretty',
    color: logging.color ?? 'auto',
    request: {
      headers: logging.request?.headers ?? false,
      body: normalizeBodyMode(
        logging.request?.body,
        legacyVerbose.has('body') ? 'full' : false,
      ),
    },
    response: {
      headers: logging.response?.headers ?? false,
      body: normalizeBodyMode(logging.response?.body, false),
    },
    inspect: {
      depth,
      maxArrayLength,
      maxStringLength,
      breakLength,
      compact: logging.inspect?.compact ?? true,
    },
    slowRequestMs: normalizeThreshold(logging.slowRequestMs, 1000, 'logging.slowRequestMs'),
    largeBodyBytes: normalizeThreshold(
      logging.largeBodyBytes,
      5 * 1024 * 1024,
      'logging.largeBodyBytes',
    ),
    redact: {
      keys: [...(logging.redact?.keys ?? [])],
      headers: [...(logging.redact?.headers ?? [])],
    },
    logger: logging.logger ?? options.logger,
  };
}

export function resolveRequestLogging(
  base: NormalizedLoggingOptions,
  override?: RequestLoggingOptions,
): NormalizedLoggingOptions {
  if (!override) return base;

  if (override.level !== undefined && !LEVELS.has(override.level)) {
    throw new Error('next-api-bridge: request logging.level is invalid');
  }

  return {
    ...base,
    level: override.level ?? base.level,
    request: {
      headers: override.request?.headers ?? base.request.headers,
      body: normalizeBodyMode(override.request?.body, base.request.body),
    },
    response: {
      headers: override.response?.headers ?? base.response.headers,
      body: normalizeBodyMode(override.response?.body, base.response.body),
    },
    inspect: {
      depth: override.inspect?.depth === undefined
        ? base.inspect.depth
        : assertNonNegativeInteger(override.inspect.depth, 'request logging.inspect.depth'),
      maxArrayLength: override.inspect?.maxArrayLength === undefined
        ? base.inspect.maxArrayLength
        : assertNonNegativeInteger(override.inspect.maxArrayLength, 'request logging.inspect.maxArrayLength'),
      maxStringLength: override.inspect?.maxStringLength === undefined
        ? base.inspect.maxStringLength
        : assertNonNegativeInteger(override.inspect.maxStringLength, 'request logging.inspect.maxStringLength'),
      breakLength: override.inspect?.breakLength === undefined
        ? base.inspect.breakLength
        : assertNonNegativeInteger(override.inspect.breakLength, 'request logging.inspect.breakLength'),
      compact: override.inspect?.compact ?? base.inspect.compact,
    },
  };
}

export function isLogLevelEnabled(
  configured: BridgeLogLevel,
  level: Exclude<BridgeLogLevel, 'silent'>,
): boolean {
  return configured !== 'silent' && LEVEL_RANK[level] <= LEVEL_RANK[configured];
}
