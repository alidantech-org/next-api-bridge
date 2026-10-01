const SENSITIVE_KEY_PATTERN = /(^|[-_])(authorization|cookie|set-cookie|proxy-authorization|password|pass|secret|token|access.?token|refresh.?token|client.?secret|session|otp|api.?key)($|[-_])/i;

function hasAdditionalKey(key: string, additionalKeys: readonly string[]): boolean {
  const normalized = key.toLowerCase();
  return additionalKeys.some((item) => item.toLowerCase() === normalized);
}

export function isSensitiveKey(key: string, additionalKeys: readonly string[] = []): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) || hasAdditionalKey(key, additionalKeys);
}

export function redactHeaders(
  headers: Record<string, string>,
  additionalHeaders: readonly string[] = [],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = isSensitiveKey(key, additionalHeaders) ? '[REDACTED]' : value;
  }
  return result;
}

export function redactValue(
  value: unknown,
  key = '',
  additionalKeys: readonly string[] = [],
): unknown {
  if (key && isSensitiveKey(key, additionalKeys)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactValue(item, '', additionalKeys));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      result[childKey] = redactValue(childValue, childKey, additionalKeys);
    }
    return result;
  }
  return value;
}

export function sanitizeUrlForLog(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (isSensitiveKey(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return rawUrl.replace(/[\r\n]/g, '');
  }
}
