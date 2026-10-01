'use server';

import { cookies } from 'next/headers';
import { revalidateApiCache } from 'next-api-bridge/cache';
import { api, originApi, trustedApi } from '../lib/api';

export async function loginAction(_previous: unknown, _formData: FormData) {
  const store = await cookies();
  store.set('app_theme', 'dark', { path: '/' });
  return api.post('/login', { email: 'user@example.com' }, { operationName: 'e2e.login' });
}

export async function rotateAction(_previous: unknown, _formData: FormData) {
  return api.post('/rotate', undefined, { operationName: 'e2e.rotate' });
}

export async function inspectAction(_previous: unknown, _formData: FormData) {
  return api.get('/echo', {
    operationName: 'e2e.inspect',
    query: { missing: undefined, nil: null, active: false, page: 0, search: '' },
  });
}

export async function trustedAction(_previous: unknown, _formData: FormData) {
  return trustedApi.get('/echo', { operationName: 'e2e.trusted' });
}

export async function originAction(_previous: unknown, _formData: FormData) {
  return originApi.get('/echo', { operationName: 'e2e.origin' });
}

export async function statusAction(_previous: unknown, formData: FormData) {
  const status = String(formData.get('status') ?? '500');
  return api.get(`/status/${status}`, { operationName: `e2e.status.${status}` });
}

export async function emptyAction(_previous: unknown, _formData: FormData) {
  return api.get('/empty', { operationName: 'e2e.empty' });
}

export async function cacheAction(_previous: unknown, _formData: FormData) {
  const forceOne = await api.get('/cache', { query: { key: 'force' } });
  const forceTwo = await api.get('/cache', { query: { key: 'force' } });
  const freshOne = await api.get('/cache', { caching: false, query: { key: 'fresh' } });
  const freshTwo = await api.get('/cache', { caching: false, query: { key: 'fresh' } });

  const invalidateOne = await api.get('/cache', { query: { key: 'invalidate' } });
  const invalidateTwo = await api.get('/cache', { query: { key: 'invalidate' } });
  await revalidateApiCache('/cache');
  const invalidateThree = await api.get('/cache', { query: { key: 'invalidate' } });

  return {
    forceOne,
    forceTwo,
    freshOne,
    freshTwo,
    invalidateOne,
    invalidateTwo,
    invalidateThree,
  };
}
