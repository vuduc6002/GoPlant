import { useCallback, useSyncExternalStore } from 'react';
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

interface SpeciesCacheSnapshot {
  detailData: SpeciesDetailDto | undefined;
  listSnapshots: [QueryKey, PageResponse<SpeciesSummaryDto> | undefined][];
  favoriteSnapshots: [QueryKey, PageResponse<SpeciesSummaryDto> | undefined][];
}

// Track active per-species favorite mutations across components to prevent concurrent double taps.
const inFlightFavoriteOps = new Map<string, Promise<SimpleMessageResponseDto>>();
let pendingIdsVersion = 0;
const pendingListeners = new Set<() => void>();

function notifyPendingListeners(): void {
  pendingIdsVersion += 1;
  for (const listener of pendingListeners) {
    listener();
  }
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

export function usePendingFavoriteCheck(): (speciesId: string) => boolean {
  useSyncExternalStore(subscribePendingIds, getPendingIdsSnapshot, getPendingIdsSnapshot);
  return useCallback((speciesId: string) => {
    const cleanId = speciesId.trim();
    return Boolean(cleanId) && inFlightFavoriteOps.has(cleanId);
  }, []);
}

function snapshotSpeciesFavoriteCache(qc: QueryClient, speciesId: string): SpeciesCacheSnapshot {
  return {
    detailData: qc.getQueryData<SpeciesDetailDto>(queryKeys.species.detail(speciesId)),
    listSnapshots: qc.getQueriesData<PageResponse<SpeciesSummaryDto>>({
      queryKey: queryKeys.species.lists(),
    }),
    favoriteSnapshots: qc.getQueriesData<PageResponse<SpeciesSummaryDto>>({
      queryKey: queryKeys.species.favoritesAll,
    }),
  };
}

function restoreSpeciesFavoriteCache(
  qc: QueryClient,
  speciesId: string,
  snapshot: SpeciesCacheSnapshot | undefined
): void {
  if (!snapshot) return;

  if (snapshot.detailData !== undefined) {
    qc.setQueryData<SpeciesDetailDto>(queryKeys.species.detail(speciesId), snapshot.detailData);
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
  speciesId: string,
  isFavorited: boolean
): void {
  qc.setQueryData<SpeciesDetailDto>(queryKeys.species.detail(speciesId), (old) =>
    old ? { ...old, isFavorited } : old
  );

  qc.setQueriesData<PageResponse<SpeciesSummaryDto>>(
    { queryKey: queryKeys.species.lists() },
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
      { queryKey: queryKeys.species.favoritesAll },
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

function invalidateSpeciesQueries(qc: QueryClient, speciesId: string): void {
  qc.invalidateQueries({ queryKey: queryKeys.species.favoritesAll });
  qc.invalidateQueries({ queryKey: queryKeys.species.lists() });
  qc.invalidateQueries({ queryKey: queryKeys.species.detail(speciesId) });
}

export function useSpeciesList(
  params?: SpeciesListParams,
  options?: { enabled?: boolean; keepPreviousData?: boolean }
) {
  const { status } = useAuth();
  const normalized = normalizeSpeciesListParams(params);

  return useQuery<PageResponse<SpeciesSummaryDto>, AppApiError>({
    queryKey: queryKeys.species.list(normalized),
    queryFn: () => getSpeciesList(normalized),
    enabled: status === 'authenticated' && (options?.enabled ?? true),
    placeholderData: options?.keepPreviousData === false ? undefined : keepPreviousData,
  });
}

export function useSpeciesDetail(speciesId?: string, options?: { enabled?: boolean }) {
  const { status } = useAuth();
  const cleanId = speciesId?.trim() ?? '';

  return useQuery<SpeciesDetailDto, AppApiError>({
    queryKey: queryKeys.species.detail(cleanId),
    queryFn: () => getSpeciesDetail(cleanId),
    enabled: status === 'authenticated' && Boolean(cleanId) && (options?.enabled ?? true),
  });
}

export function useFavoriteSpecies(
  params?: FavoriteSpeciesParams,
  options?: { enabled?: boolean; keepPreviousData?: boolean }
) {
  const { status } = useAuth();
  const normalized = normalizeFavoriteSpeciesParams(params);

  return useQuery<PageResponse<SpeciesSummaryDto>, AppApiError>({
    queryKey: queryKeys.species.favorites(normalized),
    queryFn: () => getFavoriteSpecies(normalized),
    enabled: status === 'authenticated' && (options?.enabled ?? true),
    placeholderData: options?.keepPreviousData === false ? undefined : keepPreviousData,
  });
}

export function useAddFavoriteMutation() {
  const qc = useQueryClient();

  return useMutation<
    SimpleMessageResponseDto,
    AppApiError,
    string,
    { cleanId: string; snapshot: SpeciesCacheSnapshot }
  >({
    mutationFn: (speciesId: string) => addFavoriteSpecies(speciesId),
    onMutate: async (speciesId: string) => {
      const cleanId = speciesId.trim();
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.species.detail(cleanId) }),
        qc.cancelQueries({ queryKey: queryKeys.species.lists() }),
        qc.cancelQueries({ queryKey: queryKeys.species.favoritesAll }),
      ]);
      const snapshot = snapshotSpeciesFavoriteCache(qc, cleanId);
      applyFavoriteFlagToCache(qc, cleanId, true);
      return { cleanId, snapshot };
    },
    onError: (err, _speciesId, context) => {
      if (!context) return;
      if (err.statusCode === 409) {
        // Already favorited on server: reconcile cache to favorited instead of reverting
        applyFavoriteFlagToCache(qc, context.cleanId, true);
        invalidateSpeciesQueries(qc, context.cleanId);
        return;
      }
      restoreSpeciesFavoriteCache(qc, context.cleanId, context.snapshot);
    },
    onSuccess: (_res, speciesId) => {
      const cleanId = speciesId.trim();
      applyFavoriteFlagToCache(qc, cleanId, true);
      invalidateSpeciesQueries(qc, cleanId);
    },
  });
}

