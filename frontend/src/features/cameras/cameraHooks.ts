import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import type { SimpleMessageResponseDto } from '@/services/api/apiTypes';
import { getSession, getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import {
  createGardenCamera,
  deleteCamera,
  getGardenCameras,
  updateCamera,
} from './cameraApi';
import type {
  CameraDto,
  CreateCameraRequestDto,
  UpdateCameraRequestDto,
} from './cameraTypes';

const UNAUTHENTICATED_CACHE_OWNER = '__unauthenticated__';

interface CameraMutationContext {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface CreateCameraVariables {
  gardenId: string;
  request: CreateCameraRequestDto;
}

interface ScopedCreateCameraVariables extends CreateCameraVariables {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface UpdateCameraVariables {
  cameraId: string;
  gardenId?: string;
  data: UpdateCameraRequestDto;
}

interface ScopedUpdateCameraVariables extends UpdateCameraVariables {
  ownerUserId: string;
  sessionGeneration: number;
}

export interface DeleteCameraVariables {
  cameraId: string;
  gardenId: string;
}

interface ScopedDeleteCameraVariables extends DeleteCameraVariables {
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

export function useGardenCameras(gardenId?: string, options?: { enabled?: boolean }) {
  const { status, user } = useAuth();
  const userId = getAuthenticatedUserId(status, user);
  const cacheOwnerId = userId || UNAUTHENTICATED_CACHE_OWNER;
  const cleanGardenId = gardenId?.trim() ?? '';

  return useQuery<CameraDto[], AppApiError>({
    queryKey: queryKeys.cameras.gardenList(cacheOwnerId, cleanGardenId),
    queryFn: () => {
      if (!userId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return getGardenCameras(cleanGardenId, {
        expectedUserId: userId,
        expectedSessionGeneration: getSessionGeneration(),
      });
    },
    enabled:
      status === 'authenticated' &&
      Boolean(userId) &&
      Boolean(cleanGardenId) &&
      (options?.enabled ?? true),
    placeholderData: undefined,
  });
}

export function useCreateCameraMutation() {
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
    CameraDto,
    AppApiError,
    ScopedCreateCameraVariables,
    CameraMutationContext
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
      return createGardenCamera(gardenId, request, {
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

      const cleanGardenId = created.gardenId || vars.gardenId.trim();
      qc.setQueryData<CameraDto[]>(
        queryKeys.cameras.gardenList(ownerUserId, cleanGardenId),
        (old) => {
          if (!Array.isArray(old)) {
            return [created];
          }
          const filtered = old.filter((item) => item.id !== created.id);
          return [...filtered, created];
        }
      );
      qc.invalidateQueries({
        queryKey: queryKeys.cameras.gardenList(ownerUserId, cleanGardenId),
      });
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: CreateCameraVariables) => {
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
    async (variables: CreateCameraVariables): Promise<CameraDto> => {
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

export function useUpdateCameraMutation() {
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
    CameraDto,
    AppApiError,
    ScopedUpdateCameraVariables,
    CameraMutationContext
  >({
    mutationFn: ({ cameraId, data, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return updateCamera(cameraId, data, {
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

      const cleanGardenId = updated.gardenId || vars.gardenId?.trim() || '';
      if (cleanGardenId) {
        qc.setQueryData<CameraDto[]>(
          queryKeys.cameras.gardenList(ownerUserId, cleanGardenId),
          (old) => {
            if (!Array.isArray(old)) {
              return old;
            }
            return old.map((item) => (item.id === updated.id ? updated : item));
          }
        );
        qc.invalidateQueries({
          queryKey: queryKeys.cameras.gardenList(ownerUserId, cleanGardenId),
        });
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.cameras.all(ownerUserId) });
      }
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: UpdateCameraVariables) => {
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
    async (variables: UpdateCameraVariables): Promise<CameraDto> => {
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

export function useDeleteCameraMutation() {
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
    ScopedDeleteCameraVariables,
    CameraMutationContext
  >({
    mutationFn: ({ cameraId, ownerUserId, sessionGeneration }) => {
      if (!ownerUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }
      return deleteCamera(cameraId, {
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

      const cleanGardenId = vars.gardenId.trim();
      const cleanCameraId = vars.cameraId.trim();
      if (cleanGardenId) {
        qc.setQueryData<CameraDto[]>(
          queryKeys.cameras.gardenList(ownerUserId, cleanGardenId),
          (old) => (Array.isArray(old) ? old.filter((item) => item.id !== cleanCameraId) : old)
        );
        qc.invalidateQueries({
          queryKey: queryKeys.cameras.gardenList(ownerUserId, cleanGardenId),
        });
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.cameras.all(ownerUserId) });
      }
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback(
    (variables: DeleteCameraVariables) => {
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
    async (variables: DeleteCameraVariables): Promise<SimpleMessageResponseDto> => {
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
