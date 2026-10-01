const assert = require('node:assert/strict');
const test = require('node:test');

const query = require('../../.test-dist/query.js');
const testing = require('../../.test-dist/testing.js');

class MemoryCookies {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.writes = [];
    this.deletes = [];
  }
  get(name) {
    const value = this.values.get(name);
    return value === undefined ? undefined : { name, value };
  }
  getAll() {
    return Array.from(this.values, ([name, value]) => ({ name, value }));
  }
  set(name, value, options = {}) {
    this.values.set(name, value);
    this.writes.push({ name, value, options });
  }
  delete(name) {
    this.values.delete(name);
    this.deletes.push(name);
  }
}

test('query omission and falsy preservation', () => {
  assert.equal(query.serializeQuery({ missing: undefined, nil: null, active: false, page: 0, search: '' }), 'active=false&page=0&search=');
});

test('query dates and arrays are encoded consistently', () => {
  assert.equal(
    query.serializeQuery({ at: new Date('2026-07-24T06:51:02.515Z'), relations: ['pool', undefined, 'prices'] }),
    'at=2026-07-24T06%3A51%3A02.515Z&relations=pool%2Cprices',
  );
});

test('URL construction preserves base paths and encodes path params', () => {
  const url = testing.buildRequestUrl('https://api.example.com/v1/', '/events', ['a/b', 'hello world'], { q: 'x/y', empty: '' });
  assert.equal(url, 'https://api.example.com/v1/events/a%2Fb/hello%20world?q=x%2Fy&empty=');
});

test('configuration validates base URL, cookie prefix, auth pairs, and cache context', () => {
  assert.throws(() => testing.validateAndNormalizeOptions({ baseUrl: 'ftp://example.com' }), /http or https/);
  assert.throws(() => testing.validateAndNormalizeOptions({ baseUrl: 'https://user:pass@example.com' }), /credentials/);
  assert.throws(() => testing.validateAndNormalizeOptions({ baseUrl: 'https://example.com', cookiePrefix: '' }), /cookiePrefix/);
  assert.throws(() => testing.validateAndNormalizeOptions({ baseUrl: 'https://example.com', apiKey: 'secret' }), /provided together/);
  assert.throws(() => testing.validateAndNormalizeOptions({
    baseUrl: 'https://example.com',
    requestContext: { clientIp: { enabled: true, trustProxy: false } },
  }), /trustProxy/);
  assert.throws(() => testing.validateAndNormalizeOptions({
    baseUrl: 'https://example.com',
    requestContext: { clientOrigin: { enabled: true } },
  }), /allowedHosts or allowedOrigins/);
});

test('safe response header allowlist excludes secrets', () => {
  const headers = new Headers({
    'x-request-id': 'req-1',
    'retry-after': '30',
    'set-cookie': 'session=secret',
    authorization: 'Bearer secret',
    'x-api-key': 'secret',
  });
  assert.deepEqual(testing.collectSafeResponseHeaders(headers), {
    'x-request-id': 'req-1',
    'retry-after': '30',
  });
});

test('redaction removes credentials recursively and sanitizes URLs', () => {
  const redacted = testing.redactValue({
    password: 'secret',
    nested: { accessToken: 'token', value: 'safe' },
    headers: { authorization: 'Bearer abc', accept: 'json' },
  });
  assert.equal(redacted.password, '[REDACTED]');
  assert.equal(redacted.nested.accessToken, '[REDACTED]');
  assert.equal(redacted.nested.value, 'safe');
  assert.equal(redacted.headers.authorization, '[REDACTED]');
  assert.equal(testing.sanitizeUrlForLog('https://api.test/path?token=abc&q=ok'), 'https://api.test/path?token=%5BREDACTED%5D&q=ok');
});

test('forbidden request headers and CRLF values are rejected', () => {
  for (const name of ['authorization', 'cookie', 'set-cookie', 'host', 'content-length', 'next-action', 'x-nextjs-data', 'sec-fetch-site']) {
    assert.equal(testing.isForbiddenRequestHeader(name), true, name);
  }
  assert.throws(() => testing.assertAllowedCustomHeaders({ cookie: 'x=y' }), /managed or forbidden/);
  assert.throws(() => testing.assertAllowedCustomHeaders({ 'x-safe': 'ok\r\nInjected: yes' }), /CR\/LF/);
});