export function useRemoveFavoriteMutation() {
  const qc = useQueryClient();

  return useMutation<
    SimpleMessageResponseDto,
    AppApiError,
    string,
    { cleanId: string; snapshot: SpeciesCacheSnapshot }
  >({
    mutationFn: (speciesId: string) => removeFavoriteSpecies(speciesId),
    onMutate: async (speciesId: string) => {
      const cleanId = speciesId.trim();
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.species.detail(cleanId) }),
        qc.cancelQueries({ queryKey: queryKeys.species.lists() }),
        qc.cancelQueries({ queryKey: queryKeys.species.favoritesAll }),
      ]);
      const snapshot = snapshotSpeciesFavoriteCache(qc, cleanId);
      applyFavoriteFlagToCache(qc, cleanId, false);
      return { cleanId, snapshot };
    },
    onError: (err, _speciesId, context) => {
      if (!context) return;
      if (err.statusCode === 404) {
        // Favorite record already absent on server: reconcile cache to unfavorited
        applyFavoriteFlagToCache(qc, context.cleanId, false);
        invalidateSpeciesQueries(qc, context.cleanId);
        return;
      }
      restoreSpeciesFavoriteCache(qc, context.cleanId, context.snapshot);
    },
    onSuccess: (_res, speciesId) => {
      const cleanId = speciesId.trim();
      applyFavoriteFlagToCache(qc, cleanId, false);
      invalidateSpeciesQueries(qc, cleanId);
    },
  });
}

export function useFavoriteToggle() {
  const addMutation = useAddFavoriteMutation();
  const removeMutation = useRemoveFavoriteMutation();
  const isSpeciesPending = usePendingFavoriteCheck();

  const toggleFavorite = useCallback(
    async (speciesId: string, currentlyFavorited: boolean): Promise<SimpleMessageResponseDto> => {
      const cleanId = speciesId.trim();
      if (!cleanId) {
        throw new AppApiError({
          message: 'Mã loài cây không hợp lệ.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          field: 'speciesId',
        });
      }

      const existing = inFlightFavoriteOps.get(cleanId);
      if (existing) {
        return existing;
      }

      const opPromise = (
        currentlyFavorited
          ? removeMutation.mutateAsync(cleanId)
          : addMutation.mutateAsync(cleanId)
      ).finally(() => {
        inFlightFavoriteOps.delete(cleanId);
        notifyPendingListeners();
      });

      inFlightFavoriteOps.set(cleanId, opPromise);
      notifyPendingListeners();
      return opPromise;
    },
    [addMutation, removeMutation]
  );

  return {
    toggleFavorite,
    isSpeciesPending,
    isPending: addMutation.isPending || removeMutation.isPending,
  };
}
