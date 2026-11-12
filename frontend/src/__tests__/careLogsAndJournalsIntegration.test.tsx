import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import {
  buildCreateCareLogPayload,
  createCareLog,
  formatIsoDateTimeVn,
  formatIsoToVnInputValue,
  getPlantCareLogs,
  parseUiDateTimeInputToOffsetIso,
  sanitizeImageUrls,
} from '@/features/carelog/careLogApi';
import { useCreateCareLogMutation, usePlantCareLogs } from '@/features/carelog/careLogHooks';
import { CreateCareLogScreen } from '@/features/carelog/CareLogScreens';
import type { CareLogDto } from '@/features/carelog/careLogTypes';
import { useDeleteGardenMutation } from '@/features/gardens/gardenHooks';
import {
  buildCreateJournalPayload,
  buildUpdateJournalPayload,
  createJournal,
  deleteJournal,
  findJournalByIdFromPlantPages,
  getPlantJournals,
  updateJournal,
} from '@/features/journal/journalApi';
import {
  useCreateJournalMutation,
  useDeleteJournalMutation,
  usePlantJournals,
  useUpdateJournalMutation,
} from '@/features/journal/journalHooks';
import {
  EditJournalScreen,
  JournalDetailScreen,
  NewJournalScreen,
} from '@/features/journal/JournalScreens';
import type { GrowthJournalDto } from '@/features/journal/journalTypes';
import { JournalScreen } from '@/features/main/MainScreens';
import PlantDetailScreen from '@/features/plants/PlantDetailScreen';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
import { useDeletePlantMutation, useUpdatePlantMutation } from '@/features/plants/plantHooks';
import type { UserPlantDetailDto, UserPlantSummaryDto } from '@/features/plants/plantTypes';
import {
  useCompleteScheduleMutation,
  useSkipScheduleMutation,
} from '@/features/schedule/scheduleHooks';
import type { CareScheduleDto, TodayScheduleItemDto } from '@/features/schedule/scheduleTypes';
import { apiClient } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { AuthSession, PageResponse, UserProfileDto } from '@/services/api/apiTypes';
import * as tokenStorage from '@/services/api/tokenStorage';
import { shouldRetry } from '@/services/query/queryClient';
import { queryKeys } from '@/services/query/queryKeys';

/**
 * NOTE ON TEST SCOPE:
 * Automated Vitest + happy-dom integration & unit tests using mocked Axios HTTP adapter.
 * Does NOT execute live network calls to Spring Boot or Android Emulator UI interactions.
 */

const { mockRouter, routeParamsState } = vi.hoisted(() => ({
  mockRouter: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    canGoBack: vi.fn(() => true),
  },
  routeParamsState: {
    current: {} as Record<string, string | undefined>,
  },
}));

vi.mock('expo-router', () => ({
  router: mockRouter,
  useLocalSearchParams: () => routeParamsState.current,
}));

vi.mock('expo-image', () => ({
  Image: ({
    source,
    alt,
  }: {
    source?: { uri?: string } | number;
    alt?: string;
  }) =>
    React.createElement('img', {
      src: typeof source === 'object' && source !== null ? source.uri ?? '' : '',
      alt: alt ?? '',
    }),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'safe-area' }, children),
}));

const mockUserA = {
  id: 'usr_cj_a',
  fullName: 'Nguyễn Minh Khoa',
  email: 'khoa.cj@goplant.vn',
  roles: ['ROLE_USER'],
};

const mockUserB = {
  id: 'usr_cj_b',
  fullName: 'Trần Thu Hà',
  email: 'ha.cj@goplant.vn',
  roles: ['ROLE_USER'],
};

const sessionA: AuthSession = {
  accessToken: 'jwt-cj-token-a',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUserA,
  savedAt: Date.now(),
};

const sessionB: AuthSession = {
  accessToken: 'jwt-cj-token-b',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUserB,
  savedAt: Date.now(),
};

const profileA: UserProfileDto = {
  id: mockUserA.id,
  fullName: mockUserA.fullName,
  email: mockUserA.email,
  phoneNumber: null,
  recoveryEmail: null,
  preferredDevice: 'MOBILE',
  status: 'ACTIVE',
  avatarUrl: null,
  roles: ['ROLE_USER'],
  createdAt: '2026-01-01T00:00:00Z',
};

const profileB: UserProfileDto = {
  ...profileA,
  id: mockUserB.id,
  fullName: mockUserB.fullName,
  email: mockUserB.email,
};

const plantSummaryOne: UserPlantSummaryDto = {
  id: 'plt-1',
  displayName: 'Monstera Cửa Sổ',
  speciesName: 'Trầu bà lá xẻ',
  scientificName: 'Monstera deliciosa',
  category: 'Cây cảnh',
  gardenName: 'Ban công hướng Đông',
  healthStatus: 'HEALTHY',
  imageUrl: null,
  createdAt: '2026-01-10T08:00:00Z',
};

const plantSummaryTwo: UserPlantSummaryDto = {
  id: 'plt-2',
  displayName: 'Sen Đá Bàn Làm Việc',
  speciesName: 'Sen đá nâu',
  scientificName: 'Echeveria',
  category: 'Sen đá',
  gardenName: 'Vườn Khác',
  healthStatus: 'NEEDS_ATTENTION',
  imageUrl: null,
  createdAt: '2026-01-11T08:00:00Z',
};

const plantDetailOne: UserPlantDetailDto = {
  id: 'plt-1',
  displayName: 'Monstera Cửa Sổ',
  location: 'Kệ gỗ tầng 2',
  plantedAt: '2026-01-10',
  note: 'Đặt nơi thoáng sáng',
  healthStatus: 'HEALTHY',
  plantCode: null,
  imageUrl: null,
  species: {
    id: 'sp-1',
    commonName: 'Trầu bà lá xẻ',
    scientificName: 'Monstera deliciosa',
    category: 'Cây cảnh',
    difficulty: 'Dễ',
    thumbnailUrl: null,
  },
  garden: {
    id: 'grd-1',
    name: 'Ban công hướng Đông',
  },
  createdAt: '2026-01-10T08:00:00Z',
};

const plantDetailTwo: UserPlantDetailDto = {
  ...plantDetailOne,
  id: 'plt-2',
  displayName: 'Sen Đá Bàn Làm Việc',
  garden: {
    id: 'grd-2',
    name: 'Vườn Khác',
  },
};

const careLogCompleted: CareLogDto = {
  id: 'cl-1',
  userPlantId: 'plt-1',
  taskType: 'WATERING',
  status: 'COMPLETED',
  note: 'Tưới 300ml quanh gốc lúc sáng',
  imageUrls: ['https://cdn.goplant.vn/care/cl-1.jpg'],
  performedAt: '2026-11-12T01:30:00Z',
  createdAt: '2026-11-12T01:31:00Z',
};

const careLogSkipped: CareLogDto = {
  id: 'cl-2',
  userPlantId: 'plt-1',
  taskType: 'MISTING',
  status: 'SKIPPED',
  note: 'Trời mưa ẩm nên bỏ qua phun sương',
  imageUrls: [],
  performedAt: '2026-11-11T17:15:00Z',
  createdAt: null,
};

const journalOne: GrowthJournalDto = {
  id: 'jrn-1',
  userPlantId: 'plt-1',
  entryType: 'GROWTH',
  healthStatus: 'HEALTHY',
  note: 'Chồi non mọc thêm 4cm, lá xanh bóng',
  imageUrls: ['https://cdn.goplant.vn/journal/jrn-1.jpg'],
  recordedAt: '2026-11-12T02:00:00Z',
  createdAt: '2026-11-12T02:01:00Z',
};

const journalTwo: GrowthJournalDto = {
  id: 'jrn-2',
  userPlantId: 'plt-1',
  entryType: 'PEST',
  healthStatus: 'CRITICAL',
  note: 'Phát hiện rệp sáp mặt dưới lá, cần xử lý ngay',
  imageUrls: [],
  recordedAt: '2026-11-11T16:45:00Z',
  createdAt: '2026-11-11T16:46:00Z',
};

const journalOtherPlant: GrowthJournalDto = {
  id: 'jrn-plt2',
  userPlantId: 'plt-2',
  entryType: 'OTHER',
  healthStatus: 'NEEDS_ATTENTION',
  note: 'Nhật ký riêng của Sen Đá bàn làm việc',
  imageUrls: [],
  recordedAt: '2026-11-10T03:00:00Z',
  createdAt: '2026-11-10T03:01:00Z',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 2,
        retry: shouldRetry,
        retryDelay: 10,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

async function flushAsync(ms = 20) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function waitFor(assertion: () => void, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
      await flushAsync(15);
    }
  }
  assertion();
  if (lastError) {
    throw lastError;
  }
}

