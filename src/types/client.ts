import type { BearerAuthConfig } from './auth';

/**
 * Configuration options for creating an API bridge client.
 */
export interface ApiBridgeOptions {
  /** Base URL of the backend API (required) */
  baseUrl: string;
  /** Prefix for backend cookies (default: 'nab_') */
  cookiePrefix?: string;
  /** Optional API key for authentication */
  apiKey?: string;
  /** Header name for API key (required if apiKey is provided) */
  apiKeyHeader?: string;
  /** Optional Bearer token authentication configuration */
  auth?: BearerAuthConfig;
  /** Comma-separated verbose logging options (e.g., 'request,body,response') */
  verbose?: string;
}

/**
 * Request options for API calls.
 */
export interface RequestOptions {
  /** Query parameters to append to the URL */
  query?: Record<string, unknown>;
  /** Path parameters to insert into the URL */
  params?: string[];
  /** Cache control option */
  cache?: 'no-store' | 'force-cache' | 'only-if-cached';
  /** Whether the request is multipart/form-data */
  isMultipart?: boolean;
}

/**
 * Result of request preparation.
 */
export interface PrepareRequestResult {
  url: string;
  fetchOptions: RequestInit;
}
