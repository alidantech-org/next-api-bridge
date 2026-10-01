# v0.1.9 — Smart caching and clearer request logs

- Added opt-in bridge-level cache rules on top of Next.js server `fetch`, with per-request cache overrides and the existing raw `cache`/`next` options preserved.
- Added automatic endpoint cache tags plus `revalidateApiCache`, `revalidateCache`, and `expireCache` helpers for targeted refresh after mutations.
- Added truthful cache-policy metadata to pretty and structured logs without claiming unsupported cache hit/miss detection.
- Replaced the `@API` prefix with the compact `↗` request identity.
- Refined terminal logs into a flatter `↗ STATUS METHOD /path` layout: request identity/path use one cyan accent, status is semantic, timing/size metadata is gray, cache policy is magenta, live backend requests omit a source suffix, and byte units use compact forms such as `210b` and `1.2kb`.
- Expanded packed production E2E coverage to verify rule-based caching, live overrides, and endpoint invalidation across supported Next.js versions.
