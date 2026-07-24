export interface CombinedSignal {
  signal?: AbortSignal;
  cleanup(): void;
  didTimeout(): boolean;
}

export function combineAbortSignals(callerSignal?: AbortSignal, timeoutMs?: number): CombinedSignal {
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error('next-api-bridge: timeoutMs must be a positive finite number');
  }

  if (!callerSignal && timeoutMs === undefined) {
    return { signal: undefined, cleanup() {}, didTimeout: () => false };
  }

  const controller = new AbortController();
  let timeoutTriggered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) controller.abort(callerSignal.reason);
  else callerSignal?.addEventListener('abort', onAbort, { once: true });

  if (timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timeoutTriggered = true;
      controller.abort(new Error('Request timed out'));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (timer) clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onAbort);
    },
    didTimeout: () => timeoutTriggered,
  };
}
