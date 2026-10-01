import { createHash } from 'node:crypto';
import type {
  BridgeCachePolicy,
  BridgeCachingOptions,
  NextCacheOptions,
  RequestOptions,
  ResolvedBridgeCache,
} from '../types';

export interface NormalizedCacheRule extends BridgeCachePolicy {
  match: string;
  matcher: RegExp;
}

export interface NormalizedCachingOptions {
  enabled: boolean;
  default: false | BridgeCachePolicy;
  rules: NormalizedCacheRule[];
}

export interface ResolvedCacheRequest {
  cache: RequestCache;
  next?: NextCacheOptions;
  log: ResolvedBridgeCache;
}

const MAX_NEXT_TAGS = 128;
const MAX_TAG_LENGTH = 256;
const AUTO_TAG_PREFIX = 'next-api-bridge:path:';

function validateRevalidate(value: number | false, label: string): void {
  if (value === false) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`next-api-bridge: ${label}.revalidate must be false or a non-negative finite number`);
  }
}

function validateTags(tags: string[] | undefined, label: string, max = MAX_NEXT_TAGS): void {
  if (!tags) return;
  if (tags.length > max) {
    throw new Error(`next-api-bridge: ${label}.tags must contain at most ${max} items`);
  }
  if (tags.some((tag) => !tag || tag.length > MAX_TAG_LENGTH)) {
    throw new Error(`next-api-bridge: ${label}.tags must be non-empty and at most 256 characters`);
  }
}

function normalizePolicy(policy: BridgeCachePolicy, label: string): BridgeCachePolicy {
  validateRevalidate(policy.revalidate, label);
  // One slot is reserved for the automatic endpoint tag.
  validateTags(policy.tags, label, MAX_NEXT_TAGS - 1);
  return {
    revalidate: policy.revalidate,
    tags: policy.tags ? [...new Set(policy.tags)] : undefined,
  };
}

function compilePattern(pattern: string): RegExp {
  if (!pattern.startsWith('/')) {
    throw new Error('next-api-bridge: caching rule match patterns must start with "/"');
  }

  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if ('\\.^$+?()[]{}|'.includes(char)) source += '\\';
    source += char;
  }
  source += '$';
  return new RegExp(source);
}

export function normalizeCaching(options?: BridgeCachingOptions): NormalizedCachingOptions {
  if (!options) {
    return { enabled: false, default: false, rules: [] };
  }

  const defaultPolicy = options.default === false || options.default === undefined
    ? false
    : normalizePolicy(options.default, 'caching.default');

  const rules = (options.rules ?? []).map((rule, index) => {
    if (!rule.match) {
      throw new Error(`next-api-bridge: caching.rules[${index}].match is required`);
    }
    const policy = normalizePolicy(rule, `caching.rules[${index}]`);
    return {
      match: rule.match,
      matcher: compilePattern(rule.match),
      ...policy,
    };
  });

  return {
    enabled: options.enabled ?? false,
    default: defaultPolicy,
    rules,
  };
}

export function validateCacheOptions(options: RequestOptions): void {
  if (options.caching !== undefined && (options.cache !== undefined || options.next !== undefined)) {
    throw new Error('next-api-bridge: request caching cannot be combined with raw cache/next options');
  }

  const revalidate = options.next?.revalidate;
  if (options.cache === 'no-store' && typeof revalidate === 'number' && revalidate > 0) {
    throw new Error('next-api-bridge: cache "no-store" conflicts with a positive next.revalidate value');
  }
  if (options.cache === 'force-cache' && revalidate === 0) {
    throw new Error('next-api-bridge: cache "force-cache" conflicts with next.revalidate=0');
  }
  if (revalidate !== undefined) validateRevalidate(revalidate, 'next');
  validateTags(options.next?.tags, 'next');

  if (options.caching && options.caching !== false) {
    normalizePolicy(options.caching, 'request caching');
  }
}

