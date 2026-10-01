# next-api-bridge

> Use Next.js as a real server—not just a React wrapper.

`next-api-bridge` is a server-only API bridge for Next.js App Router applications that call an external backend. It forwards namespaced backend cookies, supports explicit bearer and API-key authentication, relays a safe request context, and returns Server Action-serializable responses.

## Requirements

- Node.js 20 or 22
- Next.js 15 or 16 App Router
- Server Actions, Route Handlers, or Server Components

The bridge is not a browser client. Keep it in server-only modules.

## Install

```bash
npm install next-api-bridge
```

Optional toast helpers use Sonner:

```bash
npm install sonner
```

## Basic use

```ts
// src/server/api.ts
import { createNextApiBridge } from 'next-api-bridge';

export const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
});
```

```ts
'use server';

import { api } from '@/server/api';

export async function signIn(_previous: unknown, formData: FormData) {
  return api.post('/auth/login', {
    email: formData.get('email'),
    password: formData.get('password'),
  }, {
    operationName: 'auth.login',
  });
}
```

The existing request methods remain available:

```ts
api.get('/users/me');
api.post('/auth/login', body);
api.patch('/users/me', body);
api.put('/settings', body);
api.delete('/sessions/current');
```

## Response shape

Responses are safe to return from a Server Action:

```ts
interface ApiBridgeResponse<T> {
  success: boolean;
  message: string;
  body: T | null;
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  errorCode?: string;
  cookieSync?: {
    attempted: boolean;
    applied: boolean;
    reason?:
      | 'read-only-context'
      | 'no-set-cookie'
      | 'invalid-cookie'
      | 'applied';
  };
}
```

`headers` is a plain record, never a `Headers` instance. Only these backend response headers are exposed:

