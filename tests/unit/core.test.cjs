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
