'use client';

import { useActionState } from 'react';
import {
  cacheAction,
  emptyAction,
  inspectAction,
  loginAction,
  originAction,
  rotateAction,
  statusAction,
  trustedAction,
} from './actions';

function Result({ id, value }: { id: string; value: unknown }) {
  return <pre data-testid={id}>{JSON.stringify(value)}</pre>;
}

export function ClientHarness() {
  const [login, loginForm] = useActionState<unknown, FormData>(loginAction, null);
  const [rotate, rotateForm] = useActionState<unknown, FormData>(rotateAction, null);
  const [inspect, inspectForm] = useActionState<unknown, FormData>(inspectAction, null);
  const [trusted, trustedForm] = useActionState<unknown, FormData>(trustedAction, null);
  const [origin, originForm] = useActionState<unknown, FormData>(originAction, null);
  const [status, statusForm] = useActionState<unknown, FormData>(statusAction, null);
  const [empty, emptyForm] = useActionState<unknown, FormData>(emptyAction, null);
  const [cache, cacheForm] = useActionState<unknown, FormData>(cacheAction, null);

  return <main>
    <form action={loginForm}><button data-testid="login" type="submit">Login</button></form><Result id="login-result" value={login} />
    <form action={rotateForm}><button data-testid="rotate" type="submit">Rotate</button></form><Result id="rotate-result" value={rotate} />
    <form action={inspectForm}><button data-testid="inspect" type="submit">Inspect</button></form><Result id="inspect-result" value={inspect} />
    <form action={trustedForm}><button data-testid="trusted" type="submit">Trusted IP</button></form><Result id="trusted-result" value={trusted} />
    <form action={originForm}><button data-testid="origin" type="submit">Origin</button></form><Result id="origin-result" value={origin} />
    <form action={statusForm}>
      <input data-testid="status-input" name="status" defaultValue="401" />
      <button data-testid="status" type="submit">Status</button>
    </form><Result id="status-result" value={status} />
    <form action={emptyForm}><button data-testid="empty" type="submit">Empty</button></form><Result id="empty-result" value={empty} />
    <form action={cacheForm}><button data-testid="cache" type="submit">Cache</button></form><Result id="cache-result" value={cache} />
  </main>;
}
