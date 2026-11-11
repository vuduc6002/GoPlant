import { useCallback, useEffect, useRef, useSyncExternalStore, type MutableRefObject } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import type { PageResponse, SimpleMessageResponseDto } from '@/services/api/apiTypes';
import {
  getSession,
  getSessionGeneration,
  subscribeSessionChange,
} from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import {
  addFavoriteSpecies,
  getFavoriteSpecies,
  getSpeciesDetail,
  getSpeciesList,
  normalizeFavoriteSpeciesParams,
  normalizeSpeciesListParams,
  removeFavoriteSpecies,
} from './speciesApi';
import type {
  FavoriteSpeciesParams,
  SpeciesDetailDto,
  SpeciesListParams,
  SpeciesSummaryDto,
} from './speciesTypes';

export interface ScopedFavoriteVariables {
  speciesId: string;
  ownerUserId: string;
  sessionGeneration: number;
}

export type FavoriteMutationVariables = string | ScopedFavoriteVariables;

interface SpeciesCacheSnapshot {
  userId: string;
  speciesId: string;
  detailData: SpeciesDetailDto | undefined;
  listSnapshots: [QueryKey, PageResponse<SpeciesSummaryDto> | undefined][];
  favoriteSnapshots: [QueryKey, PageResponse<SpeciesSummaryDto> | undefined][];
}

interface FavoriteMutationContext {
  cleanId: string;
  ownerUserId: string;
  sessionGeneration: number;
  snapshot: SpeciesCacheSnapshot;
}

interface ActiveFavoriteOperation {
  opToken: number;
  userId: string;
  speciesId: string;
  promise: Promise<SimpleMessageResponseDto>;
}

const UNAUTHENTICATED_CACHE_OWNER = '__unauthenticated__';

// Single app-wide active favorite operation lock (serialized across all species to avoid snapshot rollback races).
let activeFavoriteOp: ActiveFavoriteOperation | null = null;
let nextFavoriteOpToken = 0;
let pendingIdsVersion = 0;
const pendingListeners = new Set<() => void>();

function notifyPendingListeners(): void {
  pendingIdsVersion += 1;
  for (const listener of pendingListeners) {
    listener();
  }
}

function clearActiveFavoriteOp(): void {
  if (activeFavoriteOp !== null) {
    activeFavoriteOp = null;
    notifyPendingListeners();
  }
}

subscribeSessionChange((event) => {
  if (event.reason === 'clear' || event.reason === 'reset') {
    clearActiveFavoriteOp();
    return;
  }
  if (activeFavoriteOp && activeFavoriteOp.userId !== event.userId) {
    clearActiveFavoriteOp();
  }
});

/**
 * Testing helper to reset favorite operation lock cleanly between tests.
 */
export function _resetFavoriteLockForTests(): void {
  clearActiveFavoriteOp();
}

