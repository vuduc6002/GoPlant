import { QueryClient } from '@tanstack/react-query';
import { AppApiError } from '../api/apiError';

/**
 * Strict retry policy for TanStack React Query:
 * Only retries on:
 * - Network errors (offline / connection refused)
 * - Timeout errors
 * - HTTP 5xx server errors
 * Never retries:
 * - HTTP 4xx (400, 401, 403, 404, 409, etc.)
 * - Parse or application logic errors
 * - Unknown errors
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }

  if (error instanceof AppApiError) {
    if (error.isNetworkError || error.code === 'TIMEOUT_ERROR') {
      return true;
    }
    const status = error.statusCode;
    if (typeof status === 'number' && status >= 500 && status < 600) {
      return true;
    }
    // Any 4xx or other application errors must not be retried
    return false;
  }

  return false;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 10,    // 10 minutes
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Cancels all active in-flight queries and completely purges the cache.
 * Called upon logout or user session switch to guarantee no data leaks.
 */
export async function clearQueryCache(): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
}
