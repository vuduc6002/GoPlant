import { QueryClient } from '@tanstack/react-query';
import { AppApiError } from '../api/apiError';

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }

  if (error instanceof AppApiError) {
    const status = error.statusCode;
    if (status && [400, 401, 403, 404, 409].includes(status)) {
      return false;
    }
  }

  return true;
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
 * Clears all cached user queries upon logout to prevent data leakage between sessions.
 */
export function clearQueryCache(): void {
  queryClient.clear();
}
