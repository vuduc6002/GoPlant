import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import { getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import { getMonitoringOverview, getPlantMonitoringDetail } from './monitoringApi';
import type { MonitoringOverviewDto, PlantMonitoringDetailDto } from './monitoringTypes';

const UNAUTHENTICATED_CACHE_OWNER = '__unauthenticated__';

function getAuthenticatedUserId(
  status: string,
  user: { id?: string | null } | null | undefined
): string {
  if (status !== 'authenticated' || typeof user?.id !== 'string') {
    return '';
  }
  return user.id.trim();
}

export function useMonitoringOverview(options?: { enabled?: boolean }) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;

  return useQuery<MonitoringOverviewDto, AppApiError>({
    queryKey: queryKeys.monitoring.overview(cacheOwnerId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getMonitoringOverview({
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled: status === 'authenticated' && Boolean(userId) && (options?.enabled ?? true),
    // Explicitly disallow cross-account or stale placeholder data.
    placeholderData: undefined,
  });
}

export function usePlantMonitoringDetail(plantId?: string, options?: { enabled?: boolean }) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanId = plantId?.trim() ?? '';

  return useQuery<PlantMonitoringDetailDto, AppApiError>({
    queryKey: queryKeys.monitoring.plantDetail(cacheOwnerId, cleanId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getPlantMonitoringDetail(cleanId, {
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled:
      status === 'authenticated' &&
      Boolean(userId) &&
      Boolean(cleanId) &&
      (options?.enabled ?? true),
    // Explicitly disallow cross-account or stale placeholder data.
    placeholderData: undefined,
  });
}
