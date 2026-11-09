import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from './apiConfig';
import { AppApiError, normalizeApiError, normalizeBackendFailure } from './apiError';
import { getAccessToken } from './tokenStorage';

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
 */
export function isPublicEndpoint(url?: string): boolean {
  if (!url) return false;
  return url.includes('/auth/login') || url.includes('/auth/register');
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
      const requestUrl = error?.config?.url || '';
      const isAuthEndpoint = isPublicEndpoint(requestUrl);

      // Only notify AuthProvider if this is a genuine 401 from a protected API call
      if (!isAuthEndpoint && unauthorizedListener) {
        unauthorizedListener();
      }
    }

    return Promise.reject(normalizedError);
  }
);
