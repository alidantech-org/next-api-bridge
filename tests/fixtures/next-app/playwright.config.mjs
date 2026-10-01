import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  use: {
    baseURL: process.env.NEXT_APP_URL ?? 'http://127.0.0.1:3100',
    userAgent: 'next-api-bridge-e2e-browser/1.0',
    locale: 'en-KE',
    extraHTTPHeaders: {
      'x-request-id': 'browser-request-id',
      'cf-connecting-ip': '203.0.113.42',
      'x-forwarded-for': '198.51.100.99',
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01'
    }
  }
});
