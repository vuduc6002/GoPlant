import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from './apiConfig';
import { normalizeApiError } from './apiError';
import { clearSession, getAccessToken } from './tokenStorage';

let unauthorizedListener: (() => void) | null = null;
let isHandlingUnauthorized = false;

/**
 * Register a listener to be notified when a protected endpoint returns HTTP 401.
 * Returns an unregister function.
 */
export function registerUnauthorizedHandler(handler: () => void): () => void {
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
      // If reading token fails, continue without token
    }
    return config;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

// Response Interceptor: Normalize responses and errors
apiClient.interceptors.response.use(
  (response) => {
    // If backend envelope returned { success: false }, treat as error
    if (response.data && typeof response.data === 'object' && response.data.success === false) {
      return Promise.reject(normalizeApiError({ response }));
    }
    return response;
  },
  async (error) => {
    const normalizedError = normalizeApiError(error);

    // Handle 401 Unauthorized on protected routes
    if (normalizedError.statusCode === 401) {
      const requestUrl = error?.config?.url || '';
      const isAuthEndpoint = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

      if (!isAuthEndpoint && !isHandlingUnauthorized) {
        isHandlingUnauthorized = true;
        try {
          await clearSession();
          if (unauthorizedListener) {
            unauthorizedListener();
          }
        } finally {
          setTimeout(() => {
            isHandlingUnauthorized = false;
          }, 1000);
        }
      }
    }

    return Promise.reject(normalizedError);
  }
);
