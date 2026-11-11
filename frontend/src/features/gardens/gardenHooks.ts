import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import type { SimpleMessageResponseDto } from '@/services/api/apiTypes';
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
  const { status } = useAuth();

  return useQuery<GardenSummaryDto[], AppApiError>({
    queryKey: queryKeys.gardens.list,
    queryFn: getGardensList,
    enabled: status === 'authenticated' && (options?.enabled ?? true),
  });
}

export function useGardenDetail(gardenId?: string, options?: { enabled?: boolean }) {
  const { status } = useAuth();
  const cleanId = gardenId?.trim() ?? '';

  return useQuery<GardenDetailDto, AppApiError>({
    queryKey: queryKeys.gardens.detail(cleanId),
    queryFn: () => getGardenDetail(cleanId),
    enabled: status === 'authenticated' && Boolean(cleanId) && (options?.enabled ?? true),
  });
}

export function useCreateGardenMutation() {
  const qc = useQueryClient();

  return useMutation<GardenDetailDto, AppApiError, CreateGardenRequestDto>({
    mutationFn: (request: CreateGardenRequestDto) => createGarden(request),
    onSuccess: (created) => {
      qc.setQueryData<GardenDetailDto>(queryKeys.gardens.detail(created.id), created);
      qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list, (old) => {
        const summary = toGardenSummary(created);
        if (!Array.isArray(old)) return [summary];
        const filtered = old.filter((item) => item.id !== created.id);
        return [...filtered, summary];
      });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.list });
    },
  });
}

export interface UpdateGardenVariables {
  gardenId: string;
  data: UpdateGardenRequestDto;
}

export function useUpdateGardenMutation() {
  const qc = useQueryClient();

  return useMutation<GardenDetailDto, AppApiError, UpdateGardenVariables>({
    mutationFn: ({ gardenId, data }: UpdateGardenVariables) => updateGarden(gardenId, data),
    onSuccess: (updated) => {
      qc.setQueryData<GardenDetailDto>(queryKeys.gardens.detail(updated.id), updated);
      qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list, (old) => {
        const summary = toGardenSummary(updated);
        if (!Array.isArray(old)) return old;
        return old.map((item) => (item.id === updated.id ? summary : item));
      });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.list });
    },
  });
}

export function useDeleteGardenMutation() {
  const qc = useQueryClient();

  return useMutation<SimpleMessageResponseDto, AppApiError, string>({
    mutationFn: (gardenId: string) => deleteGarden(gardenId),
    onSuccess: async (_res, gardenId) => {
      const cleanId = gardenId.trim();
      await qc.cancelQueries({ queryKey: queryKeys.gardens.detail(cleanId), exact: true });
      qc.removeQueries({ queryKey: queryKeys.gardens.detail(cleanId), exact: true });
      qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list, (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((item) => item.id !== cleanId);
      });
      qc.invalidateQueries({ queryKey: queryKeys.gardens.list });
    },
  });
}
