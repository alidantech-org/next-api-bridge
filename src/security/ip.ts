import { isIP } from 'node:net';
import type { TrustProxyConfig } from '../types';
import { assertValidHeaderName, validateHeaderValue } from './headers';

export function normalizeIp(value: string): string | undefined {
  let candidate = value.trim();
  if (!candidate) return undefined;

  if (candidate.startsWith('[')) {
    const close = candidate.indexOf(']');
    if (close === -1) return undefined;
    candidate = candidate.slice(1, close);
  } else if (candidate.includes(':') && candidate.includes('.') && candidate.lastIndexOf(':') > candidate.lastIndexOf('.')) {
    const possiblePort = candidate.slice(candidate.lastIndexOf(':') + 1);
    if (/^\d+$/.test(possiblePort)) candidate = candidate.slice(0, candidate.lastIndexOf(':'));
  }

  const zoneIndex = candidate.indexOf('%');
  if (zoneIndex !== -1) candidate = candidate.slice(0, zoneIndex);
  return isIP(candidate) ? candidate.toLowerCase() : undefined;
}

export function parseForwardedChain(value: string): string[] | undefined {
  try {
    validateHeaderValue(value, 'forwarded IP');
  } catch {
    return undefined;
  }

  const parts = value.split(',').map((part) => normalizeIp(part));
  if (parts.some((part) => !part)) return undefined;
  return parts as string[];
}

function read(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);
  return value ? value.trim() : undefined;
}

export function resolveClientIp(headers: Headers, trustProxy: TrustProxyConfig): string | undefined {
  if (trustProxy === false) return undefined;

  if (trustProxy === 'cloudflare') {
    const value = read(headers, 'cf-connecting-ip');
    return value ? normalizeIp(value) : undefined;
  }

  if (trustProxy === 'vercel') {
    const vercelForwarded = read(headers, 'x-vercel-forwarded-for');
    if (vercelForwarded) {
      const chain = parseForwardedChain(vercelForwarded);
      if (chain?.length) return chain[0];
    }
    const realIp = read(headers, 'x-real-ip');
    return realIp ? normalizeIp(realIp) : undefined;
  }

  const hops = trustProxy.trustedProxyHops ?? 0;
  if (!Number.isInteger(hops) || hops < 0) return undefined;

  for (const rawName of trustProxy.headers) {
    const name = assertValidHeaderName(rawName, 'trusted proxy header');
    const value = read(headers, name);
    if (!value) continue;
    const chain = parseForwardedChain(value);
    if (!chain?.length) continue;
    const index = chain.length - 1 - hops;
    if (index >= 0) return chain[index];
  }

  return undefined;
}
