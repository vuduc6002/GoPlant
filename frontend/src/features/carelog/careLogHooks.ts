import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type PlaceholderDataFunction,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import type { PageResponse } from '@/services/api/apiTypes';
import { getSession, getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import {
  createCareLog,
  getPlantCareLogs,
  normalizePlantCareLogListParams,
} from './careLogApi';
import type {
  CareLogDto,
  CreateCareLogRequestDto,
  PlantCareLogListParams,
} from './careLogTypes';

const UNAUTHENTICATED_CACHE_OWNER = '__unauthenticated__';

interface CareLogMutationContext {
  ownerUserId: string;
  sessionGeneration: number;
}

interface ScopedCreateCareLogVariables {
  request: CreateCareLogRequestDto;
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
  variables: Partial<CareLogMutationContext> | undefined,
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
  TVariables extends Partial<CareLogMutationContext>,
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

export function usePlantCareLogs(
  plantId?: string,
  params?: PlantCareLogListParams,
  options?: { enabled?: boolean; keepPreviousData?: boolean }
) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanId = plantId?.trim() ?? '';
  const normalized = normalizePlantCareLogListParams(params);
  const placeholderData = useOwnerAndPlantScopedPlaceholderData<PageResponse<CareLogDto>>(
    cacheOwnerId,
    cleanId,
    options?.keepPreviousData !== false
  );

  return useQuery<PageResponse<CareLogDto>, AppApiError>({
    queryKey: queryKeys.careLogs.list(cacheOwnerId, cleanId, normalized),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getPlantCareLogs(cleanId, normalized, {
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

export function useCreateCareLogMutation() {
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
    CareLogDto,
    AppApiError,
    ScopedCreateCareLogVariables,
    CareLogMutationContext
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
      return createCareLog(request, {
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
          queryKey: queryKeys.careLogs.plantBase(ownerUserId, targetPlantId),
        });
      }
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (request: CreateCareLogRequestDto) => {
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
    async (request: CreateCareLogRequestDto): Promise<CareLogDto> => {
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
