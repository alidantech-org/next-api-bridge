import { api } from '../lib/api';
import { ClientHarness } from './client-harness';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const serverComponentResult = await api.get('/rotate', { operationName: 'e2e.server-component' });
  return <>
    <pre data-testid="server-component-sync">{JSON.stringify(serverComponentResult)}</pre>
    <ClientHarness />
  </>;
}
