import { useEffect, useRef, type MutableRefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import type { SimpleMessageResponseDto } from '@/services/api/apiTypes';
import { getSession, getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import { deleteMedia, getMediaReadUrl, uploadMedia } from './mediaApi';
import type { LocalImageFile, MediaItem, MediaReadUrlResponse } from './mediaTypes';

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

async function resolveMutationSessionOwner(
  latestAuthRef: MutableRefObject<{ status: string; userId: string }>
): Promise<{ ownerUserId: string; sessionGeneration: number }> {
  const authSnapshot = latestAuthRef.current;
  if (authSnapshot.status === 'authenticated' && authSnapshot.userId) {
    return {
      ownerUserId: authSnapshot.userId,
      sessionGeneration: getSessionGeneration(),
    };
  }
  if (authSnapshot.status === 'initializing') {
    const generation = getSessionGeneration();
    const session = await getSession().catch(() => null);
    if (session?.user?.id && getSessionGeneration() === generation) {
      return {
        ownerUserId: session.user.id.trim(),
        sessionGeneration: generation,
      };
    }
  }
  throw new AppApiError({
    message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
    code: 'UNAUTHENTICATED',
  });
}

/**
 * Hook to retrieve a temporary pre-signed read URL for a private media object.
 * Results are cached with session isolation (userId) and 4-minute stale time.
 */
export function useMediaReadUrl(
  mediaId: string | null | undefined,
  options?: { enabled?: boolean }
) {
  const { user, status } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwner = userId || UNAUTHENTICATED_CACHE_OWNER;
  const isEnabled = Boolean(userId && mediaId && (options?.enabled ?? true));

  return useQuery<MediaReadUrlResponse, AppApiError>({
    queryKey: queryKeys.media.readUrl(cacheOwner, mediaId || ''),
    queryFn: () => getMediaReadUrl(mediaId!, { expectedUserId: userId }),
    enabled: isEnabled,
    staleTime: 4 * 60 * 1000, // 4 minutes (signed URLs expire in 5 minutes)
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for securely uploading an image via the backend proxy.
 * Ensures session isolation and validates the file before sending.
 */
export function useUploadMediaMutation() {
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const isMountedRef = useRef(true);
  const latestAuthRef = useRef({
    status,
    userId: getAuthenticatedUserId(status, user),
  });

  useEffect(() => {
    isMountedRef.current = true;
    latestAuthRef.current = {
      status,
      userId: getAuthenticatedUserId(status, user),
    };
    return () => {
      isMountedRef.current = false;
    };
  }, [status, user]);

  return useMutation<MediaItem, AppApiError, LocalImageFile>({
    mutationFn: async (file: LocalImageFile) => {
      const { ownerUserId, sessionGeneration } =
        await resolveMutationSessionOwner(latestAuthRef);

      return uploadMedia(file, {
        expectedUserId: ownerUserId,
        expectedSessionGeneration: sessionGeneration,
      });
    },
    onSuccess: (data) => {
      const ownerUserId = latestAuthRef.current.userId;
      if (ownerUserId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.media.all(ownerUserId),
        });
      }
    },
  });
}

/**
 * Hook for deleting a media object from private storage and DB.
 */
export function useDeleteMediaMutation() {
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const isMountedRef = useRef(true);
  const latestAuthRef = useRef({
    status,
    userId: getAuthenticatedUserId(status, user),
  });

  useEffect(() => {
    isMountedRef.current = true;
    latestAuthRef.current = {
      status,
      userId: getAuthenticatedUserId(status, user),
    };
    return () => {
      isMountedRef.current = false;
    };
  }, [status, user]);

  return useMutation<SimpleMessageResponseDto, AppApiError, string>({
    mutationFn: async (mediaId: string) => {
      const { ownerUserId, sessionGeneration } =
        await resolveMutationSessionOwner(latestAuthRef);

      return deleteMedia(mediaId, {
        expectedUserId: ownerUserId,
        expectedSessionGeneration: sessionGeneration,
      });
    },
    onSuccess: (_, mediaId) => {
      const ownerUserId = latestAuthRef.current.userId;
      if (ownerUserId) {
        queryClient.removeQueries({
          queryKey: queryKeys.media.readUrl(ownerUserId, mediaId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.media.all(ownerUserId),
        });
      }
    },
  });
}
