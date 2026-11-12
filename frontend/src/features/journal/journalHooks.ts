import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type PlaceholderDataFunction,
  type Query,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import type { PageResponse, SimpleMessageResponseDto } from '@/services/api/apiTypes';
import { getSession, getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import {
  createJournal,
  deleteJournal,
  findJournalByIdFromPlantPages,
  getPlantJournals,
  normalizePlantJournalListParams,
  updateJournal,
} from './journalApi';
import type {
  CreateGrowthJournalRequestDto,
  GrowthJournalDto,
  PlantJournalListParams,
  UpdateGrowthJournalRequestDto,
} from './journalTypes';

const UNAUTHENTICATED_CACHE_OWNER = '__unauthenticated__';

interface JournalMutationContext {
  ownerUserId: string;
  sessionGeneration: number;
}

interface ScopedCreateJournalVariables {
  request: CreateGrowthJournalRequestDto;
  ownerUserId: string;
  sessionGeneration: number;
}

export interface UpdateJournalVariables {
  journalId: string;
  plantId?: string;
  data: UpdateGrowthJournalRequestDto;
}

interface ScopedUpdateJournalVariables extends UpdateJournalVariables {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface DeleteJournalVariables {
  journalId: string;
  plantId?: string;
}

interface ScopedDeleteJournalVariables extends DeleteJournalVariables {
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
  variables: Partial<JournalMutationContext> | undefined,
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
  TVariables extends Partial<JournalMutationContext>,
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

function isOwnerPlantJournalListQuery(
  query: Query,
  ownerUserId: string,
  plantId?: string
): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length !== 5) {
    return false;
  }
  if (key[0] !== 'journals' || key[1] !== ownerUserId || key[2] !== 'plants') {
    return false;
  }
  if (typeof key[4] !== 'object' || key[4] === null) {
    return false;
  }
  if (plantId) {
    return key[3] === plantId;
  }
  return true;
}

function findCachedPlantJournal(
  qc: QueryClient,
  ownerUserId: string,
  plantId: string,
  journalId: string
): { item: GrowthJournalDto; updatedAt: number } | undefined {
  if (!ownerUserId || !plantId || !journalId) {
    return undefined;
  }
  const entries = qc.getQueriesData<PageResponse<GrowthJournalDto>>({
    predicate: (query) => isOwnerPlantJournalListQuery(query, ownerUserId, plantId),
  });
  for (const [key, pageData] of entries) {
    if (!pageData || !Array.isArray(pageData.content)) continue;
    const match = pageData.content.find((item) => item.id === journalId);
    if (match) {
      const updatedAt = qc.getQueryState(key)?.dataUpdatedAt ?? Date.now();
      return { item: match, updatedAt };
    }
  }
  return undefined;
}

function patchJournalInPlantCaches(
  qc: QueryClient,
  ownerUserId: string,
  updated: GrowthJournalDto
): void {
  const targetPlantId = updated.userPlantId;
  qc.setQueryData<GrowthJournalDto>(
    queryKeys.journals.detailLookup(ownerUserId, targetPlantId, updated.id),
    updated
  );

  const entries = qc.getQueriesData<PageResponse<GrowthJournalDto>>({
    predicate: (query) => isOwnerPlantJournalListQuery(query, ownerUserId, targetPlantId),
  });

  for (const [key, pageData] of entries) {
    if (!pageData || !Array.isArray(pageData.content)) continue;
    if (!pageData.content.some((item) => item.id === updated.id)) continue;
    qc.setQueryData<PageResponse<GrowthJournalDto>>(key, {
      ...pageData,
      content: pageData.content.map((item) => (item.id === updated.id ? updated : item)),
    });
  }
}

function removeJournalFromPlantCaches(
  qc: QueryClient,
  ownerUserId: string,
  journalId: string,
  plantId?: string
): void {
  const entries = qc.getQueriesData<PageResponse<GrowthJournalDto>>({
    predicate: (query) => isOwnerPlantJournalListQuery(query, ownerUserId, plantId),
  });

  for (const [key, pageData] of entries) {
    if (!pageData || !Array.isArray(pageData.content)) continue;
    const nextContent = pageData.content.filter((item) => item.id !== journalId);
    if (nextContent.length === pageData.content.length) continue;

    const nextTotalElements = Math.max(0, pageData.totalElements - 1);
    const safeSize = pageData.size > 0 ? pageData.size : 20;
    const nextTotalPages =
      nextTotalElements === 0 ? 0 : Math.ceil(nextTotalElements / safeSize);

    qc.setQueryData<PageResponse<GrowthJournalDto>>(key, {
      ...pageData,
      content: nextContent,
      totalElements: nextTotalElements,
      totalPages: nextTotalPages,
      last: pageData.page + 1 >= nextTotalPages,
    });
  }
}

export function usePlantJournals(
  plantId?: string,
  params?: PlantJournalListParams,
  options?: { enabled?: boolean; keepPreviousData?: boolean }
) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanId = plantId?.trim() ?? '';
  const normalized = normalizePlantJournalListParams(params);
  const placeholderData = useOwnerAndPlantScopedPlaceholderData<PageResponse<GrowthJournalDto>>(
    cacheOwnerId,
    cleanId,
    options?.keepPreviousData !== false
  );

  return useQuery<PageResponse<GrowthJournalDto>, AppApiError>({
    queryKey: queryKeys.journals.list(cacheOwnerId, cleanId, normalized),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getPlantJournals(cleanId, normalized, {
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

export function useResolvedPlantJournal(
  plantId?: string,
  journalId?: string,
  options?: { enabled?: boolean }
) {
  const qc = useQueryClient();
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanPlantId = plantId?.trim() ?? '';
  const cleanJournalId = journalId?.trim() ?? '';

  const isEnabled =
    status === 'authenticated' &&
    Boolean(userId) &&
    Boolean(cleanPlantId) &&
    Boolean(cleanJournalId) &&
    (options?.enabled ?? true);

  return useQuery<GrowthJournalDto, AppApiError>({
    queryKey: queryKeys.journals.detailLookup(cacheOwnerId, cleanPlantId, cleanJournalId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return findJournalByIdFromPlantPages(cleanPlantId, cleanJournalId, {
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    initialData: () => {
      if (!isEnabled || !userId) {
        return undefined;
      }
      return findCachedPlantJournal(qc, userId, cleanPlantId, cleanJournalId)?.item;
    },
    initialDataUpdatedAt: () => {
      if (!isEnabled || !userId) {
        return undefined;
      }
      return findCachedPlantJournal(qc, userId, cleanPlantId, cleanJournalId)?.updatedAt;
    },
    enabled: isEnabled,
  });
}

export function useCreateJournalMutation() {
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
    GrowthJournalDto,
    AppApiError,
    ScopedCreateJournalVariables,
    JournalMutationContext
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
      return createJournal(request, {
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

      const targetPlantId = created.userPlantId || vars.request.userPlantId.trim();
      if (targetPlantId) {
        qc.invalidateQueries({
          queryKey: queryKeys.journals.plantBase(ownerUserId, targetPlantId),
        });
      }
      qc.invalidateQueries({ queryKey: queryKeys.monitoring.all(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (request: CreateGrowthJournalRequestDto) => {
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
    async (request: CreateGrowthJournalRequestDto): Promise<GrowthJournalDto> => {
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

export function useUpdateJournalMutation() {
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
    GrowthJournalDto,
    AppApiError,
    ScopedUpdateJournalVariables,
    JournalMutationContext
  >({
    mutationFn: ({ journalId, data, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return updateJournal(journalId, data, {
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

      patchJournalInPlantCaches(qc, ownerUserId, updated);

      const targetPlantId = updated.userPlantId || vars.plantId?.trim() || '';
      if (targetPlantId) {
        qc.invalidateQueries({
          queryKey: queryKeys.journals.plantBase(ownerUserId, targetPlantId),
        });
      } else {
        qc.invalidateQueries({
          predicate: (query) => isOwnerPlantJournalListQuery(query, ownerUserId),
        });
      }
      qc.invalidateQueries({ queryKey: queryKeys.monitoring.all(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: UpdateJournalVariables) => {
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
    async (variables: UpdateJournalVariables): Promise<GrowthJournalDto> => {
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

export function useDeleteJournalMutation() {
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
    ScopedDeleteJournalVariables,
    JournalMutationContext
  >({
    mutationFn: ({ journalId, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return deleteJournal(journalId, {
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

      const cleanId = vars.journalId.trim();
      const targetPlantId = vars.plantId?.trim() || undefined;

      if (targetPlantId) {
        await qc.cancelQueries({
          queryKey: queryKeys.journals.detailLookup(ownerUserId, targetPlantId, cleanId),
          exact: true,
        });
        qc.removeQueries({
          queryKey: queryKeys.journals.detailLookup(ownerUserId, targetPlantId, cleanId),
          exact: true,
        });
      }

      removeJournalFromPlantCaches(qc, ownerUserId, cleanId, targetPlantId);

      if (targetPlantId) {
        qc.invalidateQueries({
          predicate: (query) =>
            isOwnerPlantJournalListQuery(query, ownerUserId, targetPlantId),
        });
      } else {
        qc.invalidateQueries({
          predicate: (query) => isOwnerPlantJournalListQuery(query, ownerUserId),
        });
      }
      qc.invalidateQueries({ queryKey: queryKeys.monitoring.all(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: DeleteJournalVariables) => {
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
    async (variables: DeleteJournalVariables): Promise<SimpleMessageResponseDto> => {
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
