const SENSITIVE_KEY_PATTERN = /(^|[-_])(authorization|cookie|set-cookie|proxy-authorization|password|pass|secret|token|access.?token|refresh.?token|client.?secret|session|otp|api.?key)($|[-_])/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = isSensitiveKey(key) ? '[REDACTED]' : value;
  }
  return result;
}

export function redactValue(value: unknown, key = ''): unknown {
  if (key && isSensitiveKey(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      result[childKey] = redactValue(childValue, childKey);
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
