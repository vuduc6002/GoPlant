import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type PlaceholderDataFunction,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import type { GardenDetailDto, GardenSummaryDto } from '@/features/gardens/gardenTypes';
import type { TodayScheduleItemDto } from '@/features/schedule/scheduleTypes';
import { AppApiError } from '@/services/api/apiError';
import type { PageResponse, SimpleMessageResponseDto } from '@/services/api/apiTypes';
import { getSession, getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys, type UserPlantListQueryKeyParams } from '@/services/query/queryKeys';
import {
  createPlant,
  deletePlant,
  getMyPlants,
  getPlantDetail,
  normalizeUserPlantListParams,
  updatePlant,
} from './plantApi';
import type {
  CreateUserPlantRequestDto,
  UpdateUserPlantRequestDto,
  UserPlantDetailDto,
  UserPlantListParams,
  UserPlantSummaryDto,
} from './plantTypes';

const UNAUTHENTICATED_CACHE_OWNER = '__unauthenticated__';

interface PlantMutationContext {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface CreatePlantVariables {
  gardenId: string;
  request: CreateUserPlantRequestDto;
}

interface ScopedCreatePlantVariables extends CreatePlantVariables {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface UpdatePlantVariables {
  plantId: string;
  data: UpdateUserPlantRequestDto;
}

interface ScopedUpdatePlantVariables extends UpdatePlantVariables {
  ownerUserId: string;
  sessionGeneration: number;
}

interface ScopedDeletePlantVariables {
  plantId: string;
  ownerUserId: string;
  sessionGeneration: number;
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

function isPlantMutationOwnedByCurrentSession(
  variables: Partial<PlantMutationContext> | undefined,
  currentUserId: string
): boolean {
  if (!variables) {
    return true;
  }
  const activeGeneration = getSessionGeneration();
  if (
    typeof variables.sessionGeneration === 'number' &&
    variables.sessionGeneration !== activeGeneration
  ) {
    return false;
  }
  const owner = variables.ownerUserId ?? '';
  if (owner) {
    return owner === currentUserId;
  }
  return !currentUserId;
}

function getSessionScopedPlantMutationFields<
  TData,
  TVariables extends Partial<PlantMutationContext>,
>(
  mutation: {
    status: 'idle' | 'pending' | 'success' | 'error';
    isIdle: boolean;
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    data: TData | undefined;
    error: AppApiError | null;
    variables: TVariables | undefined;
  },
  currentUserId: string
) {
  const belongsToSession = isPlantMutationOwnedByCurrentSession(
    mutation.variables,
    currentUserId
  );
  return {
    status: belongsToSession ? mutation.status : ('idle' as const),
    isIdle: belongsToSession ? mutation.isIdle : true,
    isPending: belongsToSession ? mutation.isPending : false,
    isSuccess: belongsToSession ? mutation.isSuccess : false,
    isError: belongsToSession ? mutation.isError : false,
    data: belongsToSession ? mutation.data : undefined,
    error: belongsToSession ? mutation.error : null,
    variables: belongsToSession ? mutation.variables : undefined,
  };
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

async function verifyActiveSessionOwner(
  ownerUserId: string,
  expectedGeneration: number,
  latestAuthRef: MutableRefObject<{ status: string; userId: string }>,
  isMountedRef: MutableRefObject<boolean>
): Promise<boolean> {
  if (!ownerUserId) {
    return false;
  }
  if (!isHookAuthMatching(latestAuthRef, isMountedRef, ownerUserId, expectedGeneration)) {
    return false;
  }
  const session = await getSession().catch(() => null);
  if (!session || session.user?.id !== ownerUserId) {
    return false;
  }
  return isHookAuthMatching(latestAuthRef, isMountedRef, ownerUserId, expectedGeneration);
}

function useOwnerScopedPlaceholderData<TData>(
  cacheOwnerId: string,
  enabled: boolean
): PlaceholderDataFunction<TData, AppApiError, TData, QueryKey> | undefined {
  const placeholderDataFn = useCallback<
    PlaceholderDataFunction<TData, AppApiError, TData, QueryKey>
  >(
    (previousData, previousQuery) => {
      if (!cacheOwnerId || cacheOwnerId === UNAUTHENTICATED_CACHE_OWNER) {
        return undefined;
      }
      const previousOwnerId = Array.isArray(previousQuery?.queryKey)
        ? previousQuery.queryKey[1]
        : undefined;
      return typeof previousOwnerId === 'string' && previousOwnerId === cacheOwnerId
        ? previousData
        : undefined;
    },
    [cacheOwnerId]
  );

  if (!enabled || !cacheOwnerId || cacheOwnerId === UNAUTHENTICATED_CACHE_OWNER) {
    return undefined;
  }
  return placeholderDataFn;
}

function toUserPlantSummary(detail: UserPlantDetailDto): UserPlantSummaryDto {
  return {
    id: detail.id,
    displayName: detail.displayName,
    speciesName: detail.species?.commonName ?? null,
    scientificName: detail.species?.scientificName ?? null,
    category: detail.species?.category ?? null,
    gardenName: detail.garden?.name ?? null,
    healthStatus: detail.healthStatus,
    imageUrl: detail.imageUrl,
    createdAt: detail.createdAt,
  };
}

function isUnfilteredListKey(queryKey: QueryKey): boolean {
  if (!Array.isArray(queryKey) || queryKey.length < 4) {
    return false;
  }
  const params = queryKey[3] as Partial<UserPlantListQueryKeyParams> | undefined;
  if (!params || typeof params !== 'object') {
    return false;
  }
  return (
    !params.keyword &&
    !params.gardenId &&
    !params.healthStatus &&
    params.page === 0 &&
    params.sort === 'createdAt,desc'
  );
}

export function useUserPlantsList(
  params?: UserPlantListParams,
  options?: { enabled?: boolean; keepPreviousData?: boolean }
) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const normalized = normalizeUserPlantListParams(params);
  const placeholderData = useOwnerScopedPlaceholderData<PageResponse<UserPlantSummaryDto>>(
    cacheOwnerId,
    options?.keepPreviousData !== false
  );

  return useQuery<PageResponse<UserPlantSummaryDto>, AppApiError>({
    queryKey: queryKeys.plants.list(cacheOwnerId, normalized),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getMyPlants(normalized, {
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled: status === 'authenticated' && Boolean(userId) && (options?.enabled ?? true),
    placeholderData,
  });
}

export function useUserPlantDetail(plantId?: string, options?: { enabled?: boolean }) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanId = plantId?.trim() ?? '';

  return useQuery<UserPlantDetailDto, AppApiError>({
    queryKey: queryKeys.plants.detail(cacheOwnerId, cleanId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getPlantDetail(cleanId, {
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

export function useCreatePlantMutation() {
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

  const mutation = useMutation<
    UserPlantDetailDto,
    AppApiError,
    ScopedCreatePlantVariables,
    PlantMutationContext
  >({
    mutationFn: ({ gardenId, request, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return createPlant(gardenId, request, {
        expectedUserId: ownerUserId,
        expectedSessionGeneration: sessionGeneration,
      });
    },
    onMutate: (vars) => ({
      ownerUserId: vars.ownerUserId,
      sessionGeneration: vars.sessionGeneration,
    }),
    onSuccess: async (created, vars, context) => {
      const ownerUserId = context?.ownerUserId ?? vars.ownerUserId;
      const sessionGeneration = context?.sessionGeneration ?? vars.sessionGeneration;
      const stillActiveOwner = await verifyActiveSessionOwner(
        ownerUserId,
        sessionGeneration,
        latestAuthRef,
        isMountedRef
      );
      if (!stillActiveOwner) {
        return;
      }

      qc.setQueryData<UserPlantDetailDto>(
        queryKeys.plants.detail(ownerUserId, created.id),
        created
      );

      const summary = toUserPlantSummary(created);
      const listEntries = qc.getQueriesData<PageResponse<UserPlantSummaryDto>>({
        queryKey: queryKeys.plants.lists(ownerUserId),
      });
      for (const [key, pageData] of listEntries) {
        if (!pageData || !Array.isArray(pageData.content)) continue;
        if (isUnfilteredListKey(key)) {
          const withoutDuplicate = pageData.content.filter((item) => item.id !== created.id);
          const safeSize = pageData.size > 0 ? pageData.size : 20;
          const nextContent = [summary, ...withoutDuplicate].slice(0, safeSize);
          const nextTotalElements =
            withoutDuplicate.length < pageData.content.length
              ? pageData.totalElements
              : pageData.totalElements + 1;
          const nextTotalPages = Math.max(1, Math.ceil(nextTotalElements / safeSize));
          qc.setQueryData<PageResponse<UserPlantSummaryDto>>(key, {
            ...pageData,
            content: nextContent,
            totalElements: nextTotalElements,
            totalPages: nextTotalPages,
            last: pageData.page + 1 >= nextTotalPages,
          });
        }
      }

      const targetGardenId = created.garden?.id ?? vars.gardenId.trim();
      if (targetGardenId) {
        qc.setQueryData<GardenDetailDto>(
          queryKeys.gardens.detail(ownerUserId, targetGardenId),
          (old) => {
            if (!old) return old;
            const filtered = old.plants.filter((p) => p.id !== created.id);
            return {
              ...old,
              plants: [
                ...filtered,
                {
                  id: created.id,
                  displayName: created.displayName,
                  speciesName: created.species?.commonName ?? null,
                  scientificName: created.species?.scientificName ?? null,
                  category: created.species?.category ?? null,
                  healthStatus: created.healthStatus,
                  imageUrl: created.imageUrl,
                },
              ],
            };
          }
        );
        qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(ownerUserId), (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((g) =>
            g.id === targetGardenId ? { ...g, plantCount: g.plantCount + 1 } : g
          );
        });
      }

      qc.invalidateQueries({ queryKey: queryKeys.plants.lists(ownerUserId) });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.all(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: CreatePlantVariables) => {
      void resolveMutationSessionOwner(latestAuthRef)
        .then(({ ownerUserId, sessionGeneration }) => {
          rawMutate({
            ...variables,
            ownerUserId,
            sessionGeneration,
          });
        })
        .catch(() => {
          rawMutate({
            ...variables,
            ownerUserId: '',
            sessionGeneration: getSessionGeneration(),
          });
        });
    },
    [rawMutate]
  );

  const mutateAsync = useCallback(
    async (variables: CreatePlantVariables): Promise<UserPlantDetailDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        ...variables,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  const scopedFields = getSessionScopedPlantMutationFields(mutation, currentUserId);

  return {
    ...mutation,
    ...scopedFields,
    mutate,
    mutateAsync,
  };
}

export function useUpdatePlantMutation() {
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

  const mutation = useMutation<
    UserPlantDetailDto,
    AppApiError,
    ScopedUpdatePlantVariables,
    PlantMutationContext
  >({
    mutationFn: ({ plantId, data, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return updatePlant(plantId, data, {
        expectedUserId: ownerUserId,
        expectedSessionGeneration: sessionGeneration,
      });
    },
    onMutate: (vars) => ({
      ownerUserId: vars.ownerUserId,
      sessionGeneration: vars.sessionGeneration,
    }),
    onSuccess: async (updated, vars, context) => {
      const ownerUserId = context?.ownerUserId ?? vars.ownerUserId;
      const sessionGeneration = context?.sessionGeneration ?? vars.sessionGeneration;
      const stillActiveOwner = await verifyActiveSessionOwner(
        ownerUserId,
        sessionGeneration,
        latestAuthRef,
        isMountedRef
      );
      if (!stillActiveOwner) {
        return;
      }

      qc.setQueryData<UserPlantDetailDto>(
        queryKeys.plants.detail(ownerUserId, updated.id),
        updated
      );

      const summary = toUserPlantSummary(updated);
      qc.setQueriesData<PageResponse<UserPlantSummaryDto>>(
        { queryKey: queryKeys.plants.lists(ownerUserId) },
        (old) => {
          if (!old || !Array.isArray(old.content)) return old;
          let changed = false;
          const nextContent = old.content.map((item) => {
            if (item.id === updated.id) {
              changed = true;
              return summary;
            }
            return item;
          });
          return changed ? { ...old, content: nextContent } : old;
        }
      );

      if (updated.garden?.id) {
        qc.setQueryData<GardenDetailDto>(
          queryKeys.gardens.detail(ownerUserId, updated.garden.id),
          (old) => {
            if (!old) return old;
            let changed = false;
            const nextPlants = old.plants.map((plant) => {
              if (plant.id === updated.id) {
                changed = true;
                return {
                  ...plant,
                  displayName: updated.displayName,
                  healthStatus: updated.healthStatus,
                  imageUrl: updated.imageUrl,
                };
              }
              return plant;
            });
            return changed ? { ...old, plants: nextPlants } : old;
          }
        );
      }

      qc.invalidateQueries({ queryKey: queryKeys.plants.lists(ownerUserId) });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.all(ownerUserId) });
      qc.invalidateQueries({ queryKey: queryKeys.plants.schedulesBase(ownerUserId, updated.id) });
      qc.invalidateQueries({ queryKey: queryKeys.schedules.today(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: UpdatePlantVariables) => {
      void resolveMutationSessionOwner(latestAuthRef)
        .then(({ ownerUserId, sessionGeneration }) => {
          rawMutate({
            ...variables,
            ownerUserId,
            sessionGeneration,
          });
        })
        .catch(() => {
          rawMutate({
            ...variables,
            ownerUserId: '',
            sessionGeneration: getSessionGeneration(),
          });
        });
    },
    [rawMutate]
  );

  const mutateAsync = useCallback(
    async (variables: UpdatePlantVariables): Promise<UserPlantDetailDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        ...variables,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  const scopedFields = getSessionScopedPlantMutationFields(mutation, currentUserId);

  return {
    ...mutation,
    ...scopedFields,
    mutate,
    mutateAsync,
  };
}

export function useDeletePlantMutation() {
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

  const mutation = useMutation<
    SimpleMessageResponseDto,
    AppApiError,
    ScopedDeletePlantVariables,
    PlantMutationContext
  >({
    mutationFn: ({ plantId, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return deletePlant(plantId, {
        expectedUserId: ownerUserId,
        expectedSessionGeneration: sessionGeneration,
      });
    },
    onMutate: (vars) => ({
      ownerUserId: vars.ownerUserId,
      sessionGeneration: vars.sessionGeneration,
    }),
    onSuccess: async (_res, vars, context) => {
      const ownerUserId = context?.ownerUserId ?? vars.ownerUserId;
      const sessionGeneration = context?.sessionGeneration ?? vars.sessionGeneration;
      const stillActiveOwner = await verifyActiveSessionOwner(
        ownerUserId,
        sessionGeneration,
        latestAuthRef,
        isMountedRef
      );
      if (!stillActiveOwner) {
        return;
      }

      const cleanId = vars.plantId.trim();
      const cachedDetail = qc.getQueryData<UserPlantDetailDto>(
        queryKeys.plants.detail(ownerUserId, cleanId)
      );

      await qc.cancelQueries({
        queryKey: queryKeys.plants.schedulesBase(ownerUserId, cleanId),
      });
      qc.removeQueries({
        queryKey: queryKeys.plants.schedulesBase(ownerUserId, cleanId),
      });
      await qc.cancelQueries({
        queryKey: queryKeys.plants.detail(ownerUserId, cleanId),
        exact: true,
      });
      qc.removeQueries({
        queryKey: queryKeys.plants.detail(ownerUserId, cleanId),
        exact: true,
      });

      qc.setQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(ownerUserId), (old) =>
        Array.isArray(old) ? old.filter((item) => item.plantId !== cleanId) : old
      );

      qc.setQueriesData<PageResponse<UserPlantSummaryDto>>(
        { queryKey: queryKeys.plants.lists(ownerUserId) },
        (old) => {
          if (!old || !Array.isArray(old.content)) return old;
          const filtered = old.content.filter((item) => item.id !== cleanId);
          if (filtered.length === old.content.length) return old;
          const nextTotalElements = Math.max(0, old.totalElements - 1);
          const safeSize = old.size > 0 ? old.size : 20;
          const nextTotalPages =
            nextTotalElements === 0 ? 0 : Math.ceil(nextTotalElements / safeSize);
          return {
            ...old,
            content: filtered,
            totalElements: nextTotalElements,
            totalPages: nextTotalPages,
            last: old.page + 1 >= nextTotalPages,
          };
        }
      );

      let affectedGardenId = cachedDetail?.garden?.id;
      const gardenEntries = qc.getQueriesData<GardenDetailDto | GardenSummaryDto[]>({
        queryKey: queryKeys.gardens.all(ownerUserId),
      });
      for (const [key, entry] of gardenEntries) {
        if (!entry || Array.isArray(entry) || !Array.isArray(entry.plants)) continue;
        if (entry.plants.some((p) => p.id === cleanId)) {
          affectedGardenId = affectedGardenId ?? entry.id;
          qc.setQueryData<GardenDetailDto>(key, {
            ...entry,
            plants: entry.plants.filter((p) => p.id !== cleanId),
          });
        }
      }

      qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(ownerUserId), (old) => {
        if (!Array.isArray(old)) return old;
        if (!affectedGardenId) return old;
        return old.map((g) =>
          g.id === affectedGardenId
            ? { ...g, plantCount: Math.max(0, g.plantCount - 1) }
            : g
        );
      });

      qc.invalidateQueries({ queryKey: queryKeys.plants.lists(ownerUserId) });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.all(ownerUserId) });
      qc.invalidateQueries({ queryKey: queryKeys.schedules.today(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (plantId: string) => {
      void resolveMutationSessionOwner(latestAuthRef)
        .then(({ ownerUserId, sessionGeneration }) => {
          rawMutate({
            plantId,
            ownerUserId,
            sessionGeneration,
          });
        })
        .catch(() => {
          rawMutate({
            plantId,
            ownerUserId: '',
            sessionGeneration: getSessionGeneration(),
          });
        });
    },
    [rawMutate]
  );

  const mutateAsync = useCallback(
    async (plantId: string): Promise<SimpleMessageResponseDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        plantId,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  const scopedFields = getSessionScopedPlantMutationFields(mutation, currentUserId);

  return {
    ...mutation,
    ...scopedFields,
    mutate,
    mutateAsync,
  };
}
