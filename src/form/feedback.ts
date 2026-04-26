'use client';

import { reloadPage } from './cache';
import type { ApiBridgeResponse } from '../types';

/**
 * This helper is client-only. It shows a toast notification using Sonner (optional peer dependency).
 * If Sonner is not installed, the toast is silently skipped.
 */
export function showResponseToast({ state }: { state: ApiBridgeResponse<unknown> }): void {
  // Sonner is an optional peer dependency
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { toast } = require('sonner');
    if (state?.success && state?.message) {
      toast.success(state?.message);
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
export function showResponseToastAndReload({
  state,
  path,
}: {
  state: ApiBridgeResponse<unknown>;
  path?: string;
}): void {
  showResponseToast({ state });

  if (state?.success && path) {
    void reloadPage(path);
  }
}

