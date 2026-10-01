# v0.1.10 — Flatter request logs

- Moved the status code before method and path for a flatter, faster-to-scan row: `↗ 200 GET /events ...`.
- Removed the default `backend` suffix from live requests so the common log path stays compact.
- Kept cache policy visible only when caching is configured, with cache metadata highlighted in magenta.
- Compacted byte units to lowercase no-space forms such as `210b`, `1.2kb`, and `8mb`.
- Preserved semantic status coloring, cyan request identity/path, gray timing and size metadata, and all structured cache metadata.
- Added syntax highlighting to built-in JSON terminal logs while preserving plain parseable JSON for non-TTY/disabled-color output and ANSI-free custom structured loggers.
