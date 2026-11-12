import type { HealthStatus } from '@/features/gardens/gardenTypes';
import type { ScheduleStatus } from '@/features/schedule/scheduleTypes';

/**
 * Centralized React Query Keys
 */
export interface SpeciesListQueryKeyParams {
  keyword?: string;
  category?: string;
  page: number;
  size: number;
  sort: string;
}

export interface FavoriteSpeciesQueryKeyParams {
  page: number;
  size: number;
}

export interface UserPlantListQueryKeyParams {
  keyword?: string;
  gardenId?: string;
  healthStatus?: HealthStatus;
  page: number;
  size: number;
  sort: string;
}

export interface PlantScheduleListQueryKeyParams {
  status?: ScheduleStatus;
  page: number;
  size: number;
}

export interface PlantCareLogListQueryKeyParams {
  page: number;
  size: number;
}

export interface PlantJournalListQueryKeyParams {
  page: number;
  size: number;
}

export const queryKeys = {
  auth: {
    session: ['auth', 'session'] as const,
  },
  user: {
    all: ['user'] as const,
    me: ['user', 'me'] as const,
    profile: (id: string) => ['user', 'profile', id] as const,
  },
  species: {
    all: (userId: string) => ['species', userId] as const,
    lists: (userId: string) => ['species', userId, 'list'] as const,
    list: (userId: string, params: SpeciesListQueryKeyParams) =>
      ['species', userId, 'list', params] as const,
    details: (userId: string) => ['species', userId, 'detail'] as const,
    detail: (userId: string, id: string) => ['species', userId, 'detail', id] as const,
    favoritesAll: (userId: string) => ['species', userId, 'favorites'] as const,
    favorites: (userId: string, params: FavoriteSpeciesQueryKeyParams) =>
      ['species', userId, 'favorites', params] as const,
  },
  gardens: {
    all: (userId: string) => ['gardens', userId] as const,
    list: (userId: string) => ['gardens', userId, 'list'] as const,
    detail: (userId: string, id: string) => ['gardens', userId, 'detail', id] as const,
  },
  cameras: {
    all: (userId: string) => ['cameras', userId] as const,
    gardenList: (userId: string, gardenId: string) =>
      ['cameras', userId, 'garden', gardenId] as const,
  },
  plants: {
    all: (userId: string) => ['plants', userId] as const,
    lists: (userId: string) => ['plants', userId, 'list'] as const,
    list: (userId: string, params: UserPlantListQueryKeyParams) =>
      ['plants', userId, 'list', params] as const,
    details: (userId: string) => ['plants', userId, 'detail'] as const,
    detail: (userId: string, id: string) => ['plants', userId, 'detail', id] as const,
    schedulesBase: (userId: string, plantId: string) =>
      ['plants', userId, 'detail', plantId, 'schedules'] as const,
    schedules: (
      userId: string,
      plantId: string,
      params?: PlantScheduleListQueryKeyParams
    ) =>
      params
        ? (['plants', userId, 'detail', plantId, 'schedules', params] as const)
        : (['plants', userId, 'detail', plantId, 'schedules'] as const),
  },
  schedules: {
    all: (userId: string) => ['schedules', userId] as const,
    today: (userId: string) => ['schedules', userId, 'today'] as const,
  },
  careLogs: {
    all: (userId: string) => ['careLogs', userId] as const,
    plants: (userId: string) => ['careLogs', userId, 'plants'] as const,
    plantBase: (userId: string, plantId: string) =>
      ['careLogs', userId, 'plants', plantId] as const,
    list: (userId: string, plantId: string, params: PlantCareLogListQueryKeyParams) =>
      ['careLogs', userId, 'plants', plantId, params] as const,
  },
  journals: {
    all: (userId: string) => ['journals', userId] as const,
    plants: (userId: string) => ['journals', userId, 'plants'] as const,
    plantBase: (userId: string, plantId: string) =>
      ['journals', userId, 'plants', plantId] as const,
    list: (userId: string, plantId: string, params: PlantJournalListQueryKeyParams) =>
      ['journals', userId, 'plants', plantId, params] as const,
    detailLookup: (userId: string, plantId: string, journalId: string) =>
      ['journals', userId, 'plants', plantId, 'detail-lookup', journalId] as const,
  },
  monitoring: {
    all: (userId: string) => ['monitoring', userId] as const,
    overview: (userId: string) => ['monitoring', userId, 'overview'] as const,
    plants: (userId: string) => ['monitoring', userId, 'plants'] as const,
    plantDetail: (userId: string, plantId: string) =>
      ['monitoring', userId, 'plants', plantId] as const,
  },
} as const;
