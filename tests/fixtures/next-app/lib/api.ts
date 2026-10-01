import { createNextApiBridge } from 'next-api-bridge';

const baseUrl = process.env.API_URL!;

export const api = createNextApiBridge({ baseUrl });

export const trustedApi = createNextApiBridge({
  baseUrl,
  requestContext: {
    clientIp: { enabled: true, trustProxy: 'cloudflare' },
  },
});

export const originApi = createNextApiBridge({
  baseUrl,
  requestContext: {
    clientOrigin: {
      enabled: true,
      allowedHosts: ['127.0.0.1', 'localhost'],
    },
  },
});