test('client origin accepts only approved origin-only values', () => {
  const options = { allowedHosts: ['app.example.com'], allowedOrigins: ['https://admin.example.com'] };
  assert.equal(testing.validateClientOrigin('https://app.example.com', options), 'https://app.example.com');
  assert.equal(testing.validateClientOrigin('https://admin.example.com', options), 'https://admin.example.com');
  assert.equal(testing.validateClientOrigin('https://app.example.com/path', options), undefined);
  assert.equal(testing.validateClientOrigin('https://user:pass@app.example.com', options), undefined);
  assert.equal(testing.validateClientOrigin('https://evil.example.com', options), undefined);
});

test('client origin prefers proxy headers and supports standard Forwarded values', () => {
  assert.equal(
    testing.deriveClientOrigin(new Headers({
      host: 'internal:3000',
      'x-forwarded-host': 'public.example.com',
      'x-forwarded-proto': 'https',
    })),
    'https://public.example.com',
  );
  assert.equal(
    testing.deriveClientOrigin(new Headers({
      host: 'internal:3000',
      forwarded: 'for=203.0.113.10;proto=https;host="standard.example.com"',
    })),
    'https://standard.example.com',
  );

  const options = testing.validateAndNormalizeOptions({
    baseUrl: 'https://api.example.com',
    requestContext: {
      clientOrigin: {
        enabled: true,
        allowedHosts: ['public.example.com', 'cookie.example.com'],
        cookieName: 'client_url',
      },
    },
  });
  const result = testing.buildRequestContextHeaders(
    new Headers({
      host: 'internal:3000',
      'x-forwarded-host': 'public.example.com',
      'x-forwarded-proto': 'https',
    }),
    new MemoryCookies({ client_url: 'https://cookie.example.com' }),
    options.requestContext,
  );
  assert.equal(result.headers['x-client-origin'], 'https://public.example.com');
});

