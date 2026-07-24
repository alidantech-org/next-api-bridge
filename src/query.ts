/**
 * Serializes query values without turning JavaScript absence into wire data.
 *
 * `undefined` and `null` mean that a query parameter was not supplied. Other
 * falsy values such as `false`, `0`, and an empty string remain meaningful.
 */
export function serializeQuery(
  query: Record<string, unknown>,
  excludedKeys: readonly string[] = [],
): string {
  const excluded = new Set(excludedKeys);
  const queryPairs: string[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (excluded.has(key) || value === undefined || value === null) {
      continue;
    }

    const serializedValue = serializeQueryValue(value);
    if (serializedValue === undefined) {
      continue;
    }

    queryPairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(serializedValue)}`);
  }

  return queryPairs.join('&');
}

function serializeQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const values = value
      .filter((item) => item !== undefined && item !== null)
      .map((item) => serializeScalarQueryValue(item));

    return values.length > 0 ? values.join(',') : undefined;
  }

  return serializeScalarQueryValue(value);
}

function serializeScalarQueryValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}
