const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
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

let server;
let baseUrl;
let lastRequest;

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => resolve(body));
  });
}

test.before(async () => {
  server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const route = req.url.replace(/^\/v1/, '') || '/';
    lastRequest = { method: req.method, url: route, headers: req.headers, body };
    if (route.startsWith('/empty')) {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (route.startsWith('/text')) {
      res.setHeader('content-type', 'text/plain');
      res.end('plain response');
      return;
    }
    if (route.startsWith('/status/')) {
      const status = Number(route.split('/').pop());
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.setHeader('x-request-id', 'backend-request');
      res.setHeader('x-ratelimit-remaining', '4');
      res.setHeader('set-cookie', 'rotated=secret; Path=/api; Domain=backend.invalid; Expires=Wed, 21 Oct 2030 07:28:00 GMT; HttpOnly');
      res.end(JSON.stringify({ success: false, message: `status-${status}`, status }));
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.setHeader('x-request-id', req.headers['x-request-id'] || 'generated-backend');
    res.end(JSON.stringify({
      success: true,
      message: 'ok',
      method: req.method,
      url: route,
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request({ options = {}, incoming = {}, cookies = {}, path = '/echo', method = 'GET', body, requestOptions = {} } = {}) {
  const cookieStore = new MemoryCookies(cookies);
  const normalizedOptions = testing.validateAndNormalizeOptions({ baseUrl, ...options });
  const response = await testing.executeBridgeRequest({
    normalizedOptions,
    method,
    path,
    body,
    requestOptions,
    cookieStore,
    incomingHeaders: new Headers(incoming),
  });
  return { response, cookieStore };
}

test('cookie forwarding uses only the configured prefix and bearer/API-key auth still work', async () => {
  const { response } = await request({
    options: {
      cookiePrefix: 'bridge_',
      auth: { type: 'bearer', tokenCookie: 'accessToken' },
      apiKey: 'api-secret',
      apiKeyHeader: 'x-api-key',
    },
    cookies: {
      bridge_accessToken: 'bearer-secret',
      bridge_session: 'backend-session',
      application_cookie: 'must-not-forward',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(lastRequest.headers.cookie, 'accessToken=bearer-secret; session=backend-session');
  assert.equal(lastRequest.headers.authorization, 'Bearer bearer-secret');
  assert.equal(lastRequest.headers['x-api-key'], 'api-secret');
  assert.doesNotMatch(lastRequest.headers.cookie, /application_cookie/);
  assert.equal(JSON.stringify(response).includes('bearer-secret'), false);
});

test('browser context headers and request IDs reach the backend', async () => {
  const { response } = await request({
    incoming: {
      'user-agent': 'Integration Browser/1.0',
      'accept-language': 'en-KE,en;q=0.9',
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
      'x-request-id': 'incoming-request-id',
    },
  });
  assert.equal(lastRequest.headers['user-agent'], 'Integration Browser/1.0');
  assert.equal(lastRequest.headers['accept-language'], 'en-KE,en;q=0.9');
  assert.equal(lastRequest.headers.traceparent, '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01');
  assert.equal(lastRequest.headers['x-request-id'], 'incoming-request-id');
  assert.equal(lastRequest.headers['x-api-bridge'], 'next-api-bridge/0.1.7');

  const generated = await request();
  assert.match(lastRequest.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
});

test('client IP is absent by default and only present for configured trusted providers', async () => {
  const absent = await request({ incoming: { 'x-forwarded-for': '203.0.113.5', 'cf-connecting-ip': '203.0.113.6' } });
  assert.equal(lastRequest.headers['x-client-ip'], undefined);

  const cloudflare = await request({
    options: { requestContext: { clientIp: { enabled: true, trustProxy: 'cloudflare' } } },
    incoming: { 'x-forwarded-for': '198.51.100.7', 'cf-connecting-ip': '203.0.113.6' },
  });
  assert.equal(lastRequest.headers['x-client-ip'], '203.0.113.6');

  const spoofed = await request({
    options: { requestContext: { clientIp: { enabled: true, trustProxy: 'cloudflare' } } },
    incoming: { 'x-forwarded-for': '198.51.100.7' },
  });
  assert.equal(lastRequest.headers['x-client-ip'], undefined);
});

test('forbidden custom headers are rejected before fetch', async () => {
  await assert.rejects(() => request({ requestOptions: { headers: { authorization: 'Bearer attacker' } } }), /managed or forbidden/);
  await assert.rejects(() => request({ requestOptions: { headers: { host: 'evil.test' } } }), /managed or forbidden/);
});

test('response status and safe headers are serializable while Set-Cookie stays hidden', async () => {
  const { response, cookieStore } = await request({ path: '/status/429', cookies: { unrelated: 'keep-me' } });
  assert.equal(response.status, 429);
  assert.equal(response.message, 'status-429');
  assert.deepEqual(response.headers, { 'x-request-id': 'backend-request', 'x-ratelimit-remaining': '4' });
  assert.equal(Object.getPrototypeOf(response.headers), Object.prototype);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(JSON.stringify(response).includes('secret'), false);
  assert.equal(cookieStore.get('nab_rotated').value, 'secret');
  assert.equal(cookieStore.get('unrelated').value, 'keep-me');
  assert.equal(cookieStore.writes[0].options.domain, undefined);
  assert.equal(cookieStore.writes[0].options.path, '/');
  assert.equal(cookieStore.writes[0].options.expires.toISOString(), '2030-10-21T07:28:00.000Z');
});

test('custom logger never receives request credentials or response bodies', async () => {
  const entries = [];
  const logger = {
    debug: (entry) => entries.push(entry),
    info: (entry) => entries.push(entry),
    warn: (entry) => entries.push(entry),
    error: (entry) => entries.push(entry),
  };
  await request({
    options: { logger, apiKey: 'api-secret', apiKeyHeader: 'x-api-key', auth: { type: 'bearer', tokenCookie: 'accessToken' } },
    cookies: { nab_accessToken: 'bearer-secret', nab_session: 'cookie-secret' },
    requestOptions: { operationName: 'integration.echo' },
  });
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes('api-secret'), false);
  assert.equal(serialized.includes('bearer-secret'), false);
  assert.equal(serialized.includes('cookie-secret'), false);
  assert.equal(serialized.includes('set-cookie'), false);
  assert.equal(entries.every((entry) => entry.operationName === 'integration.echo'), true);
});

test('empty, JSON, text and distinguishable error statuses work', async () => {
  const empty = await request({ path: '/empty' });
  assert.equal(empty.response.status, 204);
  assert.equal(empty.response.body, null);

  const text = await request({ path: '/text' });
  assert.equal(text.response.status, 200);
  assert.equal(text.response.body, 'plain response');

  for (const status of [401, 403, 404, 409, 422, 429, 500]) {
    const result = await request({ path: `/status/${status}` });
    assert.equal(result.response.status, status);
    assert.equal(result.response.body.status, status);
  }
});

test('query absence never reaches the backend as literal undefined or null', async () => {
  const { response } = await request({ requestOptions: { query: { missing: undefined, nil: null, active: false, page: 0, search: '' } } });
  assert.match(lastRequest.url, /active=false/);
  assert.match(lastRequest.url, /page=0/);
  assert.match(lastRequest.url, /search=/);
  assert.doesNotMatch(lastRequest.url, /undefined|null/);
});
