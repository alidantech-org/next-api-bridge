import { expect, test } from '@playwright/test';

async function submitAndRead(page, buttonId, resultId) {
  const result = page.getByTestId(resultId);
  const previous = await result.textContent();
  await page.getByTestId(buttonId).click();
  await expect.poll(async () => result.textContent()).not.toBe(previous);
  const text = await result.textContent();
  if (!text || text === 'null') throw new Error(`No result produced for ${buttonId}`);
  return JSON.parse(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Server Component reports read-only cookie synchronization', async ({ page }) => {
  const result = JSON.parse(await page.getByTestId('server-component-sync').textContent());
  expect(result.cookieSync).toEqual({ attempted: true, applied: false, reason: 'read-only-context' });
  expect(result.headers).not.toHaveProperty('set-cookie');
});

test('useActionState consumes serializable login response and cookie policy is enforced', async ({ page, context }) => {
  const result = await submitAndRead(page, 'login', 'login-result');
  expect(result.status).toBe(200);
  expect(result.success).toBe(true);
  expect(result.headers).toEqual({ 'x-request-id': 'browser-request-id' });
  expect(JSON.stringify(result)).not.toContain('Set-Cookie');
  expect(JSON.stringify(result)).not.toContain('login-session');

  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'nab_session');
  const unrelated = cookies.find((cookie) => cookie.name === 'app_theme');
  expect(session).toBeTruthy();
  expect(session.value).toBe('login-session');
  expect(session.path).toBe('/');
  expect(session.domain).toBe('127.0.0.1');
  expect(session.expires).toBeGreaterThan(Date.now() / 1000);
  expect(unrelated?.value).toBe('dark');
});

test('rotated authentication cookies persist from a Server Action', async ({ page, context }) => {
  await submitAndRead(page, 'login', 'login-result');
  const result = await submitAndRead(page, 'rotate', 'rotate-result');
  expect(result.cookieSync).toEqual({ attempted: true, applied: true, reason: 'applied' });
  const session = (await context.cookies()).find((cookie) => cookie.name === 'nab_session');
  expect(session?.value).toBe('rotated-session');
  expect(session?.path).toBe('/');
});

test('browser context is forwarded safely while spoofed IP is ignored by default', async ({ page }) => {
  const result = await submitAndRead(page, 'inspect', 'inspect-result');
  expect(result.body.userAgent).toContain('next-api-bridge-e2e-browser/1.0');
  expect(result.body.acceptLanguage.toLowerCase()).toContain('en-ke');
  expect(result.body.traceparent).toBe('00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01');
  expect(result.body.requestId).toBe('browser-request-id');
  expect(result.body.bridge).toBe('next-api-bridge/0.1.7');
  expect(result.body.clientIp).toBeNull();
  expect(result.body.query).toEqual({ active: 'false', page: '0', search: '' });
  expect(JSON.stringify(result.body.query)).not.toMatch(/undefined|null/);
});

test('trusted client IP and approved client origin are forwarded explicitly', async ({ page }) => {
  const trusted = await submitAndRead(page, 'trusted', 'trusted-result');
  expect(trusted.body.clientIp).toBe('203.0.113.42');

  const origin = await submitAndRead(page, 'origin', 'origin-result');
  expect(origin.body.clientOrigin).toMatch(/^http:\/\/127\.0\.0\.1:3100$/);
});

test('HTTP status codes and empty responses remain distinguishable', async ({ page }) => {
  for (const status of [401, 403, 404, 409, 422, 429, 500]) {
    await page.getByTestId('status-input').fill(String(status));
    const result = await submitAndRead(page, 'status', 'status-result');
    expect(result.status).toBe(status);
    expect(result.body.status).toBe(status);
    expect(result.headers).not.toHaveProperty('set-cookie');
  }

  const empty = await submitAndRead(page, 'empty', 'empty-result');
  expect(empty.status).toBe(204);
  expect(empty.body).toBeNull();
  expect(empty.errorCode).toBeUndefined();
});

test('force-cache reuses backend data and no-store stays fresh', async ({ page }) => {
  const result = await submitAndRead(page, 'cache', 'cache-result');
  expect(result.forceOne.body.count).toBe(result.forceTwo.body.count);
  expect(result.freshTwo.body.count).toBe(result.freshOne.body.count + 1);
});

test('Server Action responses contain plain records and no transport secrets', async ({ page }) => {
  const result = await submitAndRead(page, 'inspect', 'inspect-result');
  expect(Object.getPrototypeOf(result.headers)).toBe(Object.prototype);
  const serialized = JSON.stringify(result);
  expect(result.headers).not.toHaveProperty('authorization');
  expect(result.headers).not.toHaveProperty('cookie');
  expect(result.headers).not.toHaveProperty('set-cookie');
  expect(serialized).not.toContain('login-session');
  expect(serialized).not.toContain('rotated-session');
});
