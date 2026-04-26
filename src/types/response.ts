/**
 * Standard API response format.
 */
export interface ApiBridgeResponse<T> {
  success: boolean;
  message: string;
  body: T | null;
  headers?: Headers;
}

/**
 * Form action response format for Server Actions.
 */
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
