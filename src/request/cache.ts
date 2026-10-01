import type { RequestOptions } from '../types';

export function validateCacheOptions(options: RequestOptions): void {
  const cache = options.cache ?? 'no-store';
  const revalidate = options.next?.revalidate;
  if (cache === 'no-store' && typeof revalidate === 'number' && revalidate > 0) {
    throw new Error('next-api-bridge: cache "no-store" conflicts with a positive next.revalidate value');
  }
  if (cache === 'force-cache' && revalidate === 0) {
    throw new Error('next-api-bridge: cache "force-cache" conflicts with next.revalidate=0');
  }
  if (typeof revalidate === 'number' && (!Number.isFinite(revalidate) || revalidate < 0)) {
    throw new Error('next-api-bridge: next.revalidate must be false or a non-negative finite number');
  }
  if (options.next?.tags?.some((tag) => !tag || tag.length > 256)) {
    throw new Error('next-api-bridge: cache tags must be non-empty and at most 256 characters');
  }
}