- `x-request-id`
- `retry-after`
- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`

`Set-Cookie`, authorization, cookies, proxy authorization, and API-key headers are never exposed through response metadata.

The parser supports JSON, `text/*`, and empty `204`/`205` responses. Backend JSON objects are not mutated; their `success` and `message` fields remain in `body`.

Network failures use `status: 0` and one of these stable codes:

- `NETWORK_ERROR`
- `REQUEST_TIMEOUT`
- `REQUEST_ABORTED`
- `INVALID_RESPONSE`

## Request options

```ts
await api.get('/events', {
  query: { page: 1, active: false, search: '' },
  params: ['event/id'],
  headers: { 'x-tenant-id': tenantId },
  cache: 'force-cache',
  next: { revalidate: 300, tags: ['events'] },
  timeoutMs: 10_000,
  signal,
  operationName: 'events.list',
  responseType: 'json',
});
```

Undefined and null query values are omitted. `false`, `0`, and empty strings are preserved. Dates use ISO format, arrays use a consistent comma-separated representation, and keys/values/path parameters are encoded.

Custom request headers are allowlisted by policy. They cannot override package-managed cookie, authorization, host, content length, API-key, or request-context headers. Framework-internal and hop-by-hop headers are rejected.

## Safe request-context forwarding

Request context is enabled by default. The bridge safely forwards:

- `user-agent`
- `accept-language`
- `traceparent`

It also sends:

```text
x-api-bridge: next-api-bridge/0.1.9
```

A request ID is preserved from `x-request-id` or generated when absent. `baggage` is supported but must be explicitly enabled.

```ts
const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
  requestContext: {
    forwardHeaders: [
      'user-agent',
      'accept-language',
      'traceparent',
      'baggage',
    ],
    requestId: {
      incomingHeaders: ['x-request-id'],
      outgoingHeader: 'x-request-id',
      generateWhenMissing: true,
    },
  },
});
```

The package never forwards every incoming header. Values containing CR/LF are rejected and lengths are bounded.

## Trusted client IP forwarding

Client IP forwarding is disabled by default. Forwarded IP headers are ignored until a trusted proxy mode is configured.

### Vercel

```ts
requestContext: {
  clientIp: {
    enabled: true,
    trustProxy: 'vercel',
  },
}
```

The bridge reads only Vercel forwarding headers and emits one validated IP as `x-client-ip`.

### Cloudflare

```ts
requestContext: {
  clientIp: {
    enabled: true,
    trustProxy: 'cloudflare',
  },
}
```

Cloudflare mode prefers `cf-connecting-ip` and validates it as IPv4 or IPv6.

### Self-hosted proxy or Caddy

Configure only headers your own trusted proxy overwrites:

```ts
requestContext: {
  clientIp: {
    enabled: true,
    trustProxy: {
      headers: ['x-forwarded-for'],
      trustedProxyHops: 1,
    },
    outgoingHeader: 'x-client-ip',
  },
}
```

The chain is parsed from the right using `trustedProxyHops`. Malformed chains are rejected, and the complete chain is never forwarded by default.

## Safe client-origin forwarding

Client-origin forwarding is disabled by default. Enabling it requires an allowlist:

```ts
requestContext: {
  clientOrigin: {
    enabled: true,
    allowedHosts: ['app.example.com'],
    allowedOrigins: ['https://admin.example.com'],
    outgoingHeader: 'x-client-origin',
  },
}
```

Only HTTP(S) origin-only values are accepted. Credentials, paths, query strings, fragments, malformed URLs, and unapproved hosts are rejected.

The legacy `client_url` cookie is no longer trusted automatically. To use it during migration, configure the cookie explicitly and keep an allowlist:

```ts
clientOrigin: {
  enabled: true,
  cookieName: 'client_url',
  allowedHosts: ['app.example.com'],
}
```

## Cookie synchronization and policy

Backend cookies are stored in Next.js under `cookiePrefix`, which remains a top-level option:

```ts
const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
  cookiePrefix: 'nab_',
});
```

Safe cookie policy defaults:

```ts
cookiePolicy: {
  domain: 'drop',
  path: '/',
  secure: 'auto',
  preserveExpires: true,
  removeLegacyUnprefixedCookies: false,
}
```

This means backend domains are dropped, paths are rewritten to `/`, secure cookies are preserved or enabled for secure requests, expiration is retained, and unrelated unprefixed application cookies are never deleted.

Modern cookie options are supported:

```ts
await api.setCookie('session', value, {
  httpOnly: true,
  secure: true,
  expires: new Date('2030-10-21T07:28:00Z'),
  priority: 'high',
  partitioned: true,
});
```

### Cookie mutation limitation

Next.js only permits cookie writes in Server Actions and Route Handlers. A Server Component may call the bridge for data, but rotated backend cookies cannot be persisted there. The response reports:

```ts
cookieSync: {
  attempted: true,
  applied: false,
  reason: 'read-only-context',
}
```

Run login, refresh-token rotation, logout, and other session-mutating calls inside a Server Action or Route Handler.

## Authentication

### Bearer token from a cookie

```ts
const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
  auth: {
    type: 'bearer',
    tokenCookie: 'accessToken',
    header: 'Authorization',
    prefix: 'Bearer',
  },
});
```

### API key

```ts
const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
  apiKey: process.env.API_KEY,
  apiKeyHeader: 'x-api-key',
});
```

`apiKey` and `apiKeyHeader` must be provided together. Secret values are never included in configuration errors or logs.

## Cache behavior

Caching is **opt-in**. The bridge does not create a second cache; it configures Next.js server `fetch` caching so cache keys, persistence, revalidation, and tags remain owned by Next.js.

A bridge can define endpoint rules:

```ts
const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
  caching: {
    enabled: true,
    default: false,
    rules: [
      {
        match: '/reference/**',
        revalidate: 3600,
        tags: ['reference'],
      },
      {
        match: '/events/*',
        revalidate: 30,
        tags: ['events'],
      },
    ],
  },
});
```

`*` matches one path segment and `**` matches any remaining path. The first matching rule wins. High-level bridge caching is limited to `GET` requests, so mutations remain live unless an application deliberately uses the raw Next.js options.

This makes long-lived reference data and frequently changing entities easy to treat differently:

```text
/reference/timezones       cache 1h
/reference/categories      cache 1h
/reference/tags            cache 1h
/events/:id                cache 30s
/auth/me                   live
/orders                    live
```

Every high-level cached endpoint gets an automatic endpoint tag. Query variants share that endpoint tag, while Next.js still uses the complete request URL/options as the actual cache key.

### Per-request cache overrides

Disable a matching rule for one request:

```ts
await api.get('/events/123', {
  caching: false,
});
```

Or override its lifetime and add tags:

```ts
await api.get('/events/123', {
  caching: {
    revalidate: 10,
    tags: ['events', 'event:123'],
  },
});
```

The existing raw Next.js escape hatch remains supported:

```ts
await api.get('/catalog', {
  cache: 'force-cache',
  next: {
    revalidate: 300,
    tags: ['catalog'],
  },
});
```

Do not combine `caching` with raw `cache`/`next` on the same request; the bridge rejects ambiguous combinations.

### Revalidation after mutations

`next-api-bridge/cache` exposes focused server helpers:

```ts
import {
  expireCache,
  revalidateApiCache,
  revalidateCache,
  reloadPage,
} from 'next-api-bridge/cache';

await api.patch('/events/123', body);

// Force every cached query variant for this API endpoint to refresh.
await revalidateApiCache('/events/123');

// Mark broader tagged data stale and refresh it using SWR behavior.
await revalidateCache(['events', 'event:123']);

// Force a custom tag to refresh on the next read.
await expireCache('event:123');

// Revalidate a Next.js page when UI route data also needs refreshing.
await reloadPage('/events/123');
```

`revalidateCache` uses the modern stale-while-revalidate behavior on Next.js 16 while remaining compatible with Next.js 15. `expireCache` and `revalidateApiCache` are intended for read-after-write flows where the next read should not keep the stale entry.

### Cache logging

Pretty logs report the **effective cache policy**, not a fabricated cache hit/miss. Next.js does not expose a supported per-fetch hit/miss field to this library.

```text
↗ 200 GET /reference/timezones 8ms 10.6kb cache 1h
↗ 200 GET /events/123 13ms 1.9kb cache 30s
↗ 200 GET /auth/me 40ms 3.7kb
```

A `cache 1h` line means the request is configured for Next.js caching with a one-hour lifetime. It does not claim whether that specific read was a hit or a backend fill. Normal live/backend requests intentionally have no source suffix, keeping the common path compact.

## Logging

Pretty logs use a small arrow as the bridge identity and otherwise stay close to ordinary request logs:

```text
↗ 201 POST /auth/login 42ms 842b (128b sent)
↗ 200 GET /auth/me 18ms 1.4kb
↗ 200 GET /reference/timezones 8ms 10.6kb cache 1h
↗ 200 PATCH /events/01a0ecee-8967-7eb1-91a0-5e45014dc35b 36ms 646b (19b sent)
↗ 422 POST /orders 36ms 311b (2.8kb sent) — Invalid ticket selection
```

Pretty logs never truncate endpoint paths and never print request IDs. Request IDs remain available to JSON and custom structured loggers.

The terminal palette is intentionally narrow:

- `↗` and `METHOD /path` use one cyan accent
- status is the only semantic color: green for 2xx, cyan for 3xx, yellow for 4xx, red for 5xx/ERR
- duration, payload sizes, and sent-size metadata use gray
- cache policy is shown only for cached requests and uses magenta
- error text does not introduce another competing semantic color

`NO_COLOR`, non-TTY output, JSON logs, and custom structured loggers remain ANSI-free.

JSON is the common response type and is intentionally not labelled. Non-JSON payloads are labelled only when the type adds useful information, such as `multipart`, `csv`, `pdf`, `text`, or an image MIME type.

Response size is shown directly. Request size is the only size wrapped in parentheses. Byte units are compact and lowercase with no separator, for example `65b`, `50kb`, and `1.2mb`:

```text
↗ 201 POST /orders 42ms 842b (128b sent)
↗ 201 POST /media 812ms 206b (8.2mb+ multipart sent)
```

Multipart sizes end in `+` because the bridge reports known field/file payload bytes without buffering the encoded multipart body merely to calculate boundary overhead.

The default logging level is:

- `info` in development
- `warn` outside development
- `silent` when `NODE_ENV=test`

### Configuration

```ts
const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
  logging: {
    level: 'info',
    format: 'pretty',
    color: 'auto',

    request: {
      headers: false,
      body: false,
    },

    response: {
      headers: false,
      body: false,
    },

    inspect: {
      depth: 3,
      maxArrayLength: 20,
      maxStringLength: 500,
      breakLength: 120,
      compact: true,
    },

    slowRequestMs: 1000,
    largeBodyBytes: 5 * 1024 * 1024,
  },
});
```

Levels are `silent | error | warn | info | debug | trace`.

Normal `info` logging emits one completed-request row. It does not emit separate request/response lines, repeated success messages, client-origin discovery messages, or raw cookie activity.

### Request and response bodies

Bodies remain off by default. Enable them independently as `summary` or `full`:

```ts
logging: {
  level: 'debug',
  request: {
    body: 'full',
  },
  response: {
    body: 'summary',
  },
}
```

Objects with up to three top-level keys stay on one line when all values are simple scalars:

```text
↗ 200 PATCH /events/123 36ms 646b (19b sent)
  └─ request body { status: 'paused' }
```

Larger or nested values expand automatically:

```text
↗ 201 POST /orders 42ms 842b (1.2kb sent)
  └─ request body
     {
       quantity: 2,
       type: 'adult',
       addon: false,
       customerId: 'customer-1'
     }
```

When multiple details are enabled, the same compact tree is used:

```text
↗ 201 POST /orders 42ms 842b (128b sent)
  ├─ request body { quantity: 2, type: 'adult' }
  └─ response body { success: true, orderId: 'order-1' }
```

`summary` reports shape information such as object key count, array length, byte size, or multipart field/file counts.

`full` uses Node's real object inspector rather than JSON-stringifying values. Inspection remains bounded by `depth`, `maxArrayLength`, and `maxStringLength`.

Sensitive values are redacted before formatting or before a custom logger receives the entry. Built-in protection includes authorization, cookies, `Set-Cookie`, passwords, API keys, secrets, access/refresh tokens, sessions, client secrets, and OTPs.

Applications can add their own sensitive field/header names:

```ts
logging: {
  redact: {
    keys: ['nationalId'],
    headers: ['x-private-key'],
  },
}
```

Built-in redaction cannot be disabled.

### Per-request debugging

A noisy endpoint can be inspected without enabling verbose logging globally:

```ts
await api.post('/checkout', body, {
  operationName: 'checkout.create',
  logging: {
    level: 'trace',
    request: { body: 'full' },
    response: { body: 'summary' },
    inspect: { depth: 4 },
  },
});
```

Pretty output remains compact even at `trace`; request IDs and sanitized backend URLs remain available in structured entries instead of being appended to terminal rows.

### Structured and file logging

A custom logger receives redacted structured objects instead of preformatted strings, including the effective cache policy:

```ts
const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
  logging: {
    level: 'info',
    logger: {
      info(entry) {
        // entry.cache.mode === 'cache' | 'backend'
        // entry.cache.revalidate contains the configured lifetime when cached.
        myLogger.info(entry);
      },
      warn(entry) {
        myLogger.warn(entry);
      },
      error(entry) {
        myLogger.error(entry);
      },
    },
  },
});
```

This is the intended integration point for Pino, Winston, OpenTelemetry collectors, Datadog, or file logging. The bridge intentionally does not own file handles, rotation, retention, or serverless filesystem behavior.

The legacy top-level `logger` and `verbose` options remain supported for 0.1.x compatibility but are deprecated in favor of `logging`.

## Migration from 0.1.6

1. `response.headers` changed from `Headers` to `Record<string, string>`. Replace `response.headers?.get('x-request-id')` with `response.headers?.['x-request-id']`.
2. Responses now include `status`, optional `statusText`, optional `errorCode`, and `cookieSync`.
3. Backend JSON bodies retain their original `success` and `message` fields.
4. Cache options now control Next.js `fetch` correctly.
5. The `client_url` cookie is no longer forwarded unless explicitly configured and allowlisted.
6. Backend cookie domains are dropped and paths are rewritten to `/` by default.
7. Unprefixed application cookies are not deleted unless `removeLegacyUnprefixedCookies: true` is explicitly enabled.
8. Client IP forwarding is disabled until a trusted proxy configuration is provided.
9. Next.js 13 and 14 are no longer claimed as supported for this release; CI targets Next.js 15 and 16 on Node.js 20 and 22.

## Validation and release gates

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run pack:verify
npm run test:e2e
```

The E2E suite packs the package, installs the tarball into a real App Router fixture, runs a production `next build` and `next start`, starts a controllable backend, and executes Playwright tests. Publishing must not proceed until these gates pass.

Releases are started manually from the **Publish to npm** workflow on `main`. The workflow reads the version from `package.json`, requires `package-lock.json` to match, validates `RELEASE_NOTES.md`, creates the immutable `vX.Y.Z` tag automatically, verifies that the tagged commit belongs to `main`, runs the Node/Next compatibility and packed E2E gates, publishes through npm Trusted Publishing, and then creates a GitHub Release for that tag.

`RELEASE_NOTES.md` is intentionally the draft for only the current release. Its first line is the GitHub Release title and must begin with the current version, for example:

```md
# v0.1.9 — Short release title

- First release note.
- Second release note.
```

The remaining file content becomes the GitHub Release body. After publication, GitHub keeps that historical copy on the Release, so the repository file can be rewritten for the next version instead of accumulating old release notes in source control.

npm can accept a publish before the new version is immediately visible from every public registry read. After `npm publish` succeeds, the workflow checks registry availability up to five times with exponential delays of 10, 20, 40, and 80 seconds. If the package becomes readable and packable, the workflow records that verification. If propagation is still pending after the fifth check, the workflow emits a warning rather than falsely failing an immutable version that npm has already accepted.

Pushes to `develop` never publish. Direct `vX.Y.Z` tag pushes remain supported, but the tag must match the package version and point to a commit contained in `main`.

## References

- https://nextjs.org/docs/app/api-reference/functions/cookies
- https://nextjs.org/docs/app/api-reference/functions/headers
- https://nextjs.org/docs/app/api-reference/functions/fetch
- https://nextjs.org/docs/app/api-reference/directives/use-cache
- https://datatracker.ietf.org/doc/rfc7239/
- https://vercel.com/docs/headers/request-headers

## License

MIT