test('IPv4, IPv6 and forwarded chains are validated', () => {
  assert.equal(testing.normalizeIp('203.0.113.10'), '203.0.113.10');
  assert.equal(testing.normalizeIp('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(testing.normalizeIp('not-an-ip'), undefined);
  assert.deepEqual(testing.parseForwardedChain('203.0.113.10, 10.0.0.1'), ['203.0.113.10', '10.0.0.1']);
  assert.equal(testing.parseForwardedChain('203.0.113.10, bad'), undefined);
});

test('Vercel, Cloudflare and custom trusted proxy resolution', () => {
  assert.equal(testing.resolveClientIp(new Headers({ 'x-vercel-forwarded-for': '203.0.113.10, 10.0.0.1' }), 'vercel'), '203.0.113.10');
  assert.equal(testing.resolveClientIp(new Headers({ 'cf-connecting-ip': '2001:db8::1' }), 'cloudflare'), '2001:db8::1');
  assert.equal(testing.resolveClientIp(new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1, 10.0.0.2' }), {
    headers: ['x-forwarded-for'], trustedProxyHops: 1,
  }), '10.0.0.1');
  assert.equal(testing.resolveClientIp(new Headers({ 'x-forwarded-for': 'spoofed' }), false), undefined);
});

test('cookie parsing preserves expires, priority and partitioned', () => {
  const cookie = testing.parseSetCookieString('session=abc==; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/api; Domain=api.example.com; HttpOnly; Secure; SameSite=Lax; Priority=High; Partitioned');
  assert.equal(cookie.value, 'abc==');
  assert.equal(cookie.expires.toISOString(), '2030-10-21T07:28:00.000Z');
  assert.equal(cookie.priority, 'high');
  assert.equal(cookie.partitioned, true);
});

test('cookie policy drops domain, rewrites path and preserves expiration', () => {
  const parsed = testing.parseSetCookieString('session=abc; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/api; Domain=api.example.com; Secure');
  const policy = testing.normalizeCookiePolicy();
  const options = testing.applyCookiePolicy(parsed, policy, true);
  assert.equal(options.domain, undefined);
  assert.equal(options.path, '/');
  assert.equal(options.secure, true);
  assert.equal(options.expires.toISOString(), '2030-10-21T07:28:00.000Z');
});

test('cookie synchronization protects unprefixed cookies', async () => {
  const store = new MemoryCookies({ session: 'application-cookie' });
  const response = new Response('{}', { headers: { 'content-type': 'application/json', 'set-cookie': 'session=backend; Path=/api; Domain=api.example.com; Expires=Wed, 21 Oct 2030 07:28:00 GMT' } });
  const result = await testing.syncResponseCookies({
    response,
    cookieStore: store,
    cookiePrefix: 'nab_',
    cookiePolicy: testing.normalizeCookiePolicy(),
    requestIsSecure: true,
  });
  assert.deepEqual(result, { attempted: true, applied: true, reason: 'applied' });
  assert.equal(store.get('session').value, 'application-cookie');
  assert.equal(store.get('nab_session').value, 'backend');
  assert.deepEqual(store.deletes, []);
  assert.equal(store.writes[0].options.domain, undefined);
  assert.equal(store.writes[0].options.path, '/');
});

test('read-only cookie writes are reported instead of hidden', async () => {
  const store = new MemoryCookies();
  store.set = () => { throw new Error('Cookies can only be modified in a Server Action or Route Handler'); };
  const result = await testing.syncResponseCookies({
    response: new Response('{}', { headers: { 'set-cookie': 'session=abc' } }),
    cookieStore: store,
    cookiePrefix: 'nab_',
    cookiePolicy: testing.normalizeCookiePolicy(),
    requestIsSecure: true,
  });
  assert.deepEqual(result, { attempted: true, applied: false, reason: 'read-only-context' });
});

test('204, JSON and text response parsing', async () => {
  const empty = await testing.parseApiResponse(new Response(null, { status: 204 }));
  assert.equal(empty.status, 204);
  assert.equal(empty.body, null);

  const json = await testing.parseApiResponse(new Response(JSON.stringify({ success: false, message: 'Denied', value: 1 }), {
    status: 403, headers: { 'content-type': 'application/json', 'x-request-id': 'req-2', 'set-cookie': 'secret=x' },
  }));
  assert.equal(json.success, false);
  assert.equal(json.message, 'Denied');
  assert.deepEqual(json.body, { success: false, message: 'Denied', value: 1 });
  assert.deepEqual(json.headers, { 'x-request-id': 'req-2' });

  const text = await testing.parseApiResponse(new Response('hello', { headers: { 'content-type': 'text/plain' } }));
  assert.equal(text.body, 'hello');
});

test('timeout and caller abort signals are combined safely', async () => {
  const timed = testing.combineAbortSignals(undefined, 10);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(timed.signal.aborted, true);
  assert.equal(timed.didTimeout(), true);
  timed.cleanup();

  const caller = new AbortController();
  const combined = testing.combineAbortSignals(caller.signal, 1000);
  caller.abort();
  assert.equal(combined.signal.aborted, true);
  assert.equal(combined.didTimeout(), false);
  combined.cleanup();
});

test('conflicting cache options are rejected', () => {
  assert.throws(() => testing.validateCacheOptions({ cache: 'no-store', next: { revalidate: 30 } }), /conflicts/);
  assert.throws(() => testing.validateCacheOptions({ cache: 'force-cache', next: { revalidate: 0 } }), /conflicts/);
  assert.doesNotThrow(() => testing.validateCacheOptions({ cache: 'force-cache', next: { revalidate: 30, tags: ['events'] } }));
});

test('request context forwards only configured safe values and generates IDs', () => {
  const options = testing.validateAndNormalizeOptions({
    baseUrl: 'https://api.example.com',
    requestContext: {
      clientIp: { enabled: true, trustProxy: 'cloudflare' },
      clientOrigin: { enabled: true, allowedHosts: ['app.example.com'], cookieName: 'client_url' },
    },
  });
  const result = testing.buildRequestContextHeaders(
    new Headers({
      'user-agent': 'Browser UA',
      'accept-language': 'en-KE',
      traceparent: '00-abc-def-01',
      baggage: 'not-forwarded-by-default',
      'cf-connecting-ip': '203.0.113.10',
      host: 'app.example.com',
    }),
    new MemoryCookies({ client_url: 'https://app.example.com' }),
    options.requestContext,
  );
  assert.equal(result.headers['user-agent'], 'Browser UA');
  assert.equal(result.headers['accept-language'], 'en-KE');
  assert.equal(result.headers.traceparent, '00-abc-def-01');
  assert.equal(result.headers.baggage, undefined);
  assert.equal(result.headers['x-client-ip'], '203.0.113.10');
  assert.equal(result.headers['x-client-origin'], 'https://app.example.com');
  assert.match(result.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
  assert.equal(result.headers['x-api-bridge'], 'next-api-bridge/0.1.7');
});


test('logging config supports compact safe defaults and bounded inspection', () => {
  const options = testing.validateAndNormalizeOptions({
    baseUrl: 'https://api.example.com',
    logging: {
      level: 'trace',
      color: false,
      request: { body: 'summary' },
      response: { body: 'full' },
      inspect: {
        depth: 2,
        maxArrayLength: 10,
        maxStringLength: 200,
      },
    },
  });

  assert.equal(options.logging.level, 'trace');
  assert.equal(options.logging.color, false);
  assert.equal(options.logging.request.body, 'summary');
  assert.equal(options.logging.response.body, 'full');
  assert.equal(options.logging.inspect.depth, 2);
  assert.equal(options.logging.inspect.maxArrayLength, 10);
  assert.equal(options.logging.inspect.maxStringLength, 200);
  assert.throws(() => testing.validateAndNormalizeOptions({
    baseUrl: 'https://api.example.com',
    logging: { inspect: { depth: -1 } },
  }), /non-negative integer/);
});

test('pretty logs use the @API identity without table padding or request IDs', () => {
  const options = testing.validateAndNormalizeOptions({
    baseUrl: 'https://api.example.com',
    logging: { level: 'trace', color: false },
  }).logging;
  const longPath = '/events/01a0ecee-8967-7eb1-91a0-5e45014dc35b/tickets';

  const line = testing.formatPrettyLogLine({
    event: 'response',
    method: 'POST',
    path: longPath,
    status: 201,
    durationMs: 42,
    requestId: 'f634cf2c-4440-4e51-a1be-8e424e125e1d',
    request: { bodyBytes: 128, bodyType: 'json' },
    response: { bodyBytes: 842, bodyType: 'json' },
  }, options);

  assert.equal(line, `@API POST ${longPath} 201 42ms 842 B (128 B sent)`);
  assert.doesNotMatch(line, /json/i);
  assert.doesNotMatch(line, /id=/i);
  assert.doesNotMatch(line, /\.\.\./);

  const multipart = testing.formatPrettyLogLine({
    event: 'response',
    method: 'POST',
    path: '/media',
    status: 201,
    durationMs: 812,
    request: {
      bodyBytes: 8 * 1024 * 1024,
      bodyType: 'multipart',
      multipart: { fields: 2, files: 1, payloadBytes: 8 * 1024 * 1024, exact: false },
    },
    response: { bodyBytes: 206, bodyType: 'json' },
  }, options);

  assert.equal(multipart, '@API POST /media 201 812ms 206 B (8 MB+ multipart sent)');
  assert.doesNotMatch(multipart, /LARGE|SLOW/);
});

test('pretty log colors give bridge output its own restrained identity', () => {
  const options = testing.validateAndNormalizeOptions({
    baseUrl: 'https://api.example.com',
    logging: { level: 'info', color: true },
  }).logging;

  const line = testing.formatPrettyLogLine({
    event: 'response',
    method: 'GET',
    path: '/events',
    status: 200,
    durationMs: 12,
    response: { bodyBytes: 759, bodyType: 'json' },
  }, options);

  assert.match(line, /\x1b\[35m@API\x1b\[0m/);
  assert.match(line, /\x1b\[36mGET\x1b\[0m/);
  assert.match(line, /\x1b\[90m\/events\x1b\[0m/);
  assert.match(line, /\x1b\[32m200\x1b\[0m/);
});

test('pretty body details stay inline for three simple keys and expand complex bodies', () => {
  const compact = testing.validateAndNormalizeOptions({
    baseUrl: 'https://api.example.com',
    logging: {
      level: 'debug',
      color: false,
      request: { body: 'full' },
      response: { body: false },
    },
  }).logging;

  const compactLines = testing.formatPrettyLogDetails({
    event: 'response',
    request: {
      body: { quantity: 2, type: 'adult', addon: false },
      bodyBytes: 44,
      bodyType: 'json',
    },
  }, compact);

  assert.deepEqual(compactLines, [
    " └─ request body { quantity: 2, type: 'adult', addon: false }",
  ]);

  const expandedLines = testing.formatPrettyLogDetails({
    event: 'response',
    request: {
      body: {
        quantity: 2,
        type: 'adult',
        addon: false,
        customerId: 'customer-1',
      },
      bodyBytes: 80,
      bodyType: 'json',
    },
  }, compact);

  assert.equal(expandedLines[0], ' └─ request body');
  assert.equal(expandedLines[1], '    {');
  assert.equal(expandedLines.at(-1), '    }');

  const nestedLines = testing.formatPrettyLogDetails({
    event: 'response',
    request: {
      body: { status: 'paused', metadata: { source: 'admin' } },
      bodyType: 'json',
    },
  }, compact);

  assert.equal(nestedLines[0], ' └─ request body');
  assert.equal(nestedLines[1], '    {');
});

test('multiple pretty details use a tree rooted below the A in @API', () => {
  const options = testing.validateAndNormalizeOptions({
    baseUrl: 'https://api.example.com',
    logging: {
      level: 'debug',
      color: false,
      request: { body: 'full' },
      response: { body: 'full' },
    },
  }).logging;

  const lines = testing.formatPrettyLogDetails({
    event: 'response',
    request: { body: { status: 'paused' }, bodyType: 'json' },
    response: { body: { success: true, updated: true }, bodyType: 'json' },
  }, options);

  assert.deepEqual(lines, [
    " ├─ request body { status: 'paused' }",
    ' └─ response body { success: true, updated: true }',
  ]);
});

test('body metrics reuse serialized JSON and mark multipart size as approximate', () => {
  const body = { name: 'Ada', count: 2 };
  const serialized = JSON.stringify(body);
  const json = testing.buildRequestLogPayload({
    originalBody: body,
    serializedBody: serialized,
    contentType: 'application/json',
    bodyMode: false,
  });

  assert.equal(json.bodyBytes, Buffer.byteLength(serialized));
  assert.equal(json.bodyType, 'json');
  assert.equal(json.body, undefined);

  const form = new FormData();
  form.append('title', 'hello');
  const multipart = testing.buildRequestLogPayload({
    originalBody: form,
    serializedBody: form,
    bodyMode: false,
  });

  assert.equal(multipart.bodyBytes, 5);
  assert.equal(multipart.bodyType, 'multipart');
  assert.equal(multipart.multipart.exact, false);
  assert.equal(multipart.multipart.fields, 1);
});

test('response parsing can collect body size without a second read', async () => {
  const raw = JSON.stringify({ success: true, value: 'hello' });
  const parsed = await testing.parseApiResponseWithMeta(new Response(raw, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }), undefined, true);

  assert.equal(parsed.metadata.bodyBytes, Buffer.byteLength(raw));
  assert.equal(parsed.metadata.bodyType, 'json');
  assert.deepEqual(parsed.result.body, { success: true, value: 'hello' });
});

test('custom logging redaction adds keys without weakening built-in protection', () => {
  const redacted = testing.redactValue({
    nationalId: '123456',
    password: 'secret',
    nested: { token: 'abc', safe: 'visible' },
  }, '', ['nationalId']);

  assert.equal(redacted.nationalId, '[REDACTED]');
  assert.equal(redacted.password, '[REDACTED]');
  assert.equal(redacted.nested.token, '[REDACTED]');
  assert.equal(redacted.nested.safe, 'visible');
});