function subscribePendingIds(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

function getPendingIdsSnapshot(): number {
  return pendingIdsVersion;
}

function getAuthenticatedUserId(
  status: string,
  user: { id?: string | null } | null | undefined
): string {
  if (status !== 'authenticated' || typeof user?.id !== 'string') {
    return '';
  }
  return user.id.trim();
}

function isHookAuthMatching(
  latestAuthRef: MutableRefObject<{ status: string; userId: string }>,
  isMountedRef: MutableRefObject<boolean>,
  ownerUserId: string,
  expectedGeneration: number
): boolean {
  if (getSessionGeneration() !== expectedGeneration) {
    return false;
  }
  if (isMountedRef.current) {
    const { status, userId } = latestAuthRef.current;
    if (status === 'authenticated') {
      if (userId !== ownerUserId) {
        return false;
      }
    } else if (status !== 'initializing') {
      return false;
    }
  }
  return true;
}

async function verifyActiveSessionOwner(
  ownerUserId: string,
  expectedGeneration: number,
  latestAuthRef: MutableRefObject<{ status: string; userId: string }>,
  isMountedRef: MutableRefObject<boolean>
): Promise<boolean> {
  if (!isHookAuthMatching(latestAuthRef, isMountedRef, ownerUserId, expectedGeneration)) {
    return false;
  }
  const session = await getSession().catch(() => null);
  if (!session || session.user?.id !== ownerUserId) {
    return false;
  }
  return isHookAuthMatching(latestAuthRef, isMountedRef, ownerUserId, expectedGeneration);
}

export function useFavoritePendingState(): {
  isAnyPending: boolean;
  activeSpeciesId: string | null;
  isSpeciesPending: (speciesId: string) => boolean;
} {
  const { status, user } = useAuth();
  const currentUserId = getAuthenticatedUserId(status, user);
  useSyncExternalStore(subscribePendingIds, getPendingIdsSnapshot, getPendingIdsSnapshot);

  const matchesActiveUser = Boolean(
    activeFavoriteOp && currentUserId && activeFavoriteOp.userId === currentUserId
  );
  const activeSpeciesId = matchesActiveUser ? activeFavoriteOp!.speciesId : null;

  const isSpeciesPending = useCallback(
    (speciesId: string) => {
      const cleanId = speciesId.trim();
      return Boolean(cleanId && activeSpeciesId && activeSpeciesId === cleanId);
    },
    [activeSpeciesId]
  );

  return {
    isAnyPending: matchesActiveUser,
    activeSpeciesId,
    isSpeciesPending,
  };
}

export function usePendingFavoriteCheck(): (speciesId: string) => boolean {
  return useFavoritePendingState().isSpeciesPending;
}

function snapshotSpeciesFavoriteCache(
  qc: QueryClient,
  userId: string,
  speciesId: string
): SpeciesCacheSnapshot {
  return {
    userId,
    speciesId,
    detailData: qc.getQueryData<SpeciesDetailDto>(queryKeys.species.detail(userId, speciesId)),
    listSnapshots: qc.getQueriesData<PageResponse<SpeciesSummaryDto>>({
      queryKey: queryKeys.species.lists(userId),
    }),
    favoriteSnapshots: qc.getQueriesData<PageResponse<SpeciesSummaryDto>>({
      queryKey: queryKeys.species.favoritesAll(userId),
    }),
  };
}

function restoreSpeciesFavoriteCache(
  qc: QueryClient,
  snapshot: SpeciesCacheSnapshot | undefined
): void {
  if (!snapshot) return;

  if (snapshot.detailData !== undefined) {
    qc.setQueryData<SpeciesDetailDto>(
      queryKeys.species.detail(snapshot.userId, snapshot.speciesId),
      snapshot.detailData
    );
  }
  for (const [key, data] of snapshot.listSnapshots) {
    qc.setQueryData(key, data);
  }
  for (const [key, data] of snapshot.favoriteSnapshots) {
    qc.setQueryData(key, data);
  }
}

function applyFavoriteFlagToCache(
  qc: QueryClient,
  userId: string,
  speciesId: string,
  isFavorited: boolean
): void {
  qc.setQueryData<SpeciesDetailDto>(queryKeys.species.detail(userId, speciesId), (old) =>
    old ? { ...old, isFavorited } : old
  );

  qc.setQueriesData<PageResponse<SpeciesSummaryDto>>(
    { queryKey: queryKeys.species.lists(userId) },
    (old) => {
      if (!old || !Array.isArray(old.content)) return old;
      let changed = false;
      const nextContent = old.content.map((item) => {
        if (item.id === speciesId && item.isFavorited !== isFavorited) {
          changed = true;
          return { ...item, isFavorited };
        }
        return item;
      });
      return changed ? { ...old, content: nextContent } : old;
    }
  );

  if (!isFavorited) {
    qc.setQueriesData<PageResponse<SpeciesSummaryDto>>(
      { queryKey: queryKeys.species.favoritesAll(userId) },
      (old) => {
        if (!old || !Array.isArray(old.content)) return old;
        const filtered = old.content.filter((item) => item.id !== speciesId);
        if (filtered.length === old.content.length) return old;
        const nextTotalElements = Math.max(0, old.totalElements - 1);
        const safeSize = old.size > 0 ? old.size : 20;
        const nextTotalPages = nextTotalElements === 0 ? 0 : Math.ceil(nextTotalElements / safeSize);
        return {
          ...old,
          content: filtered,
          totalElements: nextTotalElements,
          totalPages: nextTotalPages,
          last: old.page + 1 >= nextTotalPages,
        };
      }
    );
  }
}

function invalidateSpeciesQueries(qc: QueryClient, userId: string, speciesId: string): void {
  qc.invalidateQueries({ queryKey: queryKeys.species.favoritesAll(userId) });
  qc.invalidateQueries({ queryKey: queryKeys.species.lists(userId) });
  qc.invalidateQueries({ queryKey: queryKeys.species.detail(userId, speciesId) });
}

export function useSpeciesList(
  params?: SpeciesListParams,
  options?: { enabled?: boolean; keepPreviousData?: boolean }
) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const normalized = normalizeSpeciesListParams(params);

  return useQuery<PageResponse<SpeciesSummaryDto>, AppApiError>({
    queryKey: queryKeys.species.list(cacheOwnerId, normalized),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getSpeciesList(normalized, {
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled: status === 'authenticated' && Boolean(userId) && (options?.enabled ?? true),
    placeholderData: options?.keepPreviousData === false ? undefined : keepPreviousData,
  });
}

export function useSpeciesDetail(speciesId?: string, options?: { enabled?: boolean }) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanId = speciesId?.trim() ?? '';

  return useQuery<SpeciesDetailDto, AppApiError>({
    queryKey: queryKeys.species.detail(cacheOwnerId, cleanId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getSpeciesDetail(cleanId, {
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled:
      status === 'authenticated' &&
      Boolean(userId) &&
      Boolean(cleanId) &&
      (options?.enabled ?? true),
  });
}

export function useFavoriteSpecies(
  params?: FavoriteSpeciesParams,
  options?: { enabled?: boolean; keepPreviousData?: boolean }
) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const normalized = normalizeFavoriteSpeciesParams(params);

  return useQuery<PageResponse<SpeciesSummaryDto>, AppApiError>({
    queryKey: queryKeys.species.favorites(cacheOwnerId, normalized),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getFavoriteSpecies(normalized, {
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled: status === 'authenticated' && Boolean(userId) && (options?.enabled ?? true),
    placeholderData: options?.keepPreviousData === false ? undefined : keepPreviousData,
  });
}

function resolveFavoriteVariables(
  variables: FavoriteMutationVariables,
  fallbackUserId: string
): ScopedFavoriteVariables {
  if (typeof variables === 'string') {
    return {
      speciesId: variables.trim(),
      ownerUserId: fallbackUserId,
      sessionGeneration: getSessionGeneration(),
    };
  }
  return {
    speciesId: variables.speciesId.trim(),
    ownerUserId: variables.ownerUserId.trim(),
    sessionGeneration: variables.sessionGeneration,
  };
}

export function useAddFavoriteMutation() {
  const qc = useQueryClient();
  const { status, user } = useAuth();
  const currentUserId = getAuthenticatedUserId(status, user);

  const latestAuthRef = useRef({ status, userId: currentUserId });
  const isMountedRef = useRef(true);

  useEffect(() => {
    latestAuthRef.current = { status, userId: currentUserId };
  }, [status, currentUserId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useMutation<
    SimpleMessageResponseDto,
    AppApiError,
    FavoriteMutationVariables,
    FavoriteMutationContext
  >({
    mutationFn: (variables) => {
      const resolved = resolveFavoriteVariables(variables, latestAuthRef.current.userId);
      if (!resolved.ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return addFavoriteSpecies(resolved.speciesId, {
        expectedUserId: resolved.ownerUserId,
        expectedSessionGeneration: resolved.sessionGeneration,
      });
    },
    onMutate: async (variables) => {
      const resolved = resolveFavoriteVariables(variables, latestAuthRef.current.userId);
      if (!resolved.speciesId) {
        throw new AppApiError({
          message: 'Mã loài cây không hợp lệ.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          field: 'speciesId',
        });
      }
      if (!resolved.ownerUserId) {
        throw new AppApiError({
          message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
          code: 'UNAUTHENTICATED',
        });
      }
      if (
        !isHookAuthMatching(
          latestAuthRef,
          isMountedRef,
          resolved.ownerUserId,
          resolved.sessionGeneration
        )
      ) {
        throw new AppApiError({
          message: 'Phiên đăng nhập đã thay đổi, thao tác cũ đã bị hủy.',
          code: 'SESSION_USER_MISMATCH',
        });
      }

      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.species.detail(resolved.ownerUserId, resolved.speciesId) }),
        qc.cancelQueries({ queryKey: queryKeys.species.lists(resolved.ownerUserId) }),
        qc.cancelQueries({ queryKey: queryKeys.species.favoritesAll(resolved.ownerUserId) }),
      ]);

      if (
        !isHookAuthMatching(
          latestAuthRef,
          isMountedRef,
          resolved.ownerUserId,
          resolved.sessionGeneration
        )
      ) {
        throw new AppApiError({
          message: 'Phiên đăng nhập đã thay đổi, thao tác cũ đã bị hủy.',
          code: 'SESSION_USER_MISMATCH',
        });
      }

      const snapshot = snapshotSpeciesFavoriteCache(qc, resolved.ownerUserId, resolved.speciesId);
      applyFavoriteFlagToCache(qc, resolved.ownerUserId, resolved.speciesId, true);
      return {
        cleanId: resolved.speciesId,
        ownerUserId: resolved.ownerUserId,
        sessionGeneration: resolved.sessionGeneration,
        snapshot,
      };
    },
    onError: async (err, _variables, context) => {
      if (!context || err.code === 'SESSION_USER_MISMATCH') {
        return;
      }
      const stillActiveOwner = await verifyActiveSessionOwner(
        context.ownerUserId,
        context.sessionGeneration,
        latestAuthRef,
        isMountedRef
      );
      if (!stillActiveOwner) {
        return;
      }
      if (err.statusCode === 409) {
        // Already favorited on server: reconcile cache to favorited instead of reverting
        applyFavoriteFlagToCache(qc, context.ownerUserId, context.cleanId, true);
        invalidateSpeciesQueries(qc, context.ownerUserId, context.cleanId);
        return;
      }
      restoreSpeciesFavoriteCache(qc, context.snapshot);
    },
    onSuccess: async (_res, variables, context) => {
      const resolved = resolveFavoriteVariables(variables, latestAuthRef.current.userId);
      const ownerUserId = context?.ownerUserId ?? resolved.ownerUserId;
      const cleanId = context?.cleanId ?? resolved.speciesId;
      const sessionGeneration = context?.sessionGeneration ?? resolved.sessionGeneration;
      if (!ownerUserId || !cleanId) {
        return;
      }
      const stillActiveOwner = await verifyActiveSessionOwner(
        ownerUserId,
        sessionGeneration,
        latestAuthRef,
        isMountedRef
      );
      if (!stillActiveOwner) {
        return;
      }
      applyFavoriteFlagToCache(qc, ownerUserId, cleanId, true);
      invalidateSpeciesQueries(qc, ownerUserId, cleanId);
    },
  });
}

export function useRemoveFavoriteMutation() {
  const qc = useQueryClient();
  const { status, user } = useAuth();
  const currentUserId = getAuthenticatedUserId(status, user);

  const latestAuthRef = useRef({ status, userId: currentUserId });
  const isMountedRef = useRef(true);

  useEffect(() => {
    latestAuthRef.current = { status, userId: currentUserId };
  }, [status, currentUserId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useMutation<
    SimpleMessageResponseDto,
    AppApiError,
    FavoriteMutationVariables,
    FavoriteMutationContext
  >({
    mutationFn: (variables) => {
      const resolved = resolveFavoriteVariables(variables, latestAuthRef.current.userId);
      if (!resolved.ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return removeFavoriteSpecies(resolved.speciesId, {
        expectedUserId: resolved.ownerUserId,
        expectedSessionGeneration: resolved.sessionGeneration,
      });
    },
    onMutate: async (variables) => {
      const resolved = resolveFavoriteVariables(variables, latestAuthRef.current.userId);
      if (!resolved.speciesId) {
        throw new AppApiError({
          message: 'Mã loài cây không hợp lệ.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          field: 'speciesId',
        });
      }
      if (!resolved.ownerUserId) {
        throw new AppApiError({
          message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
          code: 'UNAUTHENTICATED',
        });
      }
      if (
        !isHookAuthMatching(
          latestAuthRef,
          isMountedRef,
          resolved.ownerUserId,
          resolved.sessionGeneration
        )
      ) {
        throw new AppApiError({
          message: 'Phiên đăng nhập đã thay đổi, thao tác cũ đã bị hủy.',
          code: 'SESSION_USER_MISMATCH',
        });
      }

      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.species.detail(resolved.ownerUserId, resolved.speciesId) }),
        qc.cancelQueries({ queryKey: queryKeys.species.lists(resolved.ownerUserId) }),
        qc.cancelQueries({ queryKey: queryKeys.species.favoritesAll(resolved.ownerUserId) }),
      ]);

      if (
        !isHookAuthMatching(
          latestAuthRef,
          isMountedRef,
          resolved.ownerUserId,
          resolved.sessionGeneration
        )
      ) {
        throw new AppApiError({
          message: 'Phiên đăng nhập đã thay đổi, thao tác cũ đã bị hủy.',
          code: 'SESSION_USER_MISMATCH',
        });
      }

      const snapshot = snapshotSpeciesFavoriteCache(qc, resolved.ownerUserId, resolved.speciesId);
      applyFavoriteFlagToCache(qc, resolved.ownerUserId, resolved.speciesId, false);
      return {
        cleanId: resolved.speciesId,
        ownerUserId: resolved.ownerUserId,
        sessionGeneration: resolved.sessionGeneration,
        snapshot,
      };
    },
    onError: async (err, _variables, context) => {
      if (!context || err.code === 'SESSION_USER_MISMATCH') {
        return;
      }
      const stillActiveOwner = await verifyActiveSessionOwner(
        context.ownerUserId,
        context.sessionGeneration,
        latestAuthRef,
        isMountedRef
      );
      if (!stillActiveOwner) {
        return;
      }
      if (err.statusCode === 404) {
        // Favorite record already absent on server: reconcile cache to unfavorited
        applyFavoriteFlagToCache(qc, context.ownerUserId, context.cleanId, false);
        invalidateSpeciesQueries(qc, context.ownerUserId, context.cleanId);
        return;
      }
      restoreSpeciesFavoriteCache(qc, context.snapshot);
    },
    onSuccess: async (_res, variables, context) => {
      const resolved = resolveFavoriteVariables(variables, latestAuthRef.current.userId);
      const ownerUserId = context?.ownerUserId ?? resolved.ownerUserId;
      const cleanId = context?.cleanId ?? resolved.speciesId;
      const sessionGeneration = context?.sessionGeneration ?? resolved.sessionGeneration;
      if (!ownerUserId || !cleanId) {
        return;
      }
      const stillActiveOwner = await verifyActiveSessionOwner(
        ownerUserId,
        sessionGeneration,
        latestAuthRef,
        isMountedRef
      );
      if (!stillActiveOwner) {
        return;
      }
      applyFavoriteFlagToCache(qc, ownerUserId, cleanId, false);
      invalidateSpeciesQueries(qc, ownerUserId, cleanId);
    },
  });
}

export function useFavoriteToggle() {
  const { status, user } = useAuth();
  const currentUserId = getAuthenticatedUserId(status, user);

  const latestAuthRef = useRef({ status, userId: currentUserId });

  useEffect(() => {
    latestAuthRef.current = { status, userId: currentUserId };
  }, [status, currentUserId]);

  const addMutation = useAddFavoriteMutation();
  const removeMutation = useRemoveFavoriteMutation();
  const { isAnyPending, activeSpeciesId, isSpeciesPending } = useFavoritePendingState();

  // Immediately clear any favorite lock owned by a previous/ended session
  useEffect(() => {
    if (
      activeFavoriteOp &&
      (status !== 'authenticated' || !currentUserId || activeFavoriteOp.userId !== currentUserId)
    ) {
      clearActiveFavoriteOp();
    }
  }, [status, currentUserId]);

  const toggleFavorite = useCallback(
    (speciesId: string, currentlyFavorited: boolean): Promise<SimpleMessageResponseDto> => {
      const cleanId = speciesId.trim();
      if (!cleanId) {
        return Promise.reject(
          new AppApiError({
            message: 'Mã loài cây không hợp lệ.',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            field: 'speciesId',
          })
        );
      }

      const authSnapshot = latestAuthRef.current;
      if (authSnapshot.status !== 'authenticated' || !authSnapshot.userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      const ownerUserId = authSnapshot.userId;

      if (activeFavoriteOp && activeFavoriteOp.userId !== ownerUserId) {
        clearActiveFavoriteOp();
      }

      if (activeFavoriteOp) {
        if (activeFavoriteOp.speciesId === cleanId) {
          return activeFavoriteOp.promise;
        }
        return Promise.reject(
          new AppApiError({
            message: 'Đang xử lý một thao tác yêu thích khác. Vui lòng đợi hoàn tất.',
            code: 'FAVORITE_OPERATION_IN_PROGRESS',
          })
        );
      }

      const myToken = ++nextFavoriteOpToken;
      const sessionGeneration = getSessionGeneration();
      const variables: ScopedFavoriteVariables = {
        speciesId: cleanId,
        ownerUserId,
        sessionGeneration,
      };

      const opPromise = (
        currentlyFavorited
          ? removeMutation.mutateAsync(variables)
          : addMutation.mutateAsync(variables)
      ).finally(() => {
        if (activeFavoriteOp?.opToken === myToken) {
          activeFavoriteOp = null;
          notifyPendingListeners();
        }
      });

      activeFavoriteOp = {
        opToken: myToken,
        userId: ownerUserId,
        speciesId: cleanId,
        promise: opPromise,
      };
      notifyPendingListeners();
      return opPromise;
    },
    [addMutation, removeMutation]
  );

  return {
    toggleFavorite,
    isSpeciesPending,
    isAnyFavoritePending: isAnyPending,
    activeFavoriteSpeciesId: activeSpeciesId,
    isPending: isAnyPending || addMutation.isPending || removeMutation.isPending,
  };
}
