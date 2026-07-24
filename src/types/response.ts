export type CookieSyncReason =
  | 'read-only-context'
  | 'no-set-cookie'
  | 'invalid-cookie'
  | 'applied';

export interface CookieSyncInfo {
  attempted: boolean;
  applied: boolean;
  reason?: CookieSyncReason;
}

export interface ApiBridgeResponse<T> {
  success: boolean;
  message: string;
  body: T | null;
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  errorCode?: string;
  cookieSync?: CookieSyncInfo;
}

export type FormActionResponse<T, R> = Promise<{
  formdata: Partial<T>;
  success: boolean;
  message: string;
  body:
    | (R & {
        errors?: {
          [K in keyof T]?: string[];
        };
      })
    | null;
}>;
