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
x-api-bridge: next-api-bridge/0.1.7
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

`no-store` remains the default. `RequestOptions.cache` is passed to `fetch.cache`; it is not written into an HTTP `Cache-Control` request header.

```ts
await api.get('/catalog', {
  cache: 'force-cache',
  next: {
    revalidate: 300,
    tags: ['catalog'],
  },
});
```

Conflicting combinations are rejected, including `no-store` with a positive `revalidate`, and `force-cache` with `revalidate: 0`.

A context-free public/static client is intentionally deferred to 0.2.

## Logging

The optional logger receives structured safe entries:

```ts
const api = createNextApiBridge({
  baseUrl: process.env.API_URL!,
  logger: {
    info(entry) {
      console.info(entry);
    },
    error(entry) {
      console.error(entry);
    },
  },
});
```

Entries contain only method, sanitized URL, status, duration, request ID, operation name, stable error code, and safe messages. Request or response bodies are not logged by default.

The existing `verbose` option remains supported, but its output is redacted. Authorization, cookies, `Set-Cookie`, API keys, passwords, secrets, tokens, sessions, client secrets, and OTP values are removed.

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

## References

- https://nextjs.org/docs/app/api-reference/functions/cookies
- https://nextjs.org/docs/app/api-reference/functions/headers
- https://nextjs.org/docs/app/api-reference/functions/fetch
- https://nextjs.org/docs/app/api-reference/directives/use-cache
- https://datatracker.ietf.org/doc/rfc7239/
- https://vercel.com/docs/headers/request-headers

## License

MIT
