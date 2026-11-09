/**
 * Centralized React Query Keys
 */
export const queryKeys = {
  auth: {
    session: ['auth', 'session'] as const,
  },
  user: {
    all: ['user'] as const,
    me: ['user', 'me'] as const,
    profile: (id: string) => ['user', 'profile', id] as const,
  },
  // Placeholders for future phases
  gardens: {
    all: ['gardens'] as const,
    detail: (id: string) => ['gardens', id] as const,
  },
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