function normalizePath(path: string): string {
  const withoutQuery = path.split('?', 1)[0] || '/';
  const withSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return withSlash.replace(/\/{2,}/g, '/');
}

export function buildApiCacheTag(path: string): string {
  const normalized = normalizePath(path);
  const candidate = `${AUTO_TAG_PREFIX}${normalized}`;
  if (candidate.length <= MAX_TAG_LENGTH) return candidate;

  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  return `${AUTO_TAG_PREFIX}sha256:${digest}`;
}

export function relativeApiPath(baseUrl: string, requestUrl: string): string {
  const base = new URL(baseUrl);
  const request = new URL(requestUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  let path = request.pathname;

  if (basePath && basePath !== '/' && path.startsWith(basePath)) {
    path = path.slice(basePath.length) || '/';
  }

  return normalizePath(path);
}

function withAutomaticTag(path: string, policy: BridgeCachePolicy): NextCacheOptions {
  const tags = [...new Set([buildApiCacheTag(path), ...(policy.tags ?? [])])];
  if (tags.length > MAX_NEXT_TAGS) {
    throw new Error(`next-api-bridge: resolved cache tags must contain at most ${MAX_NEXT_TAGS} items`);
  }
  return {
    revalidate: policy.revalidate,
    tags,
  };
}

function resolveHighLevelPolicy(
  method: string,
  path: string,
  requestOptions: RequestOptions,
  caching: NormalizedCachingOptions,
): { policy: BridgeCachePolicy; source: 'default' | 'rule' | 'request' } | undefined {
  if (requestOptions.caching === false) return undefined;

  if (requestOptions.caching) {
    if (method !== 'GET') {
      throw new Error('next-api-bridge: high-level caching is limited to GET requests');
    }
    return {
      policy: normalizePolicy(requestOptions.caching, 'request caching'),
      source: 'request',
    };
  }

  if (method !== 'GET' || !caching.enabled) return undefined;

  const rule = caching.rules.find((candidate) => candidate.matcher.test(path));
  if (rule) {
    return {
      policy: { revalidate: rule.revalidate, tags: rule.tags },
      source: 'rule',
    };
  }

  if (caching.default) {
    return { policy: caching.default, source: 'default' };
  }

  return undefined;
}

export function resolveCacheRequest(
  method: string,
  path: string,
  requestOptions: RequestOptions,
  caching: NormalizedCachingOptions,
): ResolvedCacheRequest {
  validateCacheOptions(requestOptions);

  if (requestOptions.cache !== undefined || requestOptions.next !== undefined) {
    const revalidate = requestOptions.next?.revalidate;
    const cacheMode = requestOptions.cache ??
      (revalidate === 0 ? 'no-store' : revalidate !== undefined ? 'force-cache' : 'no-store');
    const cached = cacheMode === 'force-cache' || (typeof revalidate === 'number' && revalidate > 0) || revalidate === false;

    return {
      cache: cacheMode,
      next: requestOptions.next,
      log: {
        mode: cached ? 'cache' : 'backend',
        revalidate: cached ? revalidate : undefined,
        tags: requestOptions.next?.tags,
        source: 'raw',
      },
    };
  }

  const highLevel = resolveHighLevelPolicy(method, path, requestOptions, caching);
  if (!highLevel) {
    return {
      cache: 'no-store',
      log: {
        mode: 'backend',
        source: requestOptions.caching === false ? 'request' : 'default',
      },
    };
  }

  if (highLevel.policy.revalidate === 0) {
    return {
      cache: 'no-store',
      log: {
        mode: 'backend',
        revalidate: 0,
        tags: highLevel.policy.tags,
        source: highLevel.source,
      },
    };
  }

  const next = withAutomaticTag(path, highLevel.policy);
  return {
    cache: 'force-cache',
    next,
    log: {
      mode: 'cache',
      revalidate: highLevel.policy.revalidate,
      tags: next.tags,
      source: highLevel.source,
    },
  };
}
