export interface SafeLogEntry {
  event: 'request' | 'response' | 'error' | 'cookie';
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  requestId?: string;
  operationName?: string;
  message?: string;
  errorCode?: string;
  details?: Record<string, unknown>;
}
