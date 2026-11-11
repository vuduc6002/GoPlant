import type { HealthStatus } from '@/features/gardens/gardenTypes';

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
  plants: {
    all: (userId: string) => ['plants', userId] as const,
    lists: (userId: string) => ['plants', userId, 'list'] as const,
    list: (userId: string, params: UserPlantListQueryKeyParams) =>
      ['plants', userId, 'list', params] as const,
    details: (userId: string) => ['plants', userId, 'detail'] as const,
    detail: (userId: string, id: string) => ['plants', userId, 'detail', id] as const,
    schedules: (userId: string, plantId: string) =>
      ['plants', userId, 'detail', plantId, 'schedules'] as const,
  },
  schedules: {
    all: ['schedules'] as const,
    today: ['schedules', 'today'] as const,
    detail: (id: string) => ['schedules', id] as const,
  },
  journals: {
    all: ['journals'] as const,
    detail: (id: string) => ['journals', id] as const,
  },
} as const;
