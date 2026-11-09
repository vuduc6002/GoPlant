import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from './apiConfig';
import { normalizeApiError, normalizeBackendFailure } from './apiError';
import { getAccessToken } from './tokenStorage';

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

/**
 * Register a listener to be notified when a protected endpoint returns HTTP 401.
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

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor: Inject JWT token if available
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await getAccessToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // If reading token fails, proceed without token
    }
    return config;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

// Response Interceptor: Normalize envelopes and errors
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

    // Handle 401 Unauthorized on protected routes
    if (normalizedError.statusCode === 401) {
      const requestUrl = error?.config?.url || '';
      const isAuthEndpoint =
        requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

      // Only notify AuthProvider if this is a protected API call
      if (!isAuthEndpoint && unauthorizedListener) {
        unauthorizedListener();
      }
    }

    return Promise.reject(normalizedError);
  }
);
