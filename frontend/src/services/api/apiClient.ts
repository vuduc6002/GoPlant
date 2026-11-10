import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from './apiConfig';
import { AppApiError, normalizeApiError, normalizeBackendFailure } from './apiError';
import { getAccessToken } from './tokenStorage';

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipAuth?: boolean;
    isPublic?: boolean;
  }
}

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

/**
 * Register a listener to be notified when a protected endpoint returns genuine HTTP 401.
 * AuthProvider subscribes to this to handle session cleanup and navigation state transition.
 * Returns an unregister function.
 */
export function registerUnauthorizedHandler(handler: UnauthorizedListener): () => void {
  unauthorizedListener = handler;
  return () => {
    if (unauthorizedListener === handler) {
      unauthorizedListener = null;
    }
  };
}

/**
 * Helper to identify public authentication endpoints that do not require JWT authorization.
 * Uses exact route matching after stripping base URL prefix, query string, and hash.
 * Only matches:
 *   - /auth/login
 *   - /auth/register
 * Does NOT match false positives like /auth/login-extra or /not-auth/login.
 */
export function isPublicEndpoint(url?: string): boolean {
  if (!url) return false;

  // 1. Strip query string and fragment
  const clean = url.split('?')[0].split('#')[0].trim();

  // 2. Extract pathname if absolute URL
  let pathname = clean;
  try {
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      const parsed = new URL(clean);
      pathname = parsed.pathname;
    }
  } catch {
    // Keep clean as fallback
  }

  // 3. Normalize leading slash
  let normalized = pathname.startsWith('/') ? pathname : '/' + pathname;

  // 4. Strip /api/v1 or /api prefix
  if (normalized.startsWith('/api/v1/')) {
    normalized = normalized.substring('/api/v1'.length);
  } else if (normalized.startsWith('/api/')) {
    normalized = normalized.substring('/api'.length);
  }

  // 5. Clean trailing slash
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  // 6. Exact match on public routes only
  return normalized === '/auth/login' || normalized === '/auth/register';
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor: Inject JWT token on protected endpoints, abort on storage error
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const isPublic =
      isPublicEndpoint(config.url) ||
      ((config as unknown) as Record<string, unknown>).skipAuth === true;

    // Persist authentication metadata onto config so Response Interceptor reuses exact decision
    ((config as unknown) as Record<string, unknown>).isPublic = isPublic;

    // Public endpoints do not require token inspection
    if (isPublic) {
      return config;
    }

    // Protected endpoint: retrieve access token from secure storage
    let token: string | null = null;
    try {
      token = await getAccessToken();
    } catch (storageErr) {
      // Storage read failure: halt request immediately, do NOT send request, do NOT fake 401
      return Promise.reject(normalizeApiError(storageErr));
    }

    if (!token) {
      // Protected endpoint requested while unauthenticated
      return Promise.reject(
        new AppApiError({
          message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
          code: 'UNAUTHENTICATED',
        })
      );
    }

    if (config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

// Response Interceptor: Normalize envelopes and handle genuine backend 401
apiClient.interceptors.response.use(
  (response) => {
    // If backend envelope returned { success: false }, treat as application error
    if (response.data && typeof response.data === 'object' && response.data.success === false) {
      return Promise.reject(normalizeBackendFailure(response.data, response.status));
    }
    return response;
  },
  async (error) => {
    const normalizedError = normalizeApiError(error);

    // Handle genuine HTTP 401 Unauthorized from backend on protected routes
    if (normalizedError.statusCode === 401) {
      const reqConfig = error?.config as (Record<string, unknown> | undefined);
      const isAuthSkipped = reqConfig?.isPublic === true || reqConfig?.skipAuth === true;
      const requestUrl = error?.config?.url || '';
      const isAuthEndpoint = isAuthSkipped || isPublicEndpoint(requestUrl);

      // Only notify AuthProvider if this is a genuine 401 from a protected API call
      if (!isAuthEndpoint && unauthorizedListener) {
        unauthorizedListener();
      }
    }

    return Promise.reject(normalizedError);
  }
);
