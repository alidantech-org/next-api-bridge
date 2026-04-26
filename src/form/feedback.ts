'use client';

import type { ApiBridgeResponse } from '../types';

/**
 * This helper is client-only. It shows a toast notification using Sonner (optional peer dependency).
 * If Sonner is not installed, the toast is silently skipped.
 */
export async function showResponseToast({ state }: { state: ApiBridgeResponse<unknown> }): Promise<void> {
  // Dynamic import is the modern, safe way to handle optional packages
  try {
    // @ts-ignore - sonner is an optional peer dependency
    const { toast } = await import('sonner');
    if (state?.success) {
      toast.success(state?.message ?? 'Success');
    } else if (state?.message) {
      toast.error(state?.message);
    }
  } catch (e) {
    // Sonner not installed, skip toast
    console.debug('Sonner not installed, skipping toast');
  }
}

/**
 * This helper is client-only. It shows a toast notification, then calls the package-provided
 * Server Action reloadPage() when state.success is true and path is provided.
 */
export async function showResponseToastAndReload({
  state,
  path,
}: {
  state: ApiBridgeResponse<unknown>;
  path?: string;
}): Promise<void> {
  await showResponseToast({ state });

  if (state?.success && path) {
    // Dynamically require reloadPage from package to avoid bundling it
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { reloadPage } = await import("../cache"); 
    void reloadPage(path);
  }
}

