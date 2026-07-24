/** Serializes query values while omitting only JavaScript absence. */
export function serializeQuery(
  query: Record<string, unknown>,
  excludedKeys: readonly string[] = [],
): string {
  const excluded = new Set(excludedKeys);
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (excluded.has(key) || value === undefined || value === null) continue;
    const serialized = serializeQueryValue(value);
    if (serialized !== undefined) params.append(key, serialized);
  }

  return params.toString();
}

function serializeQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const values = value
      .filter((item) => item !== undefined && item !== null)
      .map(serializeScalarQueryValue);
    return values.length ? values.join(',') : undefined;
  }
  return serializeScalarQueryValue(value);
}

function serializeScalarQueryValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
