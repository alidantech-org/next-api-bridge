import http from 'node:http';

const port = Number(process.env.BACKEND_PORT ?? 4100);
const counters = new Map();

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const route = url.pathname.replace(/^\/v1/, '') || '/';

  if (route === '/login') {
    json(res, 200, { success: true, message: 'logged-in', user: { id: 'user-1' } }, {
      'set-cookie': 'session=login-session; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/api; Domain=backend.invalid; HttpOnly; SameSite=Lax',
      'x-request-id': req.headers['x-request-id'] ?? 'backend-login',
    });
    return;
  }

  if (route === '/rotate') {
    json(res, 200, { success: true, message: 'rotated' }, {
      'set-cookie': 'session=rotated-session; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/auth; Domain=backend.invalid; HttpOnly; SameSite=Lax',
      'x-request-id': req.headers['x-request-id'] ?? 'backend-rotate',
    });
    return;
  }

  if (route === '/echo') {
    json(res, 200, {
      success: true,
      message: 'echo',
      userAgent: req.headers['user-agent'] ?? null,
      acceptLanguage: req.headers['accept-language'] ?? null,
      traceparent: req.headers.traceparent ?? null,
      requestId: req.headers['x-request-id'] ?? null,
      clientIp: req.headers['x-client-ip'] ?? null,
      clientOrigin: req.headers['x-client-origin'] ?? null,
      bridge: req.headers['x-api-bridge'] ?? null,
      query: Object.fromEntries(url.searchParams),
    }, { 'x-request-id': req.headers['x-request-id'] ?? 'backend-echo' });
    return;
  }

  if (route === '/empty') {
    res.writeHead(204, { 'x-request-id': req.headers['x-request-id'] ?? 'backend-empty' });
    res.end();
    return;
  }

  if (route.startsWith('/status/')) {
    const status = Number(route.split('/').pop());
    json(res, status, { success: false, message: `status-${status}`, status }, {
      'x-request-id': `status-${status}`,
      'retry-after': status === 429 ? '10' : '0',
      'set-cookie': 'should-not-be-exposed=secret; HttpOnly',
    });
    return;
  }

  if (route === '/cache') {
    const key = url.searchParams.get('key') ?? 'default';
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    json(res, 200, { success: true, message: 'cache', key, count });
    return;
  }

  json(res, 404, { success: false, message: 'not-found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`backend fixture listening on ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
