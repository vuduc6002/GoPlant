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
    all: ['species'] as const,
    lists: () => ['species', 'list'] as const,
    list: (params: SpeciesListQueryKeyParams) => ['species', 'list', params] as const,
    details: () => ['species', 'detail'] as const,
    detail: (id: string) => ['species', 'detail', id] as const,
    favoritesAll: ['species', 'favorites'] as const,
    favorites: (params: FavoriteSpeciesQueryKeyParams) => ['species', 'favorites', params] as const,
  },
  gardens: {
    all: ['gardens'] as const,
    list: ['gardens', 'list'] as const,
    detail: (id: string) => ['gardens', 'detail', id] as const,
  },
  // Placeholders for future phases
  plants: {
    all: ['plants'] as const,
    detail: (id: string) => ['plants', id] as const,
    schedules: (plantId: string) => ['plants', plantId, 'schedules'] as const,
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
