import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import type { TodayScheduleItemDto } from '@/features/schedule/scheduleTypes';
import { AppApiError } from '@/services/api/apiError';
import type { SimpleMessageResponseDto } from '@/services/api/apiTypes';
import { getSession, getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import {
  createGarden,
  deleteGarden,
  getGardenDetail,
  getGardensList,
  updateGarden,
} from './gardenApi';
import type {
  CreateGardenRequestDto,
  GardenDetailDto,
  GardenSummaryDto,
  UpdateGardenRequestDto,
} from './gardenTypes';

const UNAUTHENTICATED_CACHE_OWNER = '__unauthenticated__';

interface GardenMutationContext {
  ownerUserId: string;
  sessionGeneration: number;
}

interface ScopedCreateGardenVariables {
  request: CreateGardenRequestDto;
  ownerUserId: string;
  sessionGeneration: number;
}

interface ScopedUpdateGardenVariables {
  gardenId: string;
  data: UpdateGardenRequestDto;
  ownerUserId: string;
  sessionGeneration: number;
}

interface ScopedDeleteGardenVariables {
  gardenId: string;
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

function toGardenSummary(detail: GardenDetailDto): GardenSummaryDto {
  return {
    id: detail.id,
    name: detail.name,
    location: detail.location,
    spaceType: detail.spaceType,
    coverImageUrl: detail.coverImageUrl,
    plantCount: Array.isArray(detail.plants) ? detail.plants.length : 0,
    createdAt: detail.createdAt,
  };
}

export function useGardensList(options?: { enabled?: boolean }) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;

  return useQuery<GardenSummaryDto[], AppApiError>({
    queryKey: queryKeys.gardens.list(cacheOwnerId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getGardensList({
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled: status === 'authenticated' && Boolean(userId) && (options?.enabled ?? true),
  });
}

export function useGardenDetail(gardenId?: string, options?: { enabled?: boolean }) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanId = gardenId?.trim() ?? '';

  return useQuery<GardenDetailDto, AppApiError>({
    queryKey: queryKeys.gardens.detail(cacheOwnerId, cleanId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getGardenDetail(cleanId, {
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

export function useCreateGardenMutation() {
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
    GardenDetailDto,
    AppApiError,
    ScopedCreateGardenVariables,
    GardenMutationContext
  >({
    mutationFn: (vars) => {
      if (!vars.ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return createGarden(vars.request, {
        expectedUserId: vars.ownerUserId,
        expectedSessionGeneration: vars.sessionGeneration,
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

      qc.setQueryData<GardenDetailDto>(queryKeys.gardens.detail(ownerUserId, created.id), created);
      qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(ownerUserId), (old) => {
        const summary = toGardenSummary(created);
        if (!Array.isArray(old)) return [summary];
        const filtered = old.filter((item) => item.id !== created.id);
        return [...filtered, summary];
      });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.list(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (request: CreateGardenRequestDto) => {
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
    async (request: CreateGardenRequestDto): Promise<GardenDetailDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        request,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  return {
    ...mutation,
    mutate,
    mutateAsync,
  };
}

export interface UpdateGardenVariables {
  gardenId: string;
  data: UpdateGardenRequestDto;
}

export function useUpdateGardenMutation() {
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
    GardenDetailDto,
    AppApiError,
    ScopedUpdateGardenVariables,
    GardenMutationContext
  >({
    mutationFn: ({ gardenId, data, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return updateGarden(gardenId, data, {
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

      qc.setQueryData<GardenDetailDto>(queryKeys.gardens.detail(ownerUserId, updated.id), updated);
      qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(ownerUserId), (old) => {
        const summary = toGardenSummary(updated);
        if (!Array.isArray(old)) return old;
        return old.map((item) => (item.id === updated.id ? summary : item));
      });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.list(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: UpdateGardenVariables) => {
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
    async (variables: UpdateGardenVariables): Promise<GardenDetailDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        ...variables,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  return {
    ...mutation,
    mutate,
    mutateAsync,
  };
}

export function useDeleteGardenMutation() {
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
    ScopedDeleteGardenVariables,
    GardenMutationContext
  >({
    mutationFn: ({ gardenId, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return deleteGarden(gardenId, {
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

      const cleanId = vars.gardenId.trim();
      const cachedDetail = qc.getQueryData<GardenDetailDto>(
        queryKeys.gardens.detail(ownerUserId, cleanId)
      );
      const deletedPlantIds = new Set(
        Array.isArray(cachedDetail?.plants) ? cachedDetail.plants.map((p) => p.id) : []
      );

      await qc.cancelQueries({
        queryKey: queryKeys.gardens.detail(ownerUserId, cleanId),
        exact: true,
      });
      qc.removeQueries({
        queryKey: queryKeys.gardens.detail(ownerUserId, cleanId),
        exact: true,
      });
      for (const plantId of deletedPlantIds) {
        await qc.cancelQueries({
          queryKey: queryKeys.plants.schedulesBase(ownerUserId, plantId),
        });
        qc.removeQueries({
          queryKey: queryKeys.plants.schedulesBase(ownerUserId, plantId),
        });
        await qc.cancelQueries({
          queryKey: queryKeys.plants.detail(ownerUserId, plantId),
          exact: true,
        });
        qc.removeQueries({
          queryKey: queryKeys.plants.detail(ownerUserId, plantId),
          exact: true,
        });
      }
      if (deletedPlantIds.size > 0) {
        qc.setQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(ownerUserId), (old) =>
          Array.isArray(old) ? old.filter((item) => !deletedPlantIds.has(item.plantId)) : old
        );
      }
      qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(ownerUserId), (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((item) => item.id !== cleanId);
      });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.list(ownerUserId) });
      qc.invalidateQueries({ queryKey: queryKeys.plants.lists(ownerUserId) });
      qc.invalidateQueries({ queryKey: queryKeys.schedules.today(ownerUserId) });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (gardenId: string) => {
      void resolveMutationSessionOwner(latestAuthRef)
        .then(({ ownerUserId, sessionGeneration }) => {
          rawMutate({
            gardenId,
            ownerUserId,
            sessionGeneration,
          });
        })
        .catch(() => {
          rawMutate({
            gardenId,
            ownerUserId: '',
            sessionGeneration: getSessionGeneration(),
          });
        });
    },
    [rawMutate]
  );

  const mutateAsync = useCallback(
    async (gardenId: string): Promise<SimpleMessageResponseDto> => {
      const { ownerUserId, sessionGeneration } = await resolveMutationSessionOwner(latestAuthRef);
      return rawMutateAsync({
        gardenId,
        ownerUserId,
        sessionGeneration,
      });
    },
    [rawMutateAsync]
  );

  return {
    ...mutation,
    mutate,
    mutateAsync,
  };
}
