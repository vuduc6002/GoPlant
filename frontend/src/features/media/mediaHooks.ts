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
    queryFn: async () => {
      const startGeneration = getSessionGeneration();
      const response = await getMediaReadUrl(mediaId!, {
        expectedUserId: userId,
        expectedSessionGeneration: startGeneration,
      });
      if (getSessionGeneration() !== startGeneration) {
        throw new AppApiError({
          message: 'Phiên người dùng đã thay đổi trong khi đang xử lý.',
          code: 'SESSION_USER_MISMATCH',
        });
      }
      return response;
    },
    enabled: isEnabled,
    staleTime: 4 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for securely uploading an image via the backend proxy.
 * Enforces single session snapshot per mutation, verifies session before request and after response.
 */
export function useUploadMediaMutation() {
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const latestAuthRef = useRef({
    status,
    userId: getAuthenticatedUserId(status, user),
  });
  const pendingSnapshotsRef = useRef<{ ownerUserId: string; sessionGeneration: number }[]>([]);

  useEffect(() => {
    latestAuthRef.current = {
      status,
      userId: getAuthenticatedUserId(status, user),
    };
  }, [status, user]);

  return useMutation<
    MediaItem,
    AppApiError,
    LocalImageFile,
    { ownerUserId: string; sessionGeneration: number }
  >({
    onMutate: async () => {
      const snapshot = await resolveMutationSessionOwner(latestAuthRef);
      pendingSnapshotsRef.current.push(snapshot);
      return snapshot;
    },
    mutationFn: async (file: LocalImageFile) => {
      const snapshot = pendingSnapshotsRef.current.shift() ?? (await resolveMutationSessionOwner(latestAuthRef));

      // Guard 1: Verify session before initiating outbound request
      const currentUserId = latestAuthRef.current.userId;
      const currentGeneration = getSessionGeneration();
      if (
        currentUserId !== snapshot.ownerUserId ||
        currentGeneration !== snapshot.sessionGeneration
      ) {
        throw new AppApiError({
          message: 'Phiên người dùng đã thay đổi trước khi tải lên hình ảnh.',
          code: 'SESSION_USER_MISMATCH',
        });
      }

      // Execute upload with expected scope
      const response = await uploadMedia(file, {
        expectedUserId: snapshot.ownerUserId,
        expectedSessionGeneration: snapshot.sessionGeneration,
      });

      // Guard 2: Verify session after response returns before delivering data to caller
      const postUserId = latestAuthRef.current.userId;
      const postGeneration = getSessionGeneration();
      if (
        postUserId !== snapshot.ownerUserId ||
        postGeneration !== snapshot.sessionGeneration
      ) {
        throw new AppApiError({
          message: 'Phiên người dùng đã thay đổi trong khi đang xử lý tải lên.',
          code: 'SESSION_USER_MISMATCH',
        });
      }

      return response;
    },
    onSuccess: (data, variables, context) => {
      const currentUserId = latestAuthRef.current.userId;
      const currentGeneration = getSessionGeneration();
      if (
        !context ||
        currentUserId !== context.ownerUserId ||
        currentGeneration !== context.sessionGeneration
      ) {
        return;
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.all(context.ownerUserId),
      });
    },
  });
}

/**
 * Hook for deleting a media object from private storage and DB.
 */
export function useDeleteMediaMutation() {
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const latestAuthRef = useRef({
    status,
    userId: getAuthenticatedUserId(status, user),
  });
  const pendingSnapshotsRef = useRef<{ ownerUserId: string; sessionGeneration: number }[]>([]);

  useEffect(() => {
    latestAuthRef.current = {
      status,
      userId: getAuthenticatedUserId(status, user),
    };
  }, [status, user]);

  return useMutation<
    SimpleMessageResponseDto,
    AppApiError,
    string,
    { ownerUserId: string; sessionGeneration: number }
  >({
    onMutate: async () => {
      const snapshot = await resolveMutationSessionOwner(latestAuthRef);
      pendingSnapshotsRef.current.push(snapshot);
      return snapshot;
    },
    mutationFn: async (mediaId: string) => {
      const snapshot = pendingSnapshotsRef.current.shift() ?? (await resolveMutationSessionOwner(latestAuthRef));

      // Guard 1: Verify session before initiating outbound request
      const currentUserId = latestAuthRef.current.userId;
      const currentGeneration = getSessionGeneration();
      if (
        currentUserId !== snapshot.ownerUserId ||
        currentGeneration !== snapshot.sessionGeneration
      ) {
        throw new AppApiError({
          message: 'Phiên người dùng đã thay đổi trước khi xóa tệp tin.',
          code: 'SESSION_USER_MISMATCH',
        });
      }

      // Execute delete with expected scope
      const response = await deleteMedia(mediaId, {
        expectedUserId: snapshot.ownerUserId,
        expectedSessionGeneration: snapshot.sessionGeneration,
      });

      // Guard 2: Verify session after response returns before delivering to caller
      const postUserId = latestAuthRef.current.userId;
      const postGeneration = getSessionGeneration();
      if (
        postUserId !== snapshot.ownerUserId ||
        postGeneration !== snapshot.sessionGeneration
      ) {
        throw new AppApiError({
          message: 'Phiên người dùng đã thay đổi trong khi đang xóa tệp tin.',
          code: 'SESSION_USER_MISMATCH',
        });
      }

      return response;
    },
    onSuccess: (data, mediaId, context) => {
      const currentUserId = latestAuthRef.current.userId;
      const currentGeneration = getSessionGeneration();
      if (
        !context ||
        currentUserId !== context.ownerUserId ||
        currentGeneration !== context.sessionGeneration
      ) {
        return;
      }
      queryClient.removeQueries({
        queryKey: queryKeys.media.readUrl(context.ownerUserId, mediaId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.all(context.ownerUserId),
      });
    },
  });
}
