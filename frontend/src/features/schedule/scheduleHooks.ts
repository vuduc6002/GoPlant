import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type PlaceholderDataFunction,
  type Query,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import type { PageResponse, SimpleMessageResponseDto } from '@/services/api/apiTypes';
import { getSession, getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import {
  completeSchedule,
  createSchedule,
  deleteSchedule,
  getPlantSchedules,
  getTodaySchedules,
  getTodayVnDateString,
  getVnDateKeyFromIso,
  normalizePlantScheduleListParams,
  skipSchedule,
  updateSchedule,
} from './scheduleApi';
import type {
  CareScheduleDto,
  CompleteScheduleRequestDto,
  CompleteScheduleResponseDto,
  CreateScheduleRequestDto,
  PlantScheduleListParams,
  ScheduleStatus,
  SkipScheduleRequestDto,
  TodayScheduleItemDto,
  UpdateScheduleRequestDto,
} from './scheduleTypes';

const UNAUTHENTICATED_CACHE_OWNER = '__unauthenticated__';

interface ScheduleMutationContext {
  ownerUserId: string;
  sessionGeneration: number;
}

interface ScopedCreateScheduleVariables {
  request: CreateScheduleRequestDto;
  ownerUserId: string;
  sessionGeneration: number;
}

export interface UpdateScheduleVariables {
  scheduleId: string;
  plantId?: string;
  data: UpdateScheduleRequestDto;
}

interface ScopedUpdateScheduleVariables extends UpdateScheduleVariables {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface DeleteScheduleVariables {
  scheduleId: string;
  plantId?: string;
}

interface ScopedDeleteScheduleVariables extends DeleteScheduleVariables {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface CompleteScheduleVariables {
  scheduleId: string;
  plantId?: string;
  data?: CompleteScheduleRequestDto;
}

interface ScopedCompleteScheduleVariables extends CompleteScheduleVariables {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface SkipScheduleVariables {
  scheduleId: string;
  plantId?: string;
  data?: SkipScheduleRequestDto;
}

interface ScopedSkipScheduleVariables extends SkipScheduleVariables {
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

function isMutationOwnedByCurrentSession(
  variables: Partial<ScheduleMutationContext> | undefined,
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

function getSessionScopedMutationFields<
  TData,
  TVariables extends Partial<ScheduleMutationContext>,
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
  const belongsToSession = isMutationOwnedByCurrentSession(mutation.variables, currentUserId);
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

function useOwnerAndPlantScopedPlaceholderData<TData>(
  cacheOwnerId: string,
  plantId: string,
  enabled: boolean
): PlaceholderDataFunction<TData, AppApiError, TData, QueryKey> | undefined {
  const placeholderDataFn = useCallback<
    PlaceholderDataFunction<TData, AppApiError, TData, QueryKey>
  >(
    (previousData, previousQuery) => {
      if (!cacheOwnerId || cacheOwnerId === UNAUTHENTICATED_CACHE_OWNER || !plantId) {
        return undefined;
      }
      const key = previousQuery?.queryKey;
      const previousOwnerId = Array.isArray(key) ? key[1] : undefined;
      const previousPlantId = Array.isArray(key) ? key[3] : undefined;
      return typeof previousOwnerId === 'string' &&
        previousOwnerId === cacheOwnerId &&
        typeof previousPlantId === 'string' &&
        previousPlantId === plantId
        ? previousData
        : undefined;
    },
    [cacheOwnerId, plantId]
  );

  if (!enabled || !cacheOwnerId || cacheOwnerId === UNAUTHENTICATED_CACHE_OWNER || !plantId) {
    return undefined;
  }
  return placeholderDataFn;
}

function isOwnerPlantScheduleQuery(
  query: Query,
  ownerUserId: string,
  plantId?: string
): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length < 5) {
    return false;
  }
  if (key[0] !== 'plants' || key[1] !== ownerUserId || key[2] !== 'detail' || key[4] !== 'schedules') {
    return false;
  }
  if (plantId) {
    return key[3] === plantId;
  }
  return true;
}

function getQueryFilterStatus(queryKey: QueryKey): ScheduleStatus | undefined {
  if (!Array.isArray(queryKey) || queryKey.length < 6) {
    return undefined;
  }
  const params = queryKey[5] as { status?: ScheduleStatus } | undefined;
  return params?.status;
}

function patchScheduleInPlantCaches(
  qc: ReturnType<typeof useQueryClient>,
  ownerUserId: string,
  updatedSchedule: CareScheduleDto
): void {
  const entries = qc.getQueriesData<PageResponse<CareScheduleDto>>({
    predicate: (query) =>
      isOwnerPlantScheduleQuery(query, ownerUserId, updatedSchedule.userPlantId),
  });

  for (const [key, pageData] of entries) {
    if (!pageData || !Array.isArray(pageData.content)) continue;
    const filterStatus = getQueryFilterStatus(key);
    const hasItem = pageData.content.some((item) => item.id === updatedSchedule.id);
    if (!hasItem) continue;

    if (filterStatus && updatedSchedule.status !== filterStatus) {
      const nextContent = pageData.content.filter((item) => item.id !== updatedSchedule.id);
      const nextTotalElements = Math.max(0, pageData.totalElements - 1);
      const safeSize = pageData.size > 0 ? pageData.size : 20;
      const nextTotalPages =
        nextTotalElements === 0 ? 0 : Math.ceil(nextTotalElements / safeSize);
      qc.setQueryData<PageResponse<CareScheduleDto>>(key, {
        ...pageData,
        content: nextContent,
        totalElements: nextTotalElements,
        totalPages: nextTotalPages,
        last: pageData.page + 1 >= nextTotalPages,
      });
    } else {
      qc.setQueryData<PageResponse<CareScheduleDto>>(key, {
        ...pageData,
        content: pageData.content.map((item) =>
          item.id === updatedSchedule.id ? updatedSchedule : item
        ),
      });
    }
  }
}

function removeScheduleFromPlantCaches(
  qc: ReturnType<typeof useQueryClient>,
  ownerUserId: string,
  scheduleId: string,
  plantId?: string
): void {
  const entries = qc.getQueriesData<PageResponse<CareScheduleDto>>({
    predicate: (query) => isOwnerPlantScheduleQuery(query, ownerUserId, plantId),
  });

  for (const [key, pageData] of entries) {
    if (!pageData || !Array.isArray(pageData.content)) continue;
    const nextContent = pageData.content.filter((item) => item.id !== scheduleId);
    if (nextContent.length === pageData.content.length) continue;

    const nextTotalElements = Math.max(0, pageData.totalElements - 1);
    const safeSize = pageData.size > 0 ? pageData.size : 20;
    const nextTotalPages =
      nextTotalElements === 0 ? 0 : Math.ceil(nextTotalElements / safeSize);
    qc.setQueryData<PageResponse<CareScheduleDto>>(key, {
      ...pageData,
      content: nextContent,
      totalElements: nextTotalElements,
      totalPages: nextTotalPages,
      last: pageData.page + 1 >= nextTotalPages,
    });
  }
}

function syncCompletedOrSkippedScheduleInCaches(
  qc: ReturnType<typeof useQueryClient>,
  ownerUserId: string,
  scheduleId: string,
  result: CompleteScheduleResponseDto,
  plantId?: string
): void {
  const nextStatus = result.scheduleStatus as ScheduleStatus;
  const todayVn = getTodayVnDateString();
  const nextDateKey = getVnDateKeyFromIso(result.nextScheduledAt);

  qc.setQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(ownerUserId), (old) => {
    if (!Array.isArray(old)) return old;
    const staysToday =
      nextStatus === 'ACTIVE' &&
      Boolean(result.nextScheduledAt) &&
      nextDateKey !== null &&
      nextDateKey <= todayVn;

    if (!staysToday) {
      return old.filter((item) => item.scheduleId !== scheduleId);
    }

    return old.map((item) =>
      item.scheduleId === scheduleId
        ? {
            ...item,
            status: nextStatus,
            nextScheduledAt: result.nextScheduledAt ?? item.nextScheduledAt,
            isOverdue: false,
          }
        : item
    );
  });

  const entries = qc.getQueriesData<PageResponse<CareScheduleDto>>({
    predicate: (query) => isOwnerPlantScheduleQuery(query, ownerUserId, plantId),
  });

  for (const [key, pageData] of entries) {
    if (!pageData || !Array.isArray(pageData.content)) continue;
    const filterStatus = getQueryFilterStatus(key);
    const targetItem = pageData.content.find((item) => item.id === scheduleId);
    if (!targetItem) continue;

    if (filterStatus && nextStatus !== filterStatus) {
      const nextContent = pageData.content.filter((item) => item.id !== scheduleId);
      const nextTotalElements = Math.max(0, pageData.totalElements - 1);
      const safeSize = pageData.size > 0 ? pageData.size : 20;
      const nextTotalPages =
        nextTotalElements === 0 ? 0 : Math.ceil(nextTotalElements / safeSize);
      qc.setQueryData<PageResponse<CareScheduleDto>>(key, {
        ...pageData,
        content: nextContent,
        totalElements: nextTotalElements,
        totalPages: nextTotalPages,
        last: pageData.page + 1 >= nextTotalPages,
      });
    } else {
      qc.setQueryData<PageResponse<CareScheduleDto>>(key, {
        ...pageData,
        content: pageData.content.map((item) =>
          item.id === scheduleId
            ? {
                ...item,
                status: nextStatus,
                nextScheduledAt: result.nextScheduledAt ?? item.nextScheduledAt,
                isOverdue: false,
              }
            : item
        ),
      });
    }
  }
}

export function useTodaySchedules(options?: { enabled?: boolean }) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;

  return useQuery<TodayScheduleItemDto[], AppApiError>({
    queryKey: queryKeys.schedules.today(cacheOwnerId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getTodaySchedules({
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled: status === 'authenticated' && Boolean(userId) && (options?.enabled ?? true),
  });
}

export function usePlantSchedules(
  plantId?: string,
  params?: PlantScheduleListParams,
  options?: { enabled?: boolean; keepPreviousData?: boolean }
) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanId = plantId?.trim() ?? '';
  const normalized = normalizePlantScheduleListParams(params);
  const placeholderData = useOwnerAndPlantScopedPlaceholderData<PageResponse<CareScheduleDto>>(
    cacheOwnerId,
    cleanId,
    options?.keepPreviousData !== false
  );

  return useQuery<PageResponse<CareScheduleDto>, AppApiError>({
    queryKey: queryKeys.plants.schedules(cacheOwnerId, cleanId, normalized),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getPlantSchedules(cleanId, normalized, {
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled:
      status === 'authenticated' &&
      Boolean(userId) &&
      Boolean(cleanId) &&
      (options?.enabled ?? true),
    placeholderData,
  });
}

export function useCreateScheduleMutation() {
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
    CareScheduleDto,
    AppApiError,
    ScopedCreateScheduleVariables,
    ScheduleMutationContext
  >({
    mutationFn: ({ request, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return createSchedule(request, {
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

      const entries = qc.getQueriesData<PageResponse<CareScheduleDto>>({
        queryKey: queryKeys.plants.schedulesBase(ownerUserId, created.userPlantId),
      });
      for (const [key, pageData] of entries) {
        if (!pageData || !Array.isArray(pageData.content)) continue;
        const filterStatus = getQueryFilterStatus(key);
        if (pageData.page === 0 && (!filterStatus || filterStatus === created.status)) {
          const withoutDup = pageData.content.filter((item) => item.id !== created.id);
          const safeSize = pageData.size > 0 ? pageData.size : 20;
          const nextContent = [created, ...withoutDup].slice(0, safeSize);
          const nextTotalElements =
            withoutDup.length < pageData.content.length
              ? pageData.totalElements
              : pageData.totalElements + 1;
          const nextTotalPages = Math.max(1, Math.ceil(nextTotalElements / safeSize));
          qc.setQueryData<PageResponse<CareScheduleDto>>(key, {
            ...pageData,
            content: nextContent,
            totalElements: nextTotalElements,
            totalPages: nextTotalPages,
            last: pageData.page + 1 >= nextTotalPages,
          });
        }
      }

      qc.invalidateQueries({
        queryKey: queryKeys.plants.schedulesBase(ownerUserId, created.userPlantId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.schedules.today(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (request: CreateScheduleRequestDto) => {
      void resolveMutationSessionOwner(latestAuthRef)
        .then(({ ownerUserId, sessionGeneration }) => {
          rawMutate({
            request,
            ownerUserId,
            sessionGeneration,
          });
        })
        .catch(() => {
          rawMutate({
            request,
            ownerUserId: '',
            sessionGeneration: getSessionGeneration(),
          });
        });
    },
    [rawMutate]
  );

  const mutateAsync = useCallback(
    async (request: CreateScheduleRequestDto): Promise<CareScheduleDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        request,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  const scopedFields = getSessionScopedMutationFields(mutation, currentUserId);

  return {
    ...mutation,
    ...scopedFields,
    mutate,
    mutateAsync,
  };
}

export function useUpdateScheduleMutation() {
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
    CareScheduleDto,
    AppApiError,
    ScopedUpdateScheduleVariables,
    ScheduleMutationContext
  >({
    mutationFn: ({ scheduleId, data, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return updateSchedule(scheduleId, data, {
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

      patchScheduleInPlantCaches(qc, ownerUserId, updated);

      qc.setQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(ownerUserId), (old) => {
        if (!Array.isArray(old)) return old;
        if (updated.status !== 'ACTIVE') {
          return old.filter((item) => item.scheduleId !== updated.id);
        }
        return old.map((item) =>
          item.scheduleId === updated.id
            ? {
                ...item,
                taskType: updated.taskType,
                taskLabel: updated.taskLabel,
                nextScheduledAt: updated.nextScheduledAt,
                isOverdue: updated.isOverdue,
                status: updated.status,
              }
            : item
        );
      });

      const targetPlantId = updated.userPlantId || vars.plantId?.trim() || '';
      if (targetPlantId) {
        qc.invalidateQueries({
          queryKey: queryKeys.plants.schedulesBase(ownerUserId, targetPlantId),
        });
      } else {
        qc.invalidateQueries({
          predicate: (query) => isOwnerPlantScheduleQuery(query, ownerUserId),
        });
      }
      qc.invalidateQueries({ queryKey: queryKeys.schedules.today(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: UpdateScheduleVariables) => {
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
    async (variables: UpdateScheduleVariables): Promise<CareScheduleDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        ...variables,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  const scopedFields = getSessionScopedMutationFields(mutation, currentUserId);

  return {
    ...mutation,
    ...scopedFields,
    mutate,
    mutateAsync,
  };
}

export function useDeleteScheduleMutation() {
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
    ScopedDeleteScheduleVariables,
    ScheduleMutationContext
  >({
    mutationFn: ({ scheduleId, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return deleteSchedule(scheduleId, {
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

      const cleanId = vars.scheduleId.trim();
      const targetPlantId = vars.plantId?.trim() || undefined;

      qc.setQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(ownerUserId), (old) =>
        Array.isArray(old) ? old.filter((item) => item.scheduleId !== cleanId) : old
      );

      removeScheduleFromPlantCaches(qc, ownerUserId, cleanId, targetPlantId);

      qc.invalidateQueries({ queryKey: queryKeys.schedules.today(ownerUserId) });
      if (targetPlantId) {
        qc.invalidateQueries({
          queryKey: queryKeys.plants.schedulesBase(ownerUserId, targetPlantId),
        });
      } else {
        qc.invalidateQueries({
          predicate: (query) => isOwnerPlantScheduleQuery(query, ownerUserId),
        });
      }
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: DeleteScheduleVariables) => {
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
    async (variables: DeleteScheduleVariables): Promise<SimpleMessageResponseDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        ...variables,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  const scopedFields = getSessionScopedMutationFields(mutation, currentUserId);

  return {
    ...mutation,
    ...scopedFields,
    mutate,
    mutateAsync,
  };
}

export function useCompleteScheduleMutation() {
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
    CompleteScheduleResponseDto,
    AppApiError,
    ScopedCompleteScheduleVariables,
    ScheduleMutationContext
  >({
    mutationFn: ({ scheduleId, data, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return completeSchedule(scheduleId, data, {
        expectedUserId: ownerUserId,
        expectedSessionGeneration: sessionGeneration,
      });
    },
    onMutate: (vars) => ({
      ownerUserId: vars.ownerUserId,
      sessionGeneration: vars.sessionGeneration,
    }),
    onSuccess: async (result, vars, context) => {
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

      const cleanId = vars.scheduleId.trim();
      const targetPlantId = vars.plantId?.trim() || undefined;

      syncCompletedOrSkippedScheduleInCaches(qc, ownerUserId, cleanId, result, targetPlantId);

      qc.invalidateQueries({ queryKey: queryKeys.schedules.today(ownerUserId) });
      if (targetPlantId) {
        qc.invalidateQueries({
          queryKey: queryKeys.plants.schedulesBase(ownerUserId, targetPlantId),
        });
      } else {
        qc.invalidateQueries({
          predicate: (query) => isOwnerPlantScheduleQuery(query, ownerUserId),
        });
      }
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: CompleteScheduleVariables) => {
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
    async (variables: CompleteScheduleVariables): Promise<CompleteScheduleResponseDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        ...variables,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  const scopedFields = getSessionScopedMutationFields(mutation, currentUserId);

  return {
    ...mutation,
    ...scopedFields,
    mutate,
    mutateAsync,
  };
}

export function useSkipScheduleMutation() {
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
    CompleteScheduleResponseDto,
    AppApiError,
    ScopedSkipScheduleVariables,
    ScheduleMutationContext
  >({
    mutationFn: ({ scheduleId, data, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return skipSchedule(scheduleId, data, {
        expectedUserId: ownerUserId,
        expectedSessionGeneration: sessionGeneration,
      });
    },
    onMutate: (vars) => ({
      ownerUserId: vars.ownerUserId,
      sessionGeneration: vars.sessionGeneration,
    }),
    onSuccess: async (result, vars, context) => {
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

      const cleanId = vars.scheduleId.trim();
      const targetPlantId = vars.plantId?.trim() || undefined;

      syncCompletedOrSkippedScheduleInCaches(qc, ownerUserId, cleanId, result, targetPlantId);

      qc.invalidateQueries({ queryKey: queryKeys.schedules.today(ownerUserId) });
      if (targetPlantId) {
        qc.invalidateQueries({
          queryKey: queryKeys.plants.schedulesBase(ownerUserId, targetPlantId),
        });
      } else {
        qc.invalidateQueries({
          predicate: (query) => isOwnerPlantScheduleQuery(query, ownerUserId),
        });
      }
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: SkipScheduleVariables) => {
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
    async (variables: SkipScheduleVariables): Promise<CompleteScheduleResponseDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        ...variables,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  const scopedFields = getSessionScopedMutationFields(mutation, currentUserId);

  return {
    ...mutation,
    ...scopedFields,
    mutate,
    mutateAsync,
  };
}