function clickElement(el: Element | null | undefined) {
  if (!el) throw new Error('Target element not found for click');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function changeInputValue(el: Element | null | undefined, nextValue: string) {
  if (!el) throw new Error('Input element not found');
  const tagName = el.tagName.toLowerCase();
  const proto =
    tagName === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  act(() => {
    descriptor?.set?.call(el, nextValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function createDeferred<T = unknown>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function emptyPage<T>(size = 20): PageResponse<T> {
  return {
    content: [],
    page: 0,
    size,
    totalElements: 0,
    totalPages: 0,
    last: true,
  };
}

describe('G5.4.3 Care Logs & Growth Journals REST API Integration (Mocked Axios HTTP Adapter)', () => {
  let qc: QueryClient;
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let originalAdapter: typeof apiClient.defaults.adapter;

  beforeEach(() => {
    qc = createTestQueryClient();
    originalAdapter = apiClient.defaults.adapter;
    routeParamsState.current = {};
    tokenStorage._resetWebMemorySession();
    vi.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    apiClient.defaults.adapter = originalAdapter;
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    tokenStorage._resetWebMemorySession();
    qc.clear();
    vi.restoreAllMocks();
  });

  function mountWithProviders(ui: React.ReactElement) {
    act(() => {
      root!.render(
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <PlantDataProvider>{ui}</PlantDataProvider>
          </AuthProvider>
        </QueryClientProvider>
      );
    });
  }

  describe('1. CareLog API Contract & Asia/Ho_Chi_Minh Timezone', () => {
    it('calls exact GET /plants/{plantId}/care-logs and normalizes createdAt, imageUrls null -> [] and unsafe URIs', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      const calls: string[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        calls.push(`${String(config.method).toUpperCase()} ${config.url}`);
        if (config.url === '/plants/plt-1/care-logs' && config.method === 'get') {
          expect(config.params).toEqual({ page: 0, size: 20 });
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [
                  {
                    ...careLogCompleted,
                    imageUrls: null,
                    createdAt: '2026-11-12T01:31:00Z',
                  },
                  {
                    ...careLogSkipped,
                    imageUrls: [
                      'file:///bad.jpg',
                      'javascript:alert(1)',
                      'https://cdn.goplant.vn/ok.png',
                    ],
                  },
                ],
                page: 0,
                size: 20,
                totalElements: 2,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      const page = await getPlantCareLogs('plt-1');
      expect(page.content).toHaveLength(2);
      expect(page.content[0].createdAt).toBe('2026-11-12T01:31:00Z');
      expect(page.content[0].imageUrls).toEqual([]);
      expect(page.content[1].status).toBe('SKIPPED');
      expect(page.content[1].imageUrls).toEqual(['https://cdn.goplant.vn/ok.png']);
      expect(calls).toEqual(['GET /plants/plt-1/care-logs']);
    });

    it('builds POST /care-logs across all 6 TaskType values, omits status/scheduleId, and rejects invalid URIs/IDs/naive TZ pre-flight', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      const postedPayloads: Record<string, unknown>[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/care-logs' && config.method === 'post') {
          const body = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          postedPayloads.push(body);
          return Promise.resolve({
            status: 201,
            data: {
              success: true,
              data: {
                ...careLogCompleted,
                taskType: body.taskType,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      const taskTypes = [
        'WATERING',
        'FERTILIZING',
        'PRUNING',
        'PEST_CHECK',
        'MISTING',
        'JOURNAL',
      ] as const;

      for (const taskType of taskTypes) {
        const res = await createCareLog({
          userPlantId: 'plt-1',
          taskType,
          note: `  Thao tác ${taskType}  `,
          performedAt: '2026-11-12T08:30:00+07:00',
          imageUrls: ['https://cdn.goplant.vn/p.jpg'],
        });
        expect(res.taskType).toBe(taskType);
      }

      expect(postedPayloads).toHaveLength(6);
      expect(postedPayloads[3]).toEqual({
        userPlantId: 'plt-1',
        taskType: 'PEST_CHECK',
        note: 'Thao tác PEST_CHECK',
        performedAt: '2026-11-12T08:30:00+07:00',
        imageUrls: ['https://cdn.goplant.vn/p.jpg'],
      });
      for (const payload of postedPayloads) {
        expect(payload).not.toHaveProperty('status');
        expect(payload).not.toHaveProperty('scheduleId');
      }

      expect(() =>
        buildCreateCareLogPayload({
          userPlantId: '   ',
          taskType: 'WATERING',
        })
      ).toThrow(AppApiError);
      expect(() =>
        buildCreateCareLogPayload({
          userPlantId: 'plt/1',
          taskType: 'WATERING',
        })
      ).toThrow(AppApiError);
      expect(() =>
        buildCreateCareLogPayload({
          userPlantId: 'plt-1',
          taskType: 'WATERING',
          imageUrls: ['file:///sdcard/photo.jpg'],
        })
      ).toThrow(AppApiError);
      expect(() =>
        sanitizeImageUrls(['content://media/123'], { strictValidation: true })
      ).toThrow(AppApiError);
      expect(() =>
        buildCreateCareLogPayload({
          userPlantId: 'plt-1',
          taskType: 'WATERING',
          performedAt: '2026-11-12T08:30:00',
        })
      ).toThrow(AppApiError);
    });

    it('formats and parses timestamps strictly in Asia/Ho_Chi_Minh near UTC midnight and year boundaries', () => {
      // 2026-11-11T17:00:00Z === 2026-11-12 00:00 VN
      expect(formatIsoDateTimeVn('2026-11-11T17:00:00Z')).toBe('00:00 • 12/11/2026 (VN)');
      // 2026-11-11T16:59:59Z === 2026-11-11 23:59 VN
      expect(formatIsoDateTimeVn('2026-11-11T16:59:59Z')).toBe('23:59 • 11/11/2026 (VN)');
      // Year boundary: 2026-12-31T18:00:00Z === 2027-01-01 01:00 VN
      expect(formatIsoDateTimeVn('2026-12-31T18:00:00Z')).toBe('01:00 • 01/01/2027 (VN)');
      expect(formatIsoToVnInputValue('2026-11-11T17:15:30Z')).toBe('2026-11-12 00:15:30');

      expect(parseUiDateTimeInputToOffsetIso('   ', 'recordedAt', 'Thời điểm')).toBeUndefined();
      expect(parseUiDateTimeInputToOffsetIso('2026-11-12 08:30', 'recordedAt', 'Thời điểm')).toBe(
        '2026-11-12T08:30:00+07:00'
      );
      expect(parseUiDateTimeInputToOffsetIso('2026-11-12T08:30:00Z', 'recordedAt', 'Thời điểm')).toBe(
        '2026-11-12T08:30:00Z'
      );
      expect(() =>
        parseUiDateTimeInputToOffsetIso('2026-11-12T08:30:00', 'recordedAt', 'Thời điểm')
      ).toThrow(AppApiError);
      expect(() =>
        parseUiDateTimeInputToOffsetIso('2026-02-30 08:30', 'recordedAt', 'Thời điểm')
      ).toThrow(AppApiError);
    });

    it('never exposes or calls non-existent CareLog global/detail/edit/delete endpoints', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      const calls: string[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        const signature = `${String(config.method).toUpperCase()} ${config.url}`;
        calls.push(signature);
        if (signature === 'GET /plants/plt-1/care-logs') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: emptyPage<CareLogDto>(20) },
            headers: {},
            config,
          });
        }
        throw new Error(`Forbidden CareLog endpoint called: ${signature}`);
      });

      await getPlantCareLogs('plt-1');
      expect(calls).toEqual(['GET /plants/plt-1/care-logs']);
      expect(calls.some((c) => /^GET \/care-logs/.test(c))).toBe(false);
      expect(calls.some((c) => /^(PUT|PATCH|DELETE) \/care-logs/.test(c))).toBe(false);
    });
  });

  describe('2. GrowthJournal API Contract & Paginated Lookup', () => {
    it('uses explicit size=20 on GET /plants/{plantId}/journals (Java alignment) and normalizes imageUrls', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      const journalParams: Record<string, unknown>[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/plants/plt-1/journals' && config.method === 'get') {
          journalParams.push((config.params ?? {}) as Record<string, unknown>);
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [
                  { ...journalOne, imageUrls: null },
                  {
                    ...journalTwo,
                    imageUrls: ['file:///bad.png', 'https://cdn.goplant.vn/journal/2.png'],
                  },
                ],
                page: 0,
                size: 20,
                totalElements: 2,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      const page = await getPlantJournals('plt-1');
      expect(journalParams).toEqual([{ page: 0, size: 20 }]);
      expect(page.size).toBe(20);
      expect(page.content[0].imageUrls).toEqual([]);
      expect(page.content[1].imageUrls).toEqual(['https://cdn.goplant.vn/journal/2.png']);
    });

    it('finds single GrowthJournal via findJournalByIdFromPlantPages without calling GET /journals or GET /journals/{id}, throwing 404 when absent', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      const calls: { url: string; method: string; page?: number; size?: number }[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        calls.push({
          url: String(config.url),
          method: String(config.method).toUpperCase(),
          page: (config.params as { page?: number } | undefined)?.page,
          size: (config.params as { size?: number } | undefined)?.size,
        });
        if (config.url === '/plants/plt-1/journals' && config.method === 'get') {
          const reqPage = (config.params as { page?: number } | undefined)?.page ?? 0;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: reqPage === 0 ? [journalOne] : [journalTwo],
                page: reqPage,
                size: 20,
                totalElements: 2,
                totalPages: 2,
                last: reqPage === 1,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      const found = await findJournalByIdFromPlantPages('plt-1', 'jrn-2');
      expect(found.id).toBe('jrn-2');

      await expect(findJournalByIdFromPlantPages('plt-1', 'jrn-missing')).rejects.toMatchObject({
        statusCode: 404,
        code: 'JOURNAL_NOT_FOUND',
      });

      expect(calls.some((c) => c.url === '/journals' && c.method === 'GET')).toBe(false);
      expect(calls.some((c) => /^\/journals\/.+/.test(c.url) && c.method === 'GET')).toBe(false);
      expect(calls.every((c) => c.size === 20)).toBe(true);
    });

    it('validates all 3 JournalHealthStatus options (rejecting UNKNOWN) and enforces non-blank note client-side before POST & PUT', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      const adapterSpy = vi.fn().mockImplementation((config) => {
        if (config.url === '/journals' && config.method === 'post') {
          return Promise.resolve({
            status: 201,
            data: { success: true, data: journalOne },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });
      apiClient.defaults.adapter = adapterSpy;

      for (const healthStatus of ['HEALTHY', 'NEEDS_ATTENTION', 'CRITICAL'] as const) {
        const built = buildCreateJournalPayload({
          userPlantId: 'plt-1',
          entryType: 'WATERING',
          healthStatus,
          note: `  Ghi nhận ${healthStatus}  `,
        });
        expect(built.healthStatus).toBe(healthStatus);
        expect(built.note).toBe(`Ghi nhận ${healthStatus}`);
      }

      expect(() =>
        buildCreateJournalPayload({
          userPlantId: 'plt-1',
          healthStatus: 'UNKNOWN' as never,
          note: 'Hợp lệ',
        })
      ).toThrow(AppApiError);

      // Blank note rejected pre-flight on BOTH POST & PUT -> 0 HTTP requests dispatched
      await expect(
        createJournal({
          userPlantId: 'plt-1',
          entryType: 'GROWTH',
          healthStatus: 'HEALTHY',
          note: '   ',
        })
      ).rejects.toThrow(AppApiError);
      await expect(updateJournal('jrn-1', { note: '   ' })).rejects.toThrow(AppApiError);
      expect(adapterSpy).not.toHaveBeenCalled();

      const created = await createJournal({
        userPlantId: 'plt-1',
        entryType: 'GROWTH',
        healthStatus: 'HEALTHY',
        note: 'Ra chồi non mới',
      });
      expect(created.id).toBe('jrn-1');
    });

    it('preserves omitted keys on partial PUT /journals/{id}, supports recordedAt & imageUrls: [], and calls DELETE /journals/{id}', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      let putPayload: Record<string, unknown> | undefined;
      const calls: string[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        calls.push(`${String(config.method).toUpperCase()} ${config.url}`);
        if (config.url === '/journals/jrn-1' && config.method === 'put') {
          putPayload = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                ...journalOne,
                note: 'Ghi chú mới',
                imageUrls: [],
                recordedAt: '2026-11-12T10:00:00+07:00',
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/journals/jrn-1' && config.method === 'delete') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { message: 'Deleted journal' } },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      const partialPayload = buildUpdateJournalPayload({ note: 'Chỉ sửa ghi chú' });
      expect(partialPayload).toEqual({ note: 'Chỉ sửa ghi chú' });
      expect(partialPayload).not.toHaveProperty('entryType');
      expect(partialPayload).not.toHaveProperty('healthStatus');
      expect(partialPayload).not.toHaveProperty('imageUrls');
      expect(partialPayload).not.toHaveProperty('recordedAt');

      const updated = await updateJournal('jrn-1', {
        note: 'Ghi chú mới',
        imageUrls: [],
        recordedAt: '2026-11-12T10:00:00+07:00',
      });
      expect(updated.imageUrls).toEqual([]);
      expect(putPayload).toEqual({
        note: 'Ghi chú mới',
        imageUrls: [],
        recordedAt: '2026-11-12T10:00:00+07:00',
      });
      expect(putPayload).not.toHaveProperty('userPlantId');

      await deleteJournal('jrn-1');
      expect(calls).toEqual(['PUT /journals/jrn-1', 'DELETE /journals/jrn-1']);
    });
  });

  describe('3. PlantDetailScreen Care Logs & Growth Journals Integration', () => {
    it('renders Care Logs with error retry, COMPLETED/SKIPPED badges, VN timestamps, imageUrls, pagination, zero Edit/Delete buttons, and /care-log/new navigation', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      let failFirstCareLog = true;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: emptyPage<CareScheduleDto>(10) },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1/journals') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: emptyPage<GrowthJournalDto>(20) },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1/care-logs') {
          if (failFirstCareLog) {
            return Promise.reject({
              isAxiosError: true,
              response: { status: 500, data: { success: false, error: { code: 'ERR', message: 'Lỗi tải care logs.' } } },
              config,
            });
          }
          const reqPage = (config.params as { page?: number } | undefined)?.page ?? 0;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content:
                  reqPage === 0
                    ? [careLogCompleted, careLogSkipped]
                    : [{ ...careLogCompleted, id: 'cl-21', note: 'Lịch sử trang 2' }],
                page: reqPage,
                size: 20,
                totalElements: 21,
                totalPages: 2,
                last: reqPage === 1,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Lịch sử chăm sóc');
        expect(container!.textContent).toContain('Lỗi tải care logs.');
      });

      failFirstCareLog = false;
      clickElement(container!.querySelector('[aria-label="Thử lại tải lịch sử chăm sóc"]'));

      await waitFor(() => {
        expect(container!.textContent).toContain('21 lượt');
        expect(container!.textContent).toContain('Hoàn thành');
        expect(container!.textContent).toContain('Đã bỏ qua');
        expect(container!.textContent).toContain('Tưới 300ml quanh gốc lúc sáng');
        expect(container!.textContent).toContain('08:30 • 12/11/2026 (VN)');
        expect(container!.textContent).toContain('00:15 • 12/11/2026 (VN)');
      });

      const imgs = Array.from(container!.querySelectorAll('img')).map((img) => img.getAttribute('src'));
      expect(imgs).toContain('https://cdn.goplant.vn/care/cl-1.jpg');

      const actionLabels = Array.from(container!.querySelectorAll('[role="button"]')).map(
        (el) => el.getAttribute('aria-label') || el.textContent || ''
      );
      expect(actionLabels.some((label) => label.toLowerCase().includes('xóa lịch sử'))).toBe(false);
      expect(actionLabels.some((label) => label.toLowerCase().includes('sửa lịch sử'))).toBe(false);

      clickElement(container!.querySelector('[aria-label="Trang sau lịch sử chăm sóc"]'));
      await waitFor(() => {
        expect(container!.textContent).toContain('Lịch sử trang 2');
        expect(container!.textContent).toContain('Trang 2 / 2');
      });

      clickElement(container!.querySelector('[aria-label="Ghi nhận chăm sóc cho cây này"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/care-log/new',
        params: { plantId: 'plt-1' },
      });
    });

    it('renders Growth Journals in PlantDetailScreen with retry recovery, VN dates, imageUrls, and /journal/new, /journal/detail, /journal/edit navigation', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      let failFirstJournal = true;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules' || config.url === '/plants/plt-1/care-logs') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: emptyPage<CareLogDto>(20) },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1/journals') {
          if (failFirstJournal) {
            return Promise.reject({
              isAxiosError: true,
              response: { status: 500, data: { success: false, error: { code: 'ERR', message: 'Lỗi tải nhật ký.' } } },
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [journalOne],
                page: 0,
                size: 20,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Lỗi tải nhật ký.');
      });

      failFirstJournal = false;
      clickElement(container!.querySelector('[aria-label="Thử lại tải nhật ký phát triển"]'));

      await waitFor(() => {
        expect(container!.textContent).toContain('1 ghi nhận');
        expect(container!.textContent).toContain('Sinh trưởng');
        expect(container!.textContent).toContain('Khỏe mạnh');
        expect(container!.textContent).toContain('Chồi non mọc thêm 4cm');
        expect(container!.textContent).toContain('09:00 • 12/11/2026 (VN)');
      });

      const imgs = Array.from(container!.querySelectorAll('img')).map((img) => img.getAttribute('src'));
      expect(imgs).toContain('https://cdn.goplant.vn/journal/jrn-1.jpg');

      clickElement(container!.querySelector('[aria-label="Thêm nhật ký cho cây này"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/journal/new',
        params: { plantId: 'plt-1' },
      });

      clickElement(container!.querySelector('[aria-label="Chi tiết nhật ký Sinh trưởng"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/journal/detail',
        params: { plantId: 'plt-1', journalId: 'jrn-1' },
      });

      clickElement(container!.querySelector('[aria-label="Chỉnh sửa nhật ký Sinh trưởng"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/journal/edit',
        params: { plantId: 'plt-1', journalId: 'jrn-1' },
      });
    });

    it('confirms Alert before DELETE /journals/{id} on PlantDetailScreen and clamps last-page delete back to page 0 without false empty state', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      let deletedPage1Last = false;
      let deleteHttpCalls = 0;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules' || config.url === '/plants/plt-1/care-logs') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: emptyPage<CareLogDto>(20) },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1/journals') {
          const reqPage = (config.params as { page?: number } | undefined)?.page ?? 0;
          if (!deletedPage1Last) {
            return Promise.resolve({
              status: 200,
              data: {
                success: true,
                data: {
                  content:
                    reqPage === 0
                      ? [journalOne]
                      : [{ ...journalTwo, id: 'jrn-21', note: 'Bản ghi cuối ở trang 2' }],
                  page: reqPage,
                  size: 20,
                  totalElements: 21,
                  totalPages: 2,
                  last: reqPage === 1,
                },
              },
              headers: {},
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: reqPage === 0 ? [journalOne] : [],
                page: reqPage,
                size: 20,
                totalElements: 20,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/journals/jrn-21' && config.method === 'delete') {
          deleteHttpCalls += 1;
          deletedPage1Last = true;
          return Promise.resolve({ status: 200, data: { success: true, data: { message: 'Deleted' } }, headers: {}, config });
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      let confirmButtons: { text?: string; style?: string; onPress?: () => void }[] = [];
      vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
        confirmButtons = (buttons as typeof confirmButtons) ?? [];
      });

      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('21 ghi nhận');
      });

      clickElement(container!.querySelector('[aria-label="Trang sau nhật ký phát triển"]'));
      await waitFor(() => {
        expect(container!.textContent).toContain('Bản ghi cuối ở trang 2');
        expect(container!.textContent).toContain('Trang 2 / 2');
      });

      clickElement(container!.querySelector('[aria-label="Xóa nhật ký Sâu bệnh"]'));
      expect(deleteHttpCalls).toBe(0);
      act(() => {
        confirmButtons.find((b) => b.style === 'cancel')?.onPress?.();
      });
      expect(deleteHttpCalls).toBe(0);

      clickElement(container!.querySelector('[aria-label="Xóa nhật ký Sâu bệnh"]'));
      await act(async () => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(deleteHttpCalls).toBe(1);
        expect(container!.textContent).toContain('20 ghi nhận');
        expect(container!.textContent).toContain('Chồi non mọc thêm 4cm');
        expect(container!.textContent).not.toContain('Chưa có nhật ký phát triển cho cây này.');
      });
    });

    it('prevents same-account placeholderData flash of plt-1 CareLogs & Journals when navigating plt-1 -> plt-2 on PlantDetailScreen', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      const deferredCareLogsP2 = createDeferred<void>();
      const deferredJournalsP2 = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/plants/plt-1') {
          return { status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config };
        }
        if (config.url === '/plants/plt-2') {
          return { status: 200, data: { success: true, data: plantDetailTwo }, headers: {}, config };
        }
        if (config.url === '/plants/plt-1/schedules' || config.url === '/plants/plt-2/schedules') {
          return { status: 200, data: { success: true, data: emptyPage<CareScheduleDto>(10) }, headers: {}, config };
        }
        if (config.url === '/plants/plt-1/care-logs') {
          return {
            status: 200,
            data: {
              success: true,
              data: { content: [careLogCompleted], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-1/journals') {
          return {
            status: 200,
            data: {
              success: true,
              data: { content: [journalOne], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-2/care-logs') {
          await deferredCareLogsP2.promise;
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...careLogCompleted, id: 'cl-p2', userPlantId: 'plt-2', note: 'Chăm sóc Sen Đá plt-2' }],
                page: 0,
                size: 20,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-2/journals') {
          await deferredJournalsP2.promise;
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [journalOtherPlant],
                page: 0,
                size: 20,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Tưới 300ml quanh gốc lúc sáng');
        expect(container!.textContent).toContain('Chồi non mọc thêm 4cm');
      });

      // Switch route param from plt-1 -> plt-2 while plt-2 subresources are pending
      routeParamsState.current = { plantId: 'plt-2' };
      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Sen Đá Bàn Làm Việc');
      });

      // Must NOT bleed plt-1's CareLog or Journal text while plt-2 loads!
      expect(container!.textContent).not.toContain('Tưới 300ml quanh gốc lúc sáng');
      expect(container!.textContent).not.toContain('Chồi non mọc thêm 4cm');

      await act(async () => {
        deferredCareLogsP2.resolve();
        deferredJournalsP2.resolve();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Chăm sóc Sen Đá plt-2');
        expect(container!.textContent).toContain('Nhật ký riêng của Sen Đá bàn làm việc');
      });
    });
  });

  describe('4. CreateCareLogScreen (/care-log/new) Integration', () => {
    it('loads real plants + preselected fallback detail, renders all 6 TaskType labels (no SKIPPED toggle), and validates offset TZ pre-flight', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-extra' };

      let postCalls = 0;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne], page: 0, size: 100, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-extra' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { ...plantDetailTwo, id: 'plt-extra', displayName: 'Cây Ngoài Trang Đầu' },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/care-logs' && config.method === 'post') {
          postCalls += 1;
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<CreateCareLogScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Ngoài Trang Đầu');
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });

      for (const label of [
        'Tưới nước',
        'Bón phân',
        'Cắt tỉa',
        'Kiểm tra sâu bệnh',
        'Phun sương',
        'Ghi nhận phát triển',
      ]) {
        expect(container!.textContent).toContain(label);
      }
      expect(container!.textContent).not.toContain('Đã bỏ qua');

      const timeInput = container!.querySelector('[aria-label="Thời điểm thực hiện"]');
      changeInputValue(timeInput, '2026-11-12T08:30:00');
      const saveBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Lưu ghi nhận chăm sóc')
      );
      clickElement(saveBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('bắt buộc phải có múi giờ hợp lệ');
      });
      expect(postCalls).toBe(0);
    });

    it('submits POST /care-logs without status, blocks double submit while pending, and surfaces 400/403 errors before retrying cleanly', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      let postCalls = 0;
      let serverFailMode: '403' | '400' | 'none' = '403';
      let postedBody: Record<string, unknown> | undefined;
      const deferredSuccess = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/plants' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne, plantSummaryTwo], page: 0, size: 100, totalElements: 2, totalPages: 1, last: true },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          return { status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config };
        }
        if (config.url === '/care-logs' && config.method === 'post') {
          postCalls += 1;
          postedBody = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          if (serverFailMode === '403') {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 403,
                data: { success: false, error: { code: 'FORBIDDEN', message: 'Không có quyền ghi nhận cây này.' } },
              },
              config,
            });
          }
          if (serverFailMode === '400') {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 400,
                data: { success: false, error: { code: 'BAD_REQUEST', message: 'Thời điểm chăm sóc không hợp lệ từ server.' } },
              },
              config,
            });
          }
          await deferredSuccess.promise;
          return {
            status: 201,
            data: { success: true, data: { ...careLogCompleted, userPlantId: 'plt-2', taskType: 'FERTILIZING' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<CreateCareLogScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Sen Đá Bàn Làm Việc');
      });

      const radios = Array.from(container!.querySelectorAll('[role="radio"]'));
      clickElement(radios.find((el) => el.textContent?.includes('Sen Đá Bàn Làm Việc')));
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Bón phân')
        )
      );
      changeInputValue(container!.querySelector('[aria-label="Ghi chú chăm sóc"]'), 'Bón NPK loãng');
      changeInputValue(container!.querySelector('[aria-label="Thời điểm thực hiện"]'), '2026-11-12 08:30');

      const saveBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Lưu ghi nhận chăm sóc')
      );
      clickElement(saveBtn);

      await waitFor(() => {
        expect(postCalls).toBe(1);
        expect(container!.textContent).toContain('Không có quyền ghi nhận cây này.');
      });

      serverFailMode = '400';
      clickElement(saveBtn);
      await waitFor(() => {
        expect(postCalls).toBe(2);
        expect(container!.textContent).toContain('Thời điểm chăm sóc không hợp lệ từ server.');
      });

      serverFailMode = 'none';
      clickElement(saveBtn);
      clickElement(saveBtn);
      await waitFor(() => expect(postCalls).toBe(3));

      await act(async () => {
        deferredSuccess.resolve();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(mockRouter.back).toHaveBeenCalledTimes(1);
      });
      expect(postedBody).toEqual({
        userPlantId: 'plt-2',
        taskType: 'FERTILIZING',
        note: 'Bón NPK loãng',
        performedAt: '2026-11-12T08:30:00+07:00',
      });
      expect(postedBody).not.toHaveProperty('status');
    });

    it('surfaces plant-list error with retry recovery and shows empty-plants CTA when user has 0 plants on /care-log/new', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = {};

      let failPlants = true;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants' && config.method === 'get') {
          if (failPlants) {
            return Promise.reject({
              isAxiosError: true,
              response: { status: 500, data: { success: false, error: { code: 'ERR', message: 'Không tải được cây trồng.' } } },
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: { success: true, data: emptyPage<UserPlantSummaryDto>(100) },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<CreateCareLogScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không tải được cây trồng.');
      });

      failPlants = false;
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Thử lại tải cây')
        )
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Bạn chưa có cây trồng nào');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Thêm cây mới')
        )
      );
      expect(mockRouter.push).toHaveBeenCalledWith('/garden/add-plant');
    });
  });

  describe('5. Journal Overview & CRUD Screens (/journal, /journal/new, /journal/edit, /journal/detail)', () => {
    it('JournalScreen (/journal) handles plants error -> retry -> empty state, uses real single-plant selector (0 N+1, 0 GET /journals), and deletes entries', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      const journalRequests: string[] = [];
      let plantsState: 'error' | 'empty' | 'ready' = 'error';
      let plant2List: GrowthJournalDto[] = [journalOtherPlant];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants' && config.method === 'get') {
          if (plantsState === 'error') {
            return Promise.reject({
              isAxiosError: true,
              response: { status: 500, data: { success: false, error: { code: 'ERR', message: 'Lỗi kết nối cây trồng.' } } },
              config,
            });
          }
          if (plantsState === 'empty') {
            return Promise.resolve({ status: 200, data: { success: true, data: emptyPage<UserPlantSummaryDto>(100) }, headers: {}, config });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne, plantSummaryTwo], page: 0, size: 100, totalElements: 2, totalPages: 1, last: true },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1/journals' && config.method === 'get') {
          journalRequests.push('plt-1');
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [journalOne], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-2/journals' && config.method === 'get') {
          journalRequests.push('plt-2');
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: plant2List,
                page: 0,
                size: 20,
                totalElements: plant2List.length,
                totalPages: plant2List.length > 0 ? 1 : 0,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/journals/jrn-plt2' && config.method === 'delete') {
          plant2List = [];
          return Promise.resolve({ status: 200, data: { success: true, data: { message: 'Deleted' } }, headers: {}, config });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      let confirmButtons: { text?: string; style?: string; onPress?: () => void }[] = [];
      vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
        confirmButtons = (buttons as typeof confirmButtons) ?? [];
      });

      mountWithProviders(<JournalScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Lỗi kết nối cây trồng.');
      });

      plantsState = 'empty';
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Thử lại')
      );
      await waitFor(() => {
        expect(container!.textContent).toContain('Bạn chưa có cây trồng nào');
      });

      plantsState = 'ready';
      clickElement(container!.querySelector('[aria-label="Làm mới nhật ký phát triển"]'));

      await waitFor(() => {
        expect(container!.textContent).toContain('Chồi non mọc thêm 4cm');
        expect(container!.textContent).toContain('Monstera Cửa Sổ • 1 ghi nhận');
      });

      expect(journalRequests).toEqual(['plt-1']);
      expect(container!.textContent).not.toContain('Chưa có nhật ký khu vườn');
      expect(container!.textContent).not.toContain('0 Ghi nhận');

      const plant2Pill = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Sen Đá Bàn Làm Việc'
      );
      clickElement(plant2Pill);

      await waitFor(() => {
        expect(container!.textContent).toContain('Nhật ký riêng của Sen Đá bàn làm việc');
        expect(container!.textContent).toContain('Sen Đá Bàn Làm Việc • 1 ghi nhận');
      });
      expect(journalRequests).toEqual(['plt-1', 'plt-2']);

      clickElement(container!.querySelector('[aria-label="Xóa nhật ký Khác"]'));
      await act(async () => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Chưa có bản ghi nhật ký phát triển nào cho cây đang chọn.');
      });
    });

    it('NewJournalScreen (/journal/new) preselects plantId, excludes UNKNOWN healthStatus, validates blank note before POST, and prevents double submit', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      const deferredPost = createDeferred<void>();
      let postCalls = 0;
      let postedBody: Record<string, unknown> | undefined;

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/plants' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne, plantSummaryTwo], page: 0, size: 100, totalElements: 2, totalPages: 1, last: true },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          return { status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config };
        }
        if (config.url === '/journals' && config.method === 'post') {
          postCalls += 1;
          postedBody = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          await deferredPost.promise;
          return { status: 201, data: { success: true, data: journalOne }, headers: {}, config };
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<NewJournalScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });

      expect(container!.textContent).toContain('Khỏe mạnh');
      expect(container!.textContent).toContain('Cần theo dõi');
      expect(container!.textContent).toContain('Nguy cấp / Cần can thiệp');
      expect(container!.textContent).not.toContain('Chưa xác định');

      const saveBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Lưu ghi nhận')
      );
      clickElement(saveBtn);
      await waitFor(() => {
        expect(container!.textContent).toContain('Ghi chú nhật ký không được để trống.');
      });
      expect(postCalls).toBe(0);

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent?.includes('Sâu bệnh'))
      );
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent?.includes('Nguy cấp'))
      );
      changeInputValue(container!.querySelector('[aria-label="Ghi chú nhật ký"]'), 'Phát hiện đốm nâu');
      changeInputValue(container!.querySelector('[aria-label="Thời điểm ghi nhận"]'), '2026-11-12 09:45');

      clickElement(saveBtn);
      clickElement(saveBtn);

      await waitFor(() => expect(postCalls).toBe(1));

      await act(async () => {
        deferredPost.resolve();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(mockRouter.back).toHaveBeenCalledTimes(1);
      });
      expect(postedBody).toEqual({
        userPlantId: 'plt-1',
        entryType: 'PEST',
        healthStatus: 'CRITICAL',
        note: 'Phát hiện đốm nâu',
        recordedAt: '2026-11-12T09:45:00+07:00',
      });
    });

    it('EditJournalScreen (/journal/edit) preserves images on text-only PUT, validates non-empty note, clears images when toggled, and renders 403/404 without demo fallback', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1', journalId: 'jrn-1' };

      const putPayloads: Record<string, unknown>[] = [];
      let journalFetchMode: 'ok' | '403' = 'ok';
      let currentJournal: GrowthJournalDto = { ...journalOne };

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/journals' && config.method === 'get') {
          if (journalFetchMode === '403') {
            return Promise.reject({
              isAxiosError: true,
              response: { status: 403, data: { success: false, error: { code: 'FORBIDDEN', message: 'Không có quyền sửa nhật ký.' } } },
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [currentJournal], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/journals/jrn-1' && config.method === 'put') {
          const payload = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          putPayloads.push(payload);
          currentJournal = {
            ...currentJournal,
            note: String(payload.note ?? currentJournal.note),
            imageUrls: Array.isArray(payload.imageUrls)
              ? (payload.imageUrls as string[])
              : currentJournal.imageUrls,
            recordedAt: String(payload.recordedAt ?? currentJournal.recordedAt),
          };
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: currentJournal,
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<EditJournalScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây trồng (không thể thay đổi khi chỉnh sửa)');
        const noteEl = container!.querySelector('[aria-label="Ghi chú nhật ký"]') as HTMLTextAreaElement;
        expect(noteEl.value).toBe('Chồi non mọc thêm 4cm, lá xanh bóng');
      });
      expect(container!.querySelectorAll('[role="radio"]').length).toBe(0);

      // Text-only PUT preserves existing images (omits imageUrls & recordedAt when untouched)
      const noteEl = container!.querySelector('[aria-label="Ghi chú nhật ký"]');
      changeInputValue(noteEl, '   ');
      const saveBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Lưu thay đổi')
      );
      clickElement(saveBtn);
      await waitFor(() => {
        expect(container!.textContent).toContain('Ghi chú nhật ký không được để trống.');
      });
      expect(putPayloads).toHaveLength(0);

      changeInputValue(noteEl, 'Chỉ cập nhật ghi chú');
      clickElement(saveBtn);
      await waitFor(() => expect(putPayloads).toHaveLength(1));
      expect(putPayloads[0]).toEqual({ note: 'Chỉ cập nhật ghi chú' });
      expect(putPayloads[0]).not.toHaveProperty('imageUrls');
      expect(putPayloads[0]).not.toHaveProperty('recordedAt');
      expect(putPayloads[0]).not.toHaveProperty('userPlantId');

      // Remount to verify recordedAt override + explicit clear images via imageUrls: []
      await act(async () => {
        root?.unmount();
      });
      root = createRoot(container!);
      mockRouter.back.mockClear();
      mountWithProviders(<EditJournalScreen />);

      await waitFor(() => {
        expect((container!.querySelector('[aria-label="Ghi chú nhật ký"]') as HTMLTextAreaElement).value).toBe(
          'Chỉ cập nhật ghi chú'
        );
      });

      changeInputValue(container!.querySelector('[aria-label="Ghi chú nhật ký"]'), 'Đã xóa ảnh & đổi giờ');
      changeInputValue(container!.querySelector('[aria-label="Thời điểm ghi nhận"]'), '2026-11-12 11:30');
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Xóa toàn bộ ảnh đã lưu')
        )
      );
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Lưu thay đổi')
        )
      );

      await waitFor(() => expect(putPayloads).toHaveLength(2));
      expect(putPayloads[1]).toEqual({
        note: 'Đã xóa ảnh & đổi giờ',
        imageUrls: [],
        recordedAt: '2026-11-12T11:30:00+07:00',
      });

      // Verify 403 forbidden error screen without demo data
      await act(async () => {
        root?.unmount();
      });
      root = createRoot(container!);
      qc.clear();
      journalFetchMode = '403';
      mountWithProviders(<EditJournalScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không có quyền chỉnh sửa nhật ký');
      });
      expect(container!.textContent).not.toContain('Chồi non mọc thêm 4cm');
    });

    it('JournalDetailScreen (/journal/detail?plantId=&journalId=) uses cache hit first (0 extra HTTP), scans uncached pages, deletes without 404 refetch, and renders 403/404 cleanly', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      // Part 1: Cache-hit lookup avoids extra GET /plants/plt-1/journals
      qc.setQueryData(queryKeys.journals.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }), {
        content: [journalOne],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });

      let journalListGetCalls = 0;
      let deleted = false;
      let spuriousRefetch = false;
      let errStatus: 404 | 403 = 404;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/journals' && config.method === 'get') {
          journalListGetCalls += 1;
          if (errStatus === 403) {
            return Promise.reject({
              isAxiosError: true,
              response: { status: 403, data: { success: false, error: { code: 'FORBIDDEN', message: 'Không có quyền xem nhật ký.' } } },
              config,
            });
          }
          if (deleted && routeParamsState.current.journalId === 'jrn-2') {
            spuriousRefetch = true;
          }
          const reqPage = (config.params as { page?: number } | undefined)?.page ?? 0;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: reqPage === 0 ? [journalOne] : deleted ? [] : [journalTwo],
                page: reqPage,
                size: 20,
                totalElements: deleted ? 1 : 2,
                totalPages: deleted ? 1 : 2,
                last: deleted || reqPage === 1,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/journals/jrn-2' && config.method === 'delete') {
          deleted = true;
          return Promise.resolve({ status: 200, data: { success: true, data: { message: 'Deleted' } }, headers: {}, config });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      routeParamsState.current = { plantId: 'plt-1', journalId: 'jrn-1' };
      mountWithProviders(<JournalDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Chồi non mọc thêm 4cm, lá xanh bóng');
      });
      expect(journalListGetCalls).toBe(0);

      // Part 2: Deep-link uncached page-2 lookup + Delete without spurious 404 refetch
      await act(async () => {
        root?.unmount();
      });
      root = createRoot(container!);
      qc.clear();

      let confirmButtons: { text?: string; style?: string; onPress?: () => void }[] = [];
      vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
        confirmButtons = (buttons as typeof confirmButtons) ?? [];
      });

      routeParamsState.current = { plantId: 'plt-1', journalId: 'jrn-2' };
      mountWithProviders(<JournalDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Phát hiện rệp sáp mặt dưới lá');
        expect(container!.textContent).toContain('23:45 • 11/11/2026 (VN)');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Xóa nhật ký')
        )
      );
      await act(async () => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(deleted).toBe(true);
        expect(mockRouter.back).toHaveBeenCalledTimes(1);
      });
      expect(spuriousRefetch).toBe(false);

      // Part 3: 404 and 403 screens show clean error states with 0 demo fallback
      await act(async () => {
        root?.unmount();
      });
      root = createRoot(container!);
      qc.clear();
      routeParamsState.current = { plantId: 'plt-1', journalId: 'jrn-unknown' };
      mountWithProviders(<JournalDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không tìm thấy nhật ký phát triển');
      });
      expect(container!.textContent).not.toContain('Nhật ký khu vườn');

      await act(async () => {
        root?.unmount();
      });
      root = createRoot(container!);
      qc.clear();
      errStatus = 403;
      routeParamsState.current = { plantId: 'plt-1', journalId: 'jrn-1' };
      mountWithProviders(<JournalDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không có quyền truy cập nhật ký');
      });
    });

    it('JournalDetailScreen Timeline mode (/journal/detail?plantId= without journalId) paginates real entries and navigates to detail & new journal', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/journals' && config.method === 'get') {
          const reqPage = (config.params as { page?: number } | undefined)?.page ?? 0;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: reqPage === 0 ? [journalOne] : [journalTwo],
                page: reqPage,
                size: 20,
                totalElements: 21,
                totalPages: 2,
                last: reqPage === 1,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<JournalDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('21 ghi nhận');
        expect(container!.textContent).toContain('Chồi non mọc thêm 4cm, lá xanh bóng');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Trang sau')
        )
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Phát hiện rệp sáp mặt dưới lá');
        expect(container!.textContent).toContain('Trang 2 / 2');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Xem chi tiết')
        )
      );
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/journal/detail',
        params: { plantId: 'plt-1', journalId: 'jrn-2' },
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Thêm ghi nhận mới')
        )
      );
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/journal/new',
        params: { plantId: 'plt-1' },
      });
    });
  });

  describe('6. Account Isolation & Cross-Module Cache Sync (G5.4.1 / G5.4.2 / G5.4.3)', () => {
    it('isolates in-flight Account A CareLog & Journal queries when switching A -> B via AuthProvider (zero User A leak into B UI or cache)', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingCareLogsA = createDeferred<void>();
      const pendingJournalsA = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const auth = String(config.headers?.Authorization ?? '');
        const isB = auth === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login') {
          const payload = JSON.parse(String(config.data ?? '{}')) as { account?: string };
          return {
            status: 200,
            data: { success: true, data: payload.account === mockUserB.email ? sessionB : sessionA },
            headers: {},
            config,
          };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/plants/plt-shared' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                ...plantDetailOne,
                id: 'plt-shared',
                displayName: isB ? 'Cây Riêng Của B' : 'Cây Riêng Của A',
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-shared/schedules' && config.method === 'get') {
          return { status: 200, data: { success: true, data: emptyPage<CareScheduleDto>(10) }, headers: {}, config };
        }
        if (config.url === '/plants/plt-shared/care-logs' && config.method === 'get') {
          if (!isB) {
            await pendingCareLogsA.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  content: [{ ...careLogCompleted, userPlantId: 'plt-shared', note: 'BÍ MẬT CHĂM SÓC CỦA A' }],
                  page: 0,
                  size: 20,
                  totalElements: 1,
                  totalPages: 1,
                  last: true,
                },
              },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...careLogCompleted, id: 'cl-b', userPlantId: 'plt-shared', note: 'Lịch sử sạch của B' }],
                page: 0,
                size: 20,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-shared/journals' && config.method === 'get') {
          if (!isB) {
            await pendingJournalsA.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  content: [{ ...journalOne, userPlantId: 'plt-shared', note: 'BÍ MẬT NHẬT KÝ CỦA A' }],
                  page: 0,
                  size: 20,
                  totalElements: 1,
                  totalPages: 1,
                  last: true,
                },
              },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...journalOne, id: 'jrn-b', userPlantId: 'plt-shared', note: 'Nhật ký sạch của B' }],
                page: 0,
                size: 20,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      function Probe() {
        authCtx = useAuth();
        usePlantCareLogs('plt-shared', { page: 0, size: 20 });
        usePlantJournals('plt-shared', { page: 0, size: 20 });
        return null;
      }

      routeParamsState.current = { plantId: 'plt-shared' };
      mountWithProviders(
        <>
          <Probe />
          <PlantDetailScreen />
        </>
      );

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
        expect(container!.textContent).toContain('Cây Riêng Của A');
      });

      // Switch to User B while User A's care-logs & journals HTTP calls are still pending
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'pw' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Lịch sử sạch của B');
        expect(container!.textContent).toContain('Nhật ký sạch của B');
      });

      // Now settle User A's slow queries -> must NEVER pollute User B UI or User B caches
      await act(async () => {
        pendingCareLogsA.resolve();
        pendingJournalsA.resolve();
        await flushAsync(40);
      });

      expect(container!.textContent).not.toContain('BÍ MẬT CHĂM SÓC CỦA A');
      expect(container!.textContent).not.toContain('BÍ MẬT NHẬT KÝ CỦA A');
      expect(
        qc.getQueryData<PageResponse<CareLogDto>>(
          queryKeys.careLogs.list(mockUserB.id, 'plt-shared', { page: 0, size: 20 })
        )?.content[0].note
      ).toBe('Lịch sử sạch của B');
      expect(
        qc.getQueryData<PageResponse<GrowthJournalDto>>(
          queryKeys.journals.list(mockUserB.id, 'plt-shared', { page: 0, size: 20 })
        )?.content[0].note
      ).toBe('Nhật ký sạch của B');
    });

    it('isolates pending User A mutations settling after User B login (SESSION_USER_MISMATCH, masks isPending, suppresses UI navigation)', async () => {
      await tokenStorage.saveSession(sessionA);
      const pCareA = createDeferred<void>();
      const pCreateJournalA = createDeferred<void>();
      const pUpdateJournalA = createDeferred<void>();
      const pDeleteJournalA = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const auth = String(config.headers?.Authorization ?? '');
        const isB = auth === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login') {
          const payload = JSON.parse(String(config.data ?? '{}')) as { account?: string };
          return {
            status: 200,
            data: { success: true, data: payload.account === mockUserB.email ? sessionB : sessionA },
            headers: {},
            config,
          };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/plants' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne], page: 0, size: 100, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/care-logs' && config.method === 'post') {
          expect(auth).toBe(`Bearer ${sessionA.accessToken}`);
          await pCareA.promise;
          return { status: 201, data: { success: true, data: careLogCompleted }, headers: {}, config };
        }
        if (config.url === '/journals' && config.method === 'post') {
          expect(auth).toBe(`Bearer ${sessionA.accessToken}`);
          await pCreateJournalA.promise;
          return { status: 201, data: { success: true, data: journalOne }, headers: {}, config };
        }
        if (config.url === '/journals/jrn-1' && config.method === 'put') {
          expect(auth).toBe(`Bearer ${sessionA.accessToken}`);
          await pUpdateJournalA.promise;
          return {
            status: 200,
            data: { success: true, data: { ...journalOne, note: 'Bị ghi đè bởi A' } },
            headers: {},
            config,
          };
        }
        if (config.url === '/journals/jrn-1' && config.method === 'delete') {
          expect(auth).toBe(`Bearer ${sessionA.accessToken}`);
          await pDeleteJournalA.promise;
          return { status: 200, data: { success: true, data: { message: 'Deleted by A' } }, headers: {}, config };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let createCareMut!: ReturnType<typeof useCreateCareLogMutation>;
      let createJMut!: ReturnType<typeof useCreateJournalMutation>;
      let updateJMut!: ReturnType<typeof useUpdateJournalMutation>;
      let deleteJMut!: ReturnType<typeof useDeleteJournalMutation>;

      function Probe() {
        authCtx = useAuth();
        createCareMut = useCreateCareLogMutation();
        createJMut = useCreateJournalMutation();
        updateJMut = useUpdateJournalMutation();
        deleteJMut = useDeleteJournalMutation();
        return null;
      }

      mountWithProviders(
        <>
          <Probe />
          <CreateCareLogScreen />
        </>
      );

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });

      // Trigger CreateCareLogScreen submit + background hook mutations for A
      clickElement(
        Array.from(container!.querySelectorAll('[role="radio"]')).find((el) =>
          el.textContent?.includes('Monstera Cửa Sổ')
        )
      );
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Lưu ghi nhận chăm sóc')
        )
      );

      let resCare!: Promise<unknown>;
      let resCreateJ!: Promise<unknown>;
      let resUpdateJ!: Promise<unknown>;
      let resDeleteJ!: Promise<unknown>;

      act(() => {
        resCare = createCareMut
          .mutateAsync({ userPlantId: 'plt-1', taskType: 'WATERING', note: 'A' })
          .catch((e) => e);
        resCreateJ = createJMut.mutateAsync({ userPlantId: 'plt-1', note: 'A' }).catch((e) => e);
        resUpdateJ = updateJMut
          .mutateAsync({ journalId: 'jrn-1', plantId: 'plt-1', data: { note: 'A update' } })
          .catch((e) => e);
        resDeleteJ = deleteJMut.mutateAsync({ journalId: 'jrn-1', plantId: 'plt-1' }).catch((e) => e);
      });

      await waitFor(() => expect(createCareMut.isPending).toBe(true));
      const genDuringA = tokenStorage.getSessionGeneration();

      // Switch to User B while all A mutations are still in flight
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'pw' });
      });

      // Queued / pre-flight API calls carrying User A identity reject immediately with SESSION_USER_MISMATCH
      await expect(
        createCareLog(
          { userPlantId: 'plt-1', taskType: 'WATERING', note: 'stale' },
          { expectedUserId: mockUserA.id, expectedSessionGeneration: genDuringA }
        )
      ).rejects.toMatchObject({ code: 'SESSION_USER_MISMATCH' });
      await expect(
        createJournal(
          { userPlantId: 'plt-1', note: 'stale' },
          { expectedUserId: mockUserA.id, expectedSessionGeneration: genDuringA }
        )
      ).rejects.toMatchObject({ code: 'SESSION_USER_MISMATCH' });

      qc.setQueryData(queryKeys.careLogs.list(mockUserB.id, 'plt-1', { page: 0, size: 20 }), {
        content: [{ ...careLogCompleted, id: 'cl-b-keep', note: 'Sạch của B' }],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });
      qc.setQueryData(queryKeys.journals.list(mockUserB.id, 'plt-1', { page: 0, size: 20 }), {
        content: [{ ...journalOne, id: 'jrn-1', note: 'Sạch của B' }],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });
      qc.setQueryData(queryKeys.journals.detailLookup(mockUserB.id, 'plt-1', 'jrn-1'), {
        ...journalOne,
        id: 'jrn-1',
        note: 'Sạch của B',
      });

      expect(createCareMut.isPending).toBe(false);
      expect(createJMut.isPending).toBe(false);
      expect(updateJMut.isPending).toBe(false);
      expect(deleteJMut.isPending).toBe(false);

      await act(async () => {
        pCareA.resolve();
        pCreateJournalA.resolve();
        pUpdateJournalA.resolve();
        pDeleteJournalA.resolve();
        await flushAsync(40);
      });

      await Promise.all([resCare, resCreateJ, resUpdateJ, resDeleteJ]);

      // UI screen must suppress stale router.back / router.replace & error banner
      expect(mockRouter.back).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();

      // User B caches remain intact & un-invalidated despite late A responses resolving (verifyActiveSessionOwner blocked onSuccess)
      expect(
        qc.getQueryData<PageResponse<CareLogDto>>(
          queryKeys.careLogs.list(mockUserB.id, 'plt-1', { page: 0, size: 20 })
        )?.content[0].note
      ).toBe('Sạch của B');
      expect(
        qc.getQueryState(queryKeys.careLogs.list(mockUserB.id, 'plt-1', { page: 0, size: 20 }))
          ?.isInvalidated
      ).toBe(false);
      expect(
        qc.getQueryData<PageResponse<GrowthJournalDto>>(
          queryKeys.journals.list(mockUserB.id, 'plt-1', { page: 0, size: 20 })
        )?.content[0].note
      ).toBe('Sạch của B');
      expect(
        qc.getQueryData<GrowthJournalDto>(
          queryKeys.journals.detailLookup(mockUserB.id, 'plt-1', 'jrn-1')
        )?.note
      ).toBe('Sạch của B');
    });

    it('synchronizes CareLog caches on Schedule Complete & Skip (resolving plantId via schedules.today) without touching other plants', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/schedules/sch-1/complete' && config.method === 'post') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                careLogId: 'cl-gen-1',
                scheduleStatus: 'ACTIVE',
                nextScheduledAt: '2026-11-15T01:00:00Z',
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/schedules/sch-2/skip' && config.method === 'post') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                careLogId: 'cl-gen-2',
                scheduleStatus: 'ACTIVE',
                nextScheduledAt: '2026-11-16T01:00:00Z',
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      const todayForSch1: TodayScheduleItemDto = {
        scheduleId: 'sch-1',
        plantId: 'plt-1',
        plantName: 'Monstera',
        gardenName: 'Ban công',
        taskType: 'WATERING',
        taskLabel: null,
        nextScheduledAt: '2026-11-12T01:00:00Z',
        isOverdue: false,
        status: 'ACTIVE',
      };
      const todayForSch2: TodayScheduleItemDto = {
        ...todayForSch1,
        scheduleId: 'sch-2',
        plantId: 'plt-2',
      };

      qc.setQueryData(queryKeys.schedules.today(mockUserA.id), [todayForSch1, todayForSch2]);
      qc.setQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }), {
        content: [careLogCompleted],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });
      qc.setQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-2', { page: 0, size: 20 }), {
        content: [{ ...careLogCompleted, id: 'cl-p2', userPlantId: 'plt-2' }],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });

      let completeMut!: ReturnType<typeof useCompleteScheduleMutation>;
      let skipMut!: ReturnType<typeof useSkipScheduleMutation>;

      function Probe() {
        completeMut = useCompleteScheduleMutation();
        skipMut = useSkipScheduleMutation();
        return null;
      }

      mountWithProviders(<Probe />);
      await waitFor(() => expect(qc.getQueryData(queryKeys.schedules.today(mockUserA.id))).toBeDefined());

      await act(async () => {
        await completeMut.mutateAsync({ scheduleId: 'sch-1' });
      });
      expect(
        qc.getQueryState(queryKeys.careLogs.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }))
          ?.isInvalidated
      ).toBe(true);
      expect(
        qc.getQueryState(queryKeys.careLogs.list(mockUserA.id, 'plt-2', { page: 0, size: 20 }))
          ?.isInvalidated
      ).toBe(false);

      await act(async () => {
        await skipMut.mutateAsync({ scheduleId: 'sch-2', plantId: 'plt-2' });
      });
      expect(
        qc.getQueryState(queryKeys.careLogs.list(mockUserA.id, 'plt-2', { page: 0, size: 20 }))
          ?.isInvalidated
      ).toBe(true);
    });

    it('synchronizes CareLog & Journal caches on Plant Update/Delete and Garden Delete (preserving unrelated gardens & avoiding 404 refetches)', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1' && config.method === 'put') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { ...plantDetailOne, displayName: 'Monstera Đổi Tên' } },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1' && config.method === 'delete') {
          return Promise.resolve({ status: 200, data: { success: true, data: { message: 'Deleted plant' } }, headers: {}, config });
        }
        if (config.url === '/gardens/grd-3' && config.method === 'delete') {
          return Promise.resolve({ status: 200, data: { success: true, data: { message: 'Deleted garden' } }, headers: {}, config });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      const seedPlant1Caches = () => {
        qc.setQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }), {
          content: [careLogCompleted],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          last: true,
        });
        qc.setQueryData(queryKeys.journals.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }), {
          content: [journalOne],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          last: true,
        });
        qc.setQueryData(queryKeys.journals.detailLookup(mockUserA.id, 'plt-1', 'jrn-1'), journalOne);
      };

      seedPlant1Caches();
      qc.setQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-2', { page: 0, size: 20 }), {
        content: [{ ...careLogCompleted, id: 'cl-p2', userPlantId: 'plt-2' }],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });
      qc.setQueryData(queryKeys.journals.list(mockUserA.id, 'plt-2', { page: 0, size: 20 }), {
        content: [journalOtherPlant],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });

      let updatePlantMut!: ReturnType<typeof useUpdatePlantMutation>;
      let deletePlantMut!: ReturnType<typeof useDeletePlantMutation>;
      let deleteGardenMut!: ReturnType<typeof useDeleteGardenMutation>;

      function Probe() {
        updatePlantMut = useUpdatePlantMutation();
        deletePlantMut = useDeletePlantMutation();
        deleteGardenMut = useDeleteGardenMutation();
        return null;
      }

      mountWithProviders(<Probe />);
      await waitFor(() =>
        expect(qc.getQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }))).toBeDefined()
      );

      // 1) Plant Update invalidates plt-1 careLogs & journals
      await act(async () => {
        await updatePlantMut.mutateAsync({
          plantId: 'plt-1',
          data: { displayName: 'Monstera Đổi Tên' },
        });
      });
      expect(
        qc.getQueryState(queryKeys.careLogs.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }))
          ?.isInvalidated
      ).toBe(true);
      expect(
        qc.getQueryState(queryKeys.journals.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }))
          ?.isInvalidated
      ).toBe(true);

      // 2) Plant Delete removes plt-1 careLogs, journals & detailLookup while preserving plt-2
      await act(async () => {
        await deletePlantMut.mutateAsync('plt-1');
      });
      expect(
        qc.getQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }))
      ).toBeUndefined();
      expect(
        qc.getQueryData(queryKeys.journals.list(mockUserA.id, 'plt-1', { page: 0, size: 20 }))
      ).toBeUndefined();
      expect(
        qc.getQueryData(queryKeys.journals.detailLookup(mockUserA.id, 'plt-1', 'jrn-1'))
      ).toBeUndefined();
      expect(
        qc.getQueryData(queryKeys.journals.list(mockUserA.id, 'plt-2', { page: 0, size: 20 }))
      ).toBeDefined();

      // 3) Garden Delete removes CareLogs & Journals for plants resolved from garden-filtered plants list & plant details while keeping plt-2 (in grd-2) intact
      qc.setQueryData(queryKeys.plants.detail(mockUserA.id, 'plt-3'), {
        ...plantDetailOne,
        id: 'plt-3',
        garden: { id: 'grd-3', name: 'Vườn Bị Xóa' },
      });
      qc.setQueryData(
        queryKeys.plants.list(mockUserA.id, {
          gardenId: 'grd-3',
          page: 0,
          size: 20,
          sort: 'displayName,asc',
        }),
        {
          content: [{ ...plantSummaryOne, id: 'plt-4', displayName: 'Cây Trong Vườn Xóa' }],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          last: true,
        }
      );
      qc.setQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-3', { page: 0, size: 20 }), {
        content: [{ ...careLogCompleted, id: 'cl-3', userPlantId: 'plt-3' }],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });
      qc.setQueryData(queryKeys.journals.list(mockUserA.id, 'plt-4', { page: 0, size: 20 }), {
        content: [{ ...journalOne, id: 'jrn-4', userPlantId: 'plt-4' }],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });
      qc.setQueryData(queryKeys.journals.detailLookup(mockUserA.id, 'plt-3', 'jrn-3'), {
        ...journalOne,
        id: 'jrn-3',
        userPlantId: 'plt-3',
      });

      await act(async () => {
        await deleteGardenMut.mutateAsync('grd-3');
      });

      expect(
        qc.getQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-3', { page: 0, size: 20 }))
      ).toBeUndefined();
      expect(
        qc.getQueryData(queryKeys.journals.list(mockUserA.id, 'plt-4', { page: 0, size: 20 }))
      ).toBeUndefined();
      expect(
        qc.getQueryData(queryKeys.journals.detailLookup(mockUserA.id, 'plt-3', 'jrn-3'))
      ).toBeUndefined();
      expect(
        qc.getQueryData(queryKeys.careLogs.list(mockUserA.id, 'plt-2', { page: 0, size: 20 }))
      ).toBeDefined();
      expect(
        qc.getQueryData(queryKeys.journals.list(mockUserA.id, 'plt-2', { page: 0, size: 20 }))
      ).toBeDefined();
    });
  });
});
