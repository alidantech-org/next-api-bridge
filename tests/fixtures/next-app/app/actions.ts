'use server';

import { cookies } from 'next/headers';
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
  const forceOne = await api.get('/cache', { cache: 'force-cache', query: { key: 'force' } });
  const forceTwo = await api.get('/cache', { cache: 'force-cache', query: { key: 'force' } });
  const freshOne = await api.get('/cache', { cache: 'no-store', query: { key: 'fresh' } });
  const freshTwo = await api.get('/cache', { cache: 'no-store', query: { key: 'fresh' } });
  return { forceOne, forceTwo, freshOne, freshTwo };
}
