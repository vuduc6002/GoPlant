import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useDeleteGardenMutation } from '@/features/gardens/gardenHooks';
import { type GardenSummaryDto } from '@/features/gardens/gardenTypes';
import HomeScreen from '@/features/home/HomeScreen';
import { GardensScreen, ScheduleScreen } from '@/features/main/MainScreens';
import PlantDetailScreen from '@/features/plants/PlantDetailScreen';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
import {
  useDeletePlantMutation,
  useUpdatePlantMutation,
} from '@/features/plants/plantHooks';
import {
  type UserPlantDetailDto,
  type UserPlantSummaryDto,
} from '@/features/plants/plantTypes';
import {
  CreateScheduleScreen,
  ScheduleDetailScreen,
} from '@/features/schedule/ScheduleScreens';
import {
  buildCreateSchedulePayload,
  buildUpdateSchedulePayload,
  completeSchedule,
  createSchedule,
  deleteSchedule,
  formatNextScheduledAtVn,
  getNextVnMidnightMs,
  getPlantSchedules,
  getScheduleRuntimeState,
  getTodaySchedules,
  getTodayVnDateString,
  getVnDateKeyFromIso,
  isScheduleDueNow,
  skipSchedule,
  updateSchedule,
} from '@/features/schedule/scheduleApi';
import {
  DEFAULT_SCHEDULE_CLOCK_INTERVAL_MS,
  ScreenFocusProvider,
  useScheduleClock,
} from '@/features/schedule/useScheduleClock';
import {
  useCompleteScheduleMutation,
  useCreateScheduleMutation,
  useDeleteScheduleMutation,
  usePlantSchedules,
  useSkipScheduleMutation,
  useTodaySchedules,
  useUpdateScheduleMutation,
} from '@/features/schedule/scheduleHooks';
import {
  type CareScheduleDto,
  type TodayScheduleItemDto,
} from '@/features/schedule/scheduleTypes';
import { apiClient } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { AuthSession, PageResponse, UserProfileDto } from '@/services/api/apiTypes';
import * as tokenStorage from '@/services/api/tokenStorage';
import { shouldRetry } from '@/services/query/queryClient';
import { queryKeys } from '@/services/query/queryKeys';

/**
 * NOTE ON TEST SCOPE:
 * These automated unit & integration tests run in Vitest (happy-dom) using an Axios adapter mock
 * and do NOT connect to a live Spring Boot socket or run real Android Emulator UI rendering.
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
  id: 'usr_sch_a',
  fullName: 'Nguyễn Minh Khoa',
  email: 'khoa@goplant.vn',
  roles: ['ROLE_USER'],
};

const mockUserB = {
  id: 'usr_sch_b',
  fullName: 'Lê Thanh Hằng',
  email: 'hang@goplant.vn',
  roles: ['ROLE_USER'],
};

const sessionA: AuthSession = {
  accessToken: 'jwt-schedule-token-user-a',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUserA,
  savedAt: Date.now(),
};

const sessionB: AuthSession = {
  accessToken: 'jwt-schedule-token-user-b',
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

const gardenSummaryOne: GardenSummaryDto = {
  id: 'grd-1',
  name: 'Ban công hướng Đông',
  location: 'Tầng 4',
  spaceType: 'BAN_CONG',
  coverImageUrl: null,
  plantCount: 1,
  createdAt: '2026-01-02T00:00:00Z',
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
  gardenName: 'Góc bàn làm việc',
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

const pastDueIso = '2026-01-10T01:00:00Z';
const futureIso = '2099-12-31T16:30:00Z';

const todayOverdueItem: TodayScheduleItemDto = {
  scheduleId: 'sch-1',
  plantId: 'plt-1',
  plantName: 'Monstera Cửa Sổ',
  gardenName: 'Ban công hướng Đông',
  taskType: 'WATERING',
  taskLabel: 'Tưới 300ml nước quanh gốc',
  nextScheduledAt: pastDueIso,
  isOverdue: true,
  status: 'ACTIVE',
};

const todayOnceDueItem: TodayScheduleItemDto = {
  scheduleId: 'sch-once',
  plantId: 'plt-2',
  plantName: 'Sen Đá Bàn Làm Việc',
  gardenName: null,
  taskType: 'FERTILIZING',
  taskLabel: null,
  nextScheduledAt: pastDueIso,
  isOverdue: false,
  status: 'ACTIVE',
};

const todayNotYetDueItem: TodayScheduleItemDto = {
  scheduleId: 'sch-future',
  plantId: 'plt-1',
  plantName: 'Monstera Cửa Sổ',
  gardenName: 'Ban công hướng Đông',
  taskType: 'MISTING',
  taskLabel: 'Phun sương tối',
  nextScheduledAt: futureIso,
  isOverdue: false,
  status: 'ACTIVE',
};

const scheduleDetailOne: CareScheduleDto = {
  id: 'sch-1',
  userPlantId: 'plt-1',
  plantName: 'Monstera Cửa Sổ',
  taskType: 'WATERING',
  taskLabel: 'Tưới 300ml nước quanh gốc',
  frequency: 'CUSTOM',
  intervalDays: 3,
  reminderTime: '08:00:00',
  startDate: '2026-11-11',
  endDate: '2027-01-15',
  nextScheduledAt: pastDueIso,
  isOverdue: true,
  status: 'ACTIVE',
};

const scheduleDetailPaused: CareScheduleDto = {
  id: 'sch-2',
  userPlantId: 'plt-1',
  plantName: 'Monstera Cửa Sổ',
  taskType: 'PRUNING',
  taskLabel: null,
  frequency: 'WEEKLY',
  intervalDays: null,
  reminderTime: '17:30:00',
  startDate: '2026-11-11',
  endDate: null,
  nextScheduledAt: futureIso,
  isOverdue: false,
  status: 'PAUSED',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
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

describe('G5.4.2 Care Schedules REST API Integration (Mocked Axios HTTP Adapter)', () => {
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

  describe('1. scheduleApi Contract, Validation & Tri-State Semantics', () => {
    it('calls only exact Backend Schedule endpoints and never GET /schedules or GET /schedules/{id}', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      const calledUrls: string[] = [];
      const adapterSpy = vi.fn().mockImplementation((config) => {
        calledUrls.push(`${String(config.method).toUpperCase()} ${config.url}`);
        if (config.url === '/schedules/today' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [todayOverdueItem, todayOnceDueItem] },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          expect(config.params).toEqual({ status: 'ACTIVE', page: 0, size: 10 });
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [scheduleDetailOne],
                page: 0,
                size: 10,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Forbidden or unexpected endpoint: ${config.method} ${config.url}`);
      });
      apiClient.defaults.adapter = adapterSpy;

      const today = await getTodaySchedules();
      expect(today).toHaveLength(2);
      expect(today[0].isOverdue).toBe(true);
      expect(today[1].gardenName).toBeNull();
      expect(today[1].taskLabel).toBeNull();

      const page = await getPlantSchedules('plt-1', { status: 'ACTIVE', page: -2, size: 10 });
      expect(page.content[0].intervalDays).toBe(3);

      expect(calledUrls).not.toContain('GET /schedules');
      expect(calledUrls).not.toContain('GET /schedules/sch-1');
    });

    it('validates create inputs locally (past dateVN, endDate < startDate, CUSTOM intervalDays, reminderTime, taskLabel length)', async () => {
      const adapterSpy = vi.fn();
      apiClient.defaults.adapter = adapterSpy;

      const todayVn = getTodayVnDateString();
      expect(() =>
        buildCreateSchedulePayload(
          {
            userPlantId: ' ',
            taskType: 'WATERING',
            frequency: 'DAILY',
            startDate: todayVn,
          },
          todayVn
        )
      ).toThrowError(AppApiError);

      await expect(
        createSchedule({
          userPlantId: 'plt-1',
          taskType: 'WATERING',
          frequency: 'DAILY',
          startDate: '2020-01-01',
        })
      ).rejects.toMatchObject({ field: 'startDate', statusCode: 400 });

      await expect(
        createSchedule({
          userPlantId: 'plt-1',
          taskType: 'WATERING',
          frequency: 'DAILY',
          startDate: '2099-05-10',
          endDate: '2099-05-09',
        })
      ).rejects.toMatchObject({ field: 'endDate', statusCode: 400 });

      await expect(
        createSchedule({
          userPlantId: 'plt-1',
          taskType: 'WATERING',
          frequency: 'CUSTOM',
          intervalDays: 0,
          startDate: '2099-05-10',
        })
      ).rejects.toMatchObject({ field: 'intervalDays', statusCode: 400 });

      await expect(
        createSchedule({
          userPlantId: 'plt-1',
          taskType: 'WATERING',
          frequency: 'DAILY',
          intervalDays: 3,
          startDate: '2099-05-10',
        })
      ).rejects.toMatchObject({ field: 'intervalDays', statusCode: 400 });

      await expect(
        createSchedule({
          userPlantId: 'plt-1',
          taskType: 'WATERING',
          frequency: 'DAILY',
          reminderTime: '25:99:00',
          startDate: '2099-05-10',
        })
      ).rejects.toMatchObject({ field: 'reminderTime', statusCode: 400 });

      await expect(
        createSchedule({
          userPlantId: 'plt-1',
          taskType: 'WATERING',
          taskLabel: 'A'.repeat(201),
          frequency: 'DAILY',
          startDate: '2099-05-10',
        })
      ).rejects.toMatchObject({ field: 'taskLabel', statusCode: 400 });

      expect(adapterSpy).not.toHaveBeenCalled();

      const valid = buildCreateSchedulePayload(
        {
          userPlantId: 'plt-1',
          taskType: 'PRUNING',
          taskLabel: '   ',
          frequency: 'EVERY_OTHER_DAY',
          intervalDays: null,
          reminderTime: '07:30',
          startDate: todayVn,
        },
        todayVn
      );
      expect(valid).toEqual({
        userPlantId: 'plt-1',
        taskType: 'PRUNING',
        frequency: 'EVERY_OTHER_DAY',
        intervalDays: null,
        reminderTime: '07:30:00',
        startDate: todayVn,
      });
    });

    it('builds tri-state UpdateScheduleRequest preserving omitted keys and sending explicit null clears', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      const partialPayload = buildUpdateSchedulePayload({
        taskLabel: '  ',
        reminderTime: null,
        endDate: null,
        frequency: 'WEEKLY',
      });
      expect(partialPayload).toEqual({
        taskLabel: null,
        reminderTime: null,
        endDate: null,
        frequency: 'WEEKLY',
        intervalDays: null,
      });
      expect(Object.prototype.hasOwnProperty.call(partialPayload, 'startDate')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(partialPayload, 'status')).toBe(false);

      const onlyLabelPayload = buildUpdateSchedulePayload({ taskLabel: 'Tưới sương' });
      expect(Object.keys(onlyLabelPayload)).toEqual(['taskLabel']);

      let capturedPutBody: Record<string, unknown> | undefined;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/schedules/sch-1' && config.method === 'put') {
          capturedPutBody = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                ...scheduleDetailOne,
                taskLabel: null,
                reminderTime: '08:00:00',
                endDate: null,
                frequency: 'DAILY',
                intervalDays: null,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      const updated = await updateSchedule('sch-1', {
        taskLabel: null,
        reminderTime: null,
        endDate: null,
        frequency: 'DAILY',
        intervalDays: null,
      });
      expect(capturedPutBody).toEqual({
        taskLabel: null,
        reminderTime: null,
        endDate: null,
        frequency: 'DAILY',
        intervalDays: null,
      });
      expect(capturedPutBody).not.toHaveProperty('userPlantId');
      expect(updated.frequency).toBe('DAILY');
      expect(updated.taskLabel).toBeNull();
    });

    it('surfaces server 400/403/404 validation/permission errors without retrying 4xx', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      let callCount = 0;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        callCount += 1;
        return Promise.reject({
          isAxiosError: true,
          response: {
            status: 403,
            data: {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Bạn không có quyền thao tác trên lịch chăm sóc này',
              },
            },
          },
          config,
        });
      });

      await expect(deleteSchedule('sch-foreign')).rejects.toMatchObject({
        statusCode: 403,
        isForbiddenError: true,
      });
      expect(callCount).toBe(1);
    });
  });

  describe('2. Vietnam Timezone (Asia/Ho_Chi_Minh), Complete/Skip Payload & 409 Rules', () => {
    it('formats UTC instants across UTC midnight into exact Asia/Ho_Chi_Minh date/time labels', () => {
      // 2026-11-11T17:30:00Z is 2026-11-12 00:30 in Asia/Ho_Chi_Minh (+07:00)
      const midnightBoundary = '2026-11-11T17:30:00Z';
      expect(getVnDateKeyFromIso(midnightBoundary)).toBe('2026-11-12');

      const refSameDay = new Date('2026-11-12T03:00:00Z'); // 10:00 VN on 2026-11-12
      const sameDayFormatted = formatNextScheduledAtVn(midnightBoundary, refSameDay);
      expect(sameDayFormatted.isTodayVn).toBe(true);
      expect(sameDayFormatted.dateTimeLabel).toBe('Hôm nay, 00:30 (VN)');

      const refPrevDay = new Date('2026-11-11T10:00:00Z'); // 17:00 VN on 2026-11-11
      const nextDayFormatted = formatNextScheduledAtVn(midnightBoundary, refPrevDay);
      expect(nextDayFormatted.isTodayVn).toBe(false);
      expect(nextDayFormatted.dateTimeLabel).toBe('00:30 • 12/11/2026 (VN)');

      // 2026-11-11T01:00:00Z = 08:00 VN on 2026-11-11
      const morningVn = formatNextScheduledAtVn('2026-11-11T01:00:00Z', refPrevDay);
      expect(morningVn.time).toBe('08:00');
      expect(morningVn.dateKey).toBe('2026-11-11');
    });

    it('sends {} JSON body for complete/skip without fields and obeys isScheduleDueNow()', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      expect(isScheduleDueNow(todayOverdueItem)).toBe(true);
      expect(isScheduleDueNow(todayNotYetDueItem)).toBe(false);
      expect(isScheduleDueNow({ ...todayOverdueItem, status: 'PAUSED' })).toBe(false);

      const capturedBodies: unknown[] = [];
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        capturedBodies.push(JSON.parse(String(config.data)));
        if (config.url === '/schedules/sch-once/complete') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                careLogId: 'log-1',
                scheduleStatus: 'COMPLETED',
                nextScheduledAt: pastDueIso,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/schedules/sch-1/skip') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                careLogId: 'log-2',
                scheduleStatus: 'ACTIVE',
                nextScheduledAt: futureIso,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      const completeRes = await completeSchedule('sch-once');
      expect(completeRes.scheduleStatus).toBe('COMPLETED');
      expect(completeRes.careLogId).toBe('log-1');

      const skipRes = await skipSchedule('sch-1');
      expect(skipRes.scheduleStatus).toBe('ACTIVE');
      expect(skipRes.nextScheduledAt).toBe(futureIso);

      expect(capturedBodies).toEqual([{}, {}]);
    });

    it('handles HTTP 409 Conflict from complete/skip cleanly without fabricating success', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) =>
        Promise.reject({
          isAxiosError: true,
          response: {
            status: 409,
            data: {
              success: false,
              error: {
                code: 'CONFLICT',
                message: 'Lượt chăm sóc chưa đến hạn hoặc đã được hoàn thành',
              },
            },
          },
          config,
        })
      );

      await expect(completeSchedule('sch-future')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Lượt chăm sóc chưa đến hạn hoặc đã được hoàn thành',
      });
    });
  });

  describe('3. ScheduleScreen (/schedule MainScreens) Integration', () => {
    it('loads GET /schedules/today, replaces fake 0%/Tuần này mocks, filters Overdue vs Due Soon, and navigates cleanly', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      let mode: 'error' | 'empty' | 'list' = 'error';
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/schedules/today' && config.method === 'get') {
          if (mode === 'error') {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 500,
                data: { success: false, error: { code: 'SERVER_ERROR', message: 'Lỗi tải lịch hôm nay.' } },
              },
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: mode === 'empty' ? [] : [todayOverdueItem, todayNotYetDueItem],
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<ScheduleScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không thể tải lịch chăm sóc hôm nay');
        expect(container!.textContent).toContain('Lỗi tải lịch hôm nay.');
      });

      mode = 'empty';
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Thử lại')
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Không có lịch chăm sóc cần thực hiện hôm nay');
      });

      mode = 'list';
      clickElement(container!.querySelector('[aria-label="Làm mới lịch hôm nay"]'));

      await waitFor(() => {
        expect(container!.textContent).toContain('2 việc hôm nay • 1 việc quá hạn');
        expect(container!.textContent).toContain('Tưới 300ml nước quanh gốc');
        expect(container!.textContent).toContain('Phun sương tối');
      });

      expect(container!.textContent).not.toContain('Tuần này');
      expect(container!.textContent).not.toContain('Tiến độ hoàn thành');
      expect(container!.textContent).not.toContain('Cây chưa có lịch');

      // Non-due item disables Complete & Skip buttons cleanly
      const disabledFutureComplete = container!.querySelector(
        '[aria-label="Hoàn thành Phun sương cho Monstera Cửa Sổ"]'
      );
      expect(disabledFutureComplete?.getAttribute('aria-disabled')).toBe('true');

      // Filter by Quá hạn
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.startsWith('Quá hạn (1)')
        )
      );
      expect(container!.textContent).toContain('Tưới 300ml nước quanh gốc');
      expect(container!.textContent).not.toContain('Phun sương tối');

      // Navigation to plant-detail, schedule/detail & schedule/create
      clickElement(container!.querySelector('[aria-label="Xem cây Monstera Cửa Sổ"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/plant-detail',
        params: { plantId: 'plt-1' },
      });

      clickElement(container!.querySelector('[aria-label="Chi tiết lịch Monstera Cửa Sổ"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/schedule/detail',
        params: { plantId: 'plt-1', scheduleId: 'sch-1' },
      });

      clickElement(container!.querySelector('[aria-label="Tạo lịch chăm sóc mới"]'));
      expect(mockRouter.push).toHaveBeenCalledWith('/schedule/create');
    });

    it('completes ONCE schedule (marks COMPLETED & removes from Today), skips recurring schedule, and displays 409 error without faking Care Logs', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      let todayList: TodayScheduleItemDto[] = [todayOverdueItem, todayOnceDueItem];
      const deferredComplete = createDeferred<void>();
      let failSkip409 = true;

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/schedules/today' && config.method === 'get') {
          return { status: 200, data: { success: true, data: todayList }, headers: {}, config };
        }
        if (config.url === '/schedules/sch-once/complete' && config.method === 'post') {
          await deferredComplete.promise;
          todayList = todayList.filter((i) => i.scheduleId !== 'sch-once');
          return {
            status: 200,
            data: {
              success: true,
              data: {
                careLogId: 'log-once-1',
                scheduleStatus: 'COMPLETED',
                nextScheduledAt: pastDueIso,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules/sch-1/skip' && config.method === 'post') {
          if (failSkip409) {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 409,
                data: {
                  success: false,
                  error: {
                    code: 'CONFLICT',
                    message: 'Lượt chăm sóc chưa đến hạn hoặc đã được hoàn thành',
                  },
                },
              },
              config,
            });
          }
          todayList = [];
          return {
            status: 200,
            data: {
              success: true,
              data: {
                careLogId: 'log-skip-1',
                scheduleStatus: 'ACTIVE',
                nextScheduledAt: futureIso,
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<ScheduleScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Sen Đá Bàn Làm Việc');
        expect(container!.textContent).toContain('Tưới 300ml nước quanh gốc');
      });

      // Trigger Complete on ONCE schedule -> locks pending controls while awaiting response
      clickElement(
        container!.querySelector('[aria-label="Hoàn thành Bón phân cho Sen Đá Bàn Làm Việc"]')
      );
      await waitFor(() => {
        expect(container!.textContent).toContain('Đang lưu...');
      });

      await act(async () => {
        deferredComplete.resolve();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('kết thúc chu kỳ lịch');
        expect(
          container!.querySelector('[aria-label="Hoàn thành Bón phân cho Sen Đá Bàn Làm Việc"]')
        ).toBeNull();
        expect(container!.textContent).toContain('1 việc hôm nay • 1 việc quá hạn');
      });

      // Skip with backend 409 -> renders error alert cleanly and preserves item
      clickElement(
        container!.querySelector('[aria-label="Bỏ qua Tưới nước cho Monstera Cửa Sổ"]')
      );
      await waitFor(() => {
        expect(container!.textContent).toContain('Lượt chăm sóc chưa đến hạn hoặc đã được hoàn thành');
        expect(container!.textContent).toContain('Tưới 300ml nước quanh gốc');
      });

      // Retry Skip with success -> advances to future date and drops off today
      failSkip409 = false;
      clickElement(
        container!.querySelector('[aria-label="Bỏ qua Tưới nước cho Monstera Cửa Sổ"]')
      );
      await waitFor(() => {
        expect(container!.textContent).toContain('Đã bỏ qua lượt "Tưới nước"');
        expect(container!.textContent).not.toContain('Tưới 300ml nước quanh gốc');
      });
    });
  });

  describe('4. PlantDetailScreen Schedules, Pagination Guard & Cascade Cache Cleanup', () => {
    it('loads plant schedules, filters by ScheduleStatus, navigates to create/detail, and retries on failure', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      let failFirst = true;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules') {
          if (failFirst) {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 500,
                data: { success: false, error: { code: 'ERR', message: 'Lỗi tải lịch cây.' } },
              },
              config,
            });
          }
          const reqStatus = (config.params as { status?: string } | undefined)?.status;
          const list =
            reqStatus === 'PAUSED'
              ? [scheduleDetailPaused]
              : [scheduleDetailOne, scheduleDetailPaused];
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: list,
                page: 0,
                size: 10,
                totalElements: list.length,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (
          (config.url === '/plants/plt-1/care-logs' || config.url === '/plants/plt-1/journals') &&
          config.method === 'get'
        ) {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Lịch chăm sóc của cây');
        expect(container!.textContent).toContain('Lỗi tải lịch cây.');
      });

      failFirst = false;
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Thử lại')
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('2 lịch');
        expect(container!.textContent).toContain('Mỗi 3 ngày');
        expect(container!.textContent).toContain('Tạm ngưng');
        expect(container!.textContent).toContain('Quá hạn');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Tạm ngưng')
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('1 lịch');
        expect(container!.textContent).toContain('Cắt tỉa');
        expect(container!.textContent).not.toContain('Tưới 300ml nước quanh gốc');
      });

      clickElement(container!.querySelector('[aria-label="Tạo lịch cho cây này"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/schedule/create',
        params: { plantId: 'plt-1' },
      });

      clickElement(container!.querySelector('[aria-label="Chi tiết lịch Cắt tỉa"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/schedule/detail',
        params: { plantId: 'plt-1', scheduleId: 'sch-2' },
      });
    });

    it('clamps PlantDetailScreen schedulePage back to 0 when last item on page 1 is removed without false empty state', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      let deletedLastOnPage1 = false;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules') {
          const reqPage = (config.params as { page?: number } | undefined)?.page ?? 0;
          if (!deletedLastOnPage1) {
            return Promise.resolve({
              status: 200,
              data: {
                success: true,
                data: {
                  content:
                    reqPage === 0
                      ? [scheduleDetailOne]
                      : [{ ...scheduleDetailOne, id: 'sch-11', taskLabel: 'Lịch trang 2 cuối cùng' }],
                  page: reqPage,
                  size: 10,
                  totalElements: 11,
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
                content: reqPage === 0 ? [scheduleDetailOne] : [],
                page: reqPage,
                size: 10,
                totalElements: 10,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (
          (config.url === '/plants/plt-1/care-logs' || config.url === '/plants/plt-1/journals') &&
          config.method === 'get'
        ) {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/schedules/sch-11' && config.method === 'delete') {
          deletedLastOnPage1 = true;
          return Promise.resolve({ status: 200, data: { success: true, data: { message: 'Deleted' } }, headers: {}, config });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      let deleteSchMut!: ReturnType<typeof useDeleteScheduleMutation>;
      function Probe() {
        deleteSchMut = useDeleteScheduleMutation();
        return null;
      }

      mountWithProviders(
        <>
          <Probe />
          <PlantDetailScreen />
        </>
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Trang 1 / 2');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Trang sau')
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Lịch trang 2 cuối cùng');
        expect(container!.textContent).toContain('Trang 2 / 2');
      });

      await act(async () => {
        await deleteSchMut.mutateAsync({ scheduleId: 'sch-11', plantId: 'plt-1' });
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Tưới 300ml nước quanh gốc');
        expect(container!.textContent).not.toContain('Chưa có lịch chăm sóc');
        expect(container!.textContent).not.toContain('Trang 2 / 1');
      });
    });

    it('synchronizes schedules caches when Plant is updated/deleted or Garden is deleted (cascade cleanup)', async () => {
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
          return Promise.resolve({ status: 200, data: { success: true, data: { message: 'Plant deleted' } }, headers: {}, config });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'delete') {
          return Promise.resolve({ status: 200, data: { success: true, data: { message: 'Garden deleted' } }, headers: {}, config });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      qc.setQueryData(queryKeys.schedules.today(mockUserA.id), [todayOverdueItem, todayOnceDueItem]);
      qc.setQueryData(queryKeys.plants.schedules(mockUserA.id, 'plt-1', { page: 0, size: 10 }), {
        content: [scheduleDetailOne],
        page: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });
      qc.setQueryData(queryKeys.gardens.detail(mockUserA.id, 'grd-2'), {
        id: 'grd-2',
        name: 'Vườn Xóa',
        location: 'Sân thượng',
        spaceType: 'SAN_THUONG',
        description: null,
        coverImageUrl: null,
        plants: [{ ...plantSummaryTwo }],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      qc.setQueryData(queryKeys.plants.schedules(mockUserA.id, 'plt-2', { page: 0, size: 10 }), {
        content: [{ ...scheduleDetailOne, id: 'sch-once', userPlantId: 'plt-2' }],
        page: 0,
        size: 10,
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
      await waitFor(() => {
        expect(qc.getQueryData(queryKeys.schedules.today(mockUserA.id))).toBeDefined();
      });

      await act(async () => {
        await updatePlantMut.mutateAsync({
          plantId: 'plt-1',
          data: { displayName: 'Monstera Đổi Tên' },
        });
      });
      expect(
        qc.getQueryState(queryKeys.plants.schedules(mockUserA.id, 'plt-1', { page: 0, size: 10 }))?.isInvalidated
      ).toBe(true);
      expect(qc.getQueryState(queryKeys.schedules.today(mockUserA.id))?.isInvalidated).toBe(true);

      await act(async () => {
        await deletePlantMut.mutateAsync('plt-1');
      });
      expect(
        qc.getQueryData(queryKeys.plants.schedules(mockUserA.id, 'plt-1', { page: 0, size: 10 }))
      ).toBeUndefined();
      expect(
        qc
          .getQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(mockUserA.id))
          ?.map((i) => i.plantId)
      ).toEqual(['plt-2']);

      // Re-attach garden grd-1 -> grd-2 delete test (use grd-1 in API adapter)
      qc.setQueryData(queryKeys.gardens.detail(mockUserA.id, 'grd-1'), {
        id: 'grd-1',
        name: 'Ban công hướng Đông',
        location: 'Tầng 4',
        spaceType: 'BAN_CONG',
        description: null,
        coverImageUrl: null,
        plants: [{ ...plantSummaryTwo }],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      await act(async () => {
        await deleteGardenMut.mutateAsync('grd-1');
      });
      expect(
        qc.getQueryData(queryKeys.plants.schedules(mockUserA.id, 'plt-2', { page: 0, size: 10 }))
      ).toBeUndefined();
    });

    it('deletes a plant from PlantDetailScreen cleanly, removes its schedules and today entries, and never triggers spurious post-delete GET /plants/{id}/schedules 404', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      qc.setQueryData(queryKeys.schedules.today(mockUserA.id), [todayOverdueItem, todayOnceDueItem]);

      let deleteStarted = false;
      let spuriousScheduleFetch = false;
      const deferredDelete = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          if (deleteStarted) {
            spuriousScheduleFetch = true;
            throw new Error('Spurious plant GET after delete');
          }
          return { status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config };
        }
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          if (deleteStarted) {
            spuriousScheduleFetch = true;
            throw new Error('Spurious schedules GET after plant delete');
          }
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [scheduleDetailOne],
                page: 0,
                size: 10,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (
          (config.url === '/plants/plt-1/care-logs' || config.url === '/plants/plt-1/journals') &&
          config.method === 'get'
        ) {
          if (deleteStarted) {
            spuriousScheduleFetch = true;
            throw new Error(`Spurious GET ${config.url} after plant delete`);
          }
          return {
            status: 200,
            data: {
              success: true,
              data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-1' && config.method === 'delete') {
          deleteStarted = true;
          await deferredDelete.promise;
          return { status: 200, data: { success: true, data: { message: 'Plant deleted' } }, headers: {}, config };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let confirmButtons: { text?: string; style?: string; onPress?: () => void }[] = [];
      let alertMessage = '';
      vi.spyOn(Alert, 'alert').mockImplementation((_t, msg, buttons) => {
        alertMessage = msg ?? '';
        confirmButtons = (buttons as typeof confirmButtons) ?? [];
      });

      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Tưới 300ml nước quanh gốc');
        expect(container!.textContent).toContain('Xóa cây');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Xóa cây')
      );
      expect(alertMessage).toContain('Care Schedules');
      expect(alertMessage).toContain('Care Logs');
      expect(alertMessage).toContain('Growth Journals');

      act(() => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Đang xóa cây...');
      });

      await act(async () => {
        deferredDelete.resolve();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/plants');
      });
      expect(spuriousScheduleFetch).toBe(false);
      expect(
        qc.getQueryData(queryKeys.plants.schedules(mockUserA.id, 'plt-1', { page: 0, size: 10 }))
      ).toBeUndefined();
      expect(
        qc.getQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(mockUserA.id))?.map((i) => i.plantId)
      ).toEqual(['plt-2']);
    });
  });

  describe('5. CreateScheduleScreen (/schedule/create) Integration', () => {
    it('preselects plantId, toggles CUSTOM intervalDays, validates locally, prevents double submit, and navigates on POST /schedules', async () => {
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
              data: {
                content: [plantSummaryOne, plantSummaryTwo],
                page: 0,
                size: 100,
                totalElements: 2,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          return { status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config };
        }
        if (config.url === '/schedules' && config.method === 'post') {
          postCalls += 1;
          postedBody = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          await deferredPost.promise;
          return {
            status: 201,
            data: { success: true, data: { ...scheduleDetailOne, id: 'sch-created-1' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<CreateScheduleScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
        expect(
          container!.querySelector('[aria-label="Chọn cây Monstera Cửa Sổ"]')?.textContent
        ).toContain('●');
        expect(
          container!.querySelector('[aria-label="Chọn cây Sen Đá Bàn Làm Việc"]')?.textContent
        ).toContain('○');
      });

      // CUSTOM intervalDays input is hidden until Tùy chỉnh is tapped
      expect(container!.querySelector('[aria-label="Khoảng cách ngày"]')).toBeNull();

      clickElement(container!.querySelector('[aria-label="Chọn công việc Kiểm tra sâu bệnh"]'));
      clickElement(container!.querySelector('[aria-label="Chọn chu kỳ Tùy chỉnh"]'));

      expect(container!.querySelector('[aria-label="Khoảng cách ngày"]')).toBeTruthy();

      // Local validation: past start date + intervalDays 0
      changeInputValue(container!.querySelector('[aria-label="Khoảng cách ngày"]'), '0');
      changeInputValue(container!.querySelector('[aria-label="Ngày bắt đầu"]'), '2020-01-01');

      const submitBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Tạo lịch chăm sóc')
      );
      clickElement(submitBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('số nguyên lớn hơn 0');
        expect(container!.textContent).toContain('không được trong quá khứ');
      });
      expect(postCalls).toBe(0);

      // Fix inputs & submit (double tap prevented)
      const todayVn = getTodayVnDateString();
      changeInputValue(container!.querySelector('[aria-label="Khoảng cách ngày"]'), '4');
      changeInputValue(container!.querySelector('[aria-label="Ngày bắt đầu"]'), todayVn);
      changeInputValue(container!.querySelector('[aria-label="Giờ nhắc"]'), '09:15');
      changeInputValue(container!.querySelector('[aria-label="Nhãn mô tả công việc"]'), 'Soi rệp dưới lá');

      clickElement(submitBtn);
      await waitFor(() => {
        expect(container!.textContent).toContain('Đang tạo lịch...');
        expect(submitBtn?.getAttribute('aria-disabled')).toBe('true');
      });
      clickElement(submitBtn);
      expect(postCalls).toBe(1);

      await act(async () => {
        deferredPost.resolve();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(postedBody).toEqual({
          userPlantId: 'plt-1',
          taskType: 'PEST_CHECK',
          taskLabel: 'Soi rệp dưới lá',
          frequency: 'CUSTOM',
          intervalDays: 4,
          reminderTime: '09:15:00',
          startDate: todayVn,
        });
        expect(mockRouter.replace).toHaveBeenCalledWith({
          pathname: '/schedule/detail',
          params: { plantId: 'plt-1', scheduleId: 'sch-created-1' },
        });
      });
    });

    it('renders empty plants CTA redirecting to /garden/add-plant when user owns no plants', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [], page: 0, size: 100, totalElements: 0, totalPages: 0, last: true },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<CreateScheduleScreen />);

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

    it('maps backend 400 validation errors to CreateScheduleScreen fieldErrors & alert banner without wiping inputs', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [plantSummaryOne],
                page: 0,
                size: 100,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/schedules' && config.method === 'post') {
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 400,
              data: {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  field: 'taskLabel',
                  message: 'Nhãn công việc vi phạm quy tắc phía máy chủ.',
                },
              },
            },
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<CreateScheduleScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });

      const labelInput = container!.querySelector('[aria-label="Nhãn mô tả công việc"]') as HTMLInputElement;
      const reminderInput = container!.querySelector('[aria-label="Giờ nhắc"]') as HTMLInputElement;
      changeInputValue(labelInput, 'Nhãn giữ nguyên');
      changeInputValue(reminderInput, '09:45');

      const submitBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Tạo lịch chăm sóc')
      );
      clickElement(submitBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Nhãn công việc vi phạm quy tắc phía máy chủ.');
      });
      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(labelInput.value).toBe('Nhãn giữ nguyên');
      expect(reminderInput.value).toBe('09:45');
    });
  });

  describe('6. ScheduleDetailScreen (/schedule/detail) Integration', () => {
    it('resolves schedule via GET /plants/{plantId}/schedules without calling GET /schedules/{id}, edits with tri-state nulls & CUSTOM->DAILY switch', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1', scheduleId: 'sch-1' };

      const calledUrls: string[] = [];
      let currentSchedule: CareScheduleDto = { ...scheduleDetailOne };
      let putPayload: Record<string, unknown> | undefined;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        calledUrls.push(`${String(config.method).toUpperCase()} ${config.url}`);
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [currentSchedule],
                page: 0,
                size: 100,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/schedules/sch-1' && config.method === 'put') {
          putPayload = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          currentSchedule = {
            ...currentSchedule,
            taskType: 'FERTILIZING',
            taskLabel: null,
            frequency: 'DAILY',
            intervalDays: null,
            reminderTime: '08:00:00',
            endDate: null,
          };
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: currentSchedule,
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<ScheduleDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
        expect(container!.textContent).toContain('Mỗi 3 ngày');
      });

      expect(calledUrls).not.toContain('GET /schedules/sch-1');
      expect(calledUrls).not.toContain('GET /schedules');

      // Clear optional fields using built-in actions and switch CUSTOM -> DAILY
      clickElement(container!.querySelector('[aria-label="Sửa công việc Bón phân"]'));
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Xóa nhãn')
      );
      clickElement(container!.querySelector('[aria-label="Sửa chu kỳ Mỗi ngày"]'));
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find(
          (el) => el.textContent === 'Đặt mặc định 08:00:00'
        )
      );
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find(
          (el) => el.textContent === 'Xóa ngày kết thúc'
        )
      );

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find(
          (el) => el.textContent === 'Lưu cập nhật lịch'
        )
      );

      await waitFor(() => {
        expect(putPayload).toEqual({
          taskType: 'FERTILIZING',
          taskLabel: null,
          frequency: 'DAILY',
          intervalDays: null,
          reminderTime: null,
          startDate: '2026-11-11',
          endDate: null,
        });
        expect(putPayload).not.toHaveProperty('userPlantId');
        expect(container!.textContent).toContain('Đã cập nhật thông tin lịch chăm sóc.');
        expect(container!.textContent).toContain('(Không giới hạn)');
      });
    });

    it('supports Pause -> Resume -> Cancel (CANCELLED), Complete/Skip & Physical Delete with Care Logs preservation alert and zero post-delete refetch', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1', scheduleId: 'sch-1' };

      let currentSchedule: CareScheduleDto = { ...scheduleDetailOne };
      let listCalls = 0;
      let deleteCalls = 0;
      let spuriousRefetchAfterDelete = false;
      const deferredDelete = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          listCalls += 1;
          if (deleteCalls > 0) {
            spuriousRefetchAfterDelete = true;
            throw new Error('Spurious plant schedules refetch after delete!');
          }
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [currentSchedule],
                page: 0,
                size: 100,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules/sch-1' && config.method === 'put') {
          const body = JSON.parse(String(config.data ?? '{}')) as { status?: CareScheduleDto['status'] };
          currentSchedule = { ...currentSchedule, status: body.status ?? currentSchedule.status };
          return {
            status: 200,
            data: { success: true, data: currentSchedule },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules/sch-1' && config.method === 'delete') {
          deleteCalls += 1;
          await deferredDelete.promise;
          return {
            status: 200,
            data: { success: true, data: { message: 'Deleted schedule' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      let confirmButtons: { text?: string; style?: string; onPress?: () => void }[] = [];
      let alertMessage = '';
      vi.spyOn(Alert, 'alert').mockImplementation((_t, msg, buttons) => {
        alertMessage = msg ?? '';
        confirmButtons = (buttons as typeof confirmButtons) ?? [];
      });

      mountWithProviders(<ScheduleDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Tạm ngưng');
      });

      // Pause
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Tạm ngưng')
      );
      await waitFor(() => {
        expect(container!.textContent).toContain('Tiếp tục lịch');
        expect(container!.textContent).toContain('Đã tạm ngưng lịch chăm sóc.');
      });
      expect(
        container!.querySelector('[aria-label="Hoàn thành lượt chăm sóc"]')?.getAttribute('aria-disabled')
      ).toBe('true');

      // Resume
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Tiếp tục lịch')
      );
      await waitFor(() => {
        expect(container!.textContent).toContain('Tạm ngưng');
      });

      // Cancel (soft CANCELLED status via PUT)
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find(
          (el) => el.textContent === 'Hủy lịch (CANCELLED)'
        )
      );
      expect(alertMessage).toContain('CANCELLED');
      expect(deleteCalls).toBe(0);
      await act(async () => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
        await flushAsync(30);
      });
      await waitFor(() => {
        expect(container!.textContent).toContain('Đã hủy');
      });
      expect(deleteCalls).toBe(0);

      // Wait for Cancel invalidation refetch to settle before snapshotting listCallsBeforeDelete
      await flushAsync(40);
      const listCallsBeforeDelete = listCalls;
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find(
          (el) => el.textContent === 'Xóa vĩnh viễn lịch'
        )
      );
      expect(alertMessage).toContain('Care Logs');
      expect(alertMessage).toContain('schedule_id = NULL');
      expect(deleteCalls).toBe(0);

      // First flush the click state update (isDeleted = true) so React disables the query observer
      act(() => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Đang xóa lịch...');
        expect(deleteCalls).toBe(1);
      });

      await act(async () => {
        deferredDelete.resolve();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith({
          pathname: '/plant-detail',
          params: { plantId: 'plt-1' },
        });
      });
      expect(spuriousRefetchAfterDelete).toBe(false);
      expect(listCalls).toBe(listCallsBeforeDelete);
    });

    it('resolves ScheduleDetailScreen via Today cache fallback & multi-page scan without GET /schedules/{id}, executes Complete/Skip & handles 409', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      // Omit plantId intentionally -> must resolve from cached schedules.today
      routeParamsState.current = { scheduleId: 'sch-page2' };

      const targetOnPage1: CareScheduleDto = {
        ...scheduleDetailOne,
        id: 'sch-page2',
        userPlantId: 'plt-1',
        taskType: 'MISTING',
        taskLabel: 'Phun sương trang 2',
        frequency: 'WEEKLY',
        intervalDays: null,
        nextScheduledAt: pastDueIso,
        isOverdue: true,
        status: 'ACTIVE',
      };

      qc.setQueryData(queryKeys.schedules.today(mockUserA.id), [
        {
          scheduleId: 'sch-page2',
          plantId: 'plt-1',
          plantName: 'Monstera Cửa Sổ',
          gardenName: 'Ban công hướng Đông',
          taskType: 'MISTING',
          taskLabel: 'Phun sương trang 2',
          nextScheduledAt: pastDueIso,
          isOverdue: true,
          status: 'ACTIVE',
        },
      ]);

      const calledUrls: string[] = [];
      let failComplete409 = true;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        calledUrls.push(`${String(config.method).toUpperCase()} ${config.url}`);
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          const reqPage = (config.params as { page?: number } | undefined)?.page ?? 0;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: reqPage === 0 ? [scheduleDetailOne] : [targetOnPage1],
                page: reqPage,
                size: 100,
                totalElements: 2,
                totalPages: 2,
                last: reqPage === 1,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/schedules/sch-page2/complete' && config.method === 'post') {
          if (failComplete409) {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 409,
                data: { success: false, error: { code: 'CONFLICT', message: 'Lượt này vừa được hoàn thành trước đó.' } },
              },
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { careLogId: 'log-detail-1', scheduleStatus: 'ACTIVE', nextScheduledAt: futureIso },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<ScheduleDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Phun sương trang 2');
      });
      expect(calledUrls).not.toContain('GET /schedules/sch-page2');
      expect(calledUrls).not.toContain('GET /schedules');

      clickElement(container!.querySelector('[aria-label="Hoàn thành lượt chăm sóc"]'));
      await waitFor(() => {
        expect(container!.textContent).toContain('Lượt này vừa được hoàn thành trước đó.');
      });

      failComplete409 = false;
      clickElement(container!.querySelector('[aria-label="Hoàn thành lượt chăm sóc"]'));
      await waitFor(() => {
        expect(container!.textContent).toContain('Đã đánh dấu hoàn thành lượt chăm sóc');
      });
    });

    it('renders safe fallback error states when scheduleId missing, plantId unresolvable, or server returns 403', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-foreign', scheduleId: 'sch-403' };

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-foreign/schedules') {
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 403,
              data: { success: false, error: { code: 'FORBIDDEN', message: 'Không có quyền xem lịch cây này.' } },
            },
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<ScheduleDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không có quyền truy cập lịch chăm sóc');
        expect(container!.textContent).toContain('Không có quyền xem lịch cây này.');
      });
    });
  });

  describe('7. HomeScreen Schedule CTA Navigation', () => {
    it('navigates cleanly to /schedule and /schedule/create without fake notification claims', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/gardens') {
          return Promise.resolve({ status: 200, data: { success: true, data: [gardenSummaryOne] }, headers: {}, config });
        }
        if (config.url === '/plants') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne], page: 0, size: 10, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<HomeScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Lịch chăm sóc cây trồng');
      });
      expect(container!.textContent).not.toContain('Tự động hóa chu kỳ');

      clickElement(container!.querySelector('[aria-label="Mở lịch chăm sóc hôm nay"]'));
      expect(mockRouter.push).toHaveBeenCalledWith('/schedule');

      clickElement(container!.querySelector('[aria-label="Tạo lịch chăm sóc mới"]'));
      expect(mockRouter.push).toHaveBeenCalledWith('/schedule/create');
    });
  });

  describe('8. Security & Account-Switch Cache/Mutation Isolation (A -> B Pending)', () => {
    it('isolates query keys by userId and rejects/prevents User A pending GET queries & placeholderData from leaking across accounts or plantIds', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingTodayA = createDeferred<void>();
      const pendingPlantSchA = createDeferred<void>();
      const pendingPlant2B = createDeferred<void>();
      const todayKeyA = queryKeys.schedules.today(mockUserA.id);
      const todayKeyB = queryKeys.schedules.today(mockUserB.id);
      expect(todayKeyA).not.toEqual(todayKeyB);

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
        if (config.url === '/schedules/today') {
          if (!isB) {
            await pendingTodayA.promise;
            return {
              status: 200,
              data: { success: true, data: [{ ...todayOverdueItem, taskLabel: 'Bí Mật Lịch Của A' }] },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: { success: true, data: [{ ...todayOverdueItem, scheduleId: 'sch-b', taskLabel: 'Lịch Của B' }] },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-shared-1/schedules') {
          if (!isB) {
            await pendingPlantSchA.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  content: [{ ...scheduleDetailOne, id: 'sch-shared', userPlantId: 'plt-shared-1', taskLabel: 'Chi tiết A' }],
                  page: 0,
                  size: 10,
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
                content: [{ ...scheduleDetailOne, id: 'sch-shared', userPlantId: 'plt-shared-1', taskLabel: 'Chi tiết B' }],
                page: 0,
                size: 10,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-other-b/schedules') {
          await pendingPlant2B.promise;
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...scheduleDetailOne, id: 'sch-b-2', userPlantId: 'plt-other-b', taskLabel: 'Cây khác của B' }],
                page: 0,
                size: 10,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let setTargetPlantId!: React.Dispatch<React.SetStateAction<string>>;
      function Probe() {
        authCtx = useAuth();
        const [targetPlantId, updatePlantId] = React.useState('plt-shared-1');
        setTargetPlantId = updatePlantId;
        useTodaySchedules();
        const plantSch = usePlantSchedules(targetPlantId, { page: 0, size: 10 });
        return React.createElement(
          'div',
          null,
          plantSch.data?.content.map((s) => s.taskLabel).join(',') ?? 'empty'
        );
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <Probe />
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
      });

      // Switch to B while A's queries are STILL pending
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'Secret123!' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Chi tiết B');
      });

      // Switch plantId on User B -> must NOT flash plt-shared-1 placeholder data while plt-other-b is pending
      act(() => {
        setTargetPlantId('plt-other-b');
      });
      await flushAsync(20);
      expect(container!.textContent).toBe('empty');
      expect(container!.textContent).not.toContain('Chi tiết B');

      await act(async () => {
        pendingPlant2B.resolve();
        pendingTodayA.resolve();
        pendingPlantSchA.resolve();
        await flushAsync(40);
      });

      expect(container!.textContent).toContain('Cây khác của B');
      expect(container!.textContent).not.toContain('Chi tiết A');
      const todayB = qc.getQueryData<TodayScheduleItemDto[]>(todayKeyB);
      expect(todayB?.map((i) => i.taskLabel)).toEqual(['Lịch Của B']);
    });

    it('prevents User A pending create/update/complete/skip/delete mutations from mutating User B same-ID schedules or navigating on User B UI', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingCreateA = createDeferred<void>();
      const pendingUpdateA = createDeferred<void>();
      const pendingCompleteA = createDeferred<void>();
      const pendingSkipA = createDeferred<void>();
      const pendingDeleteA = createDeferred<void>();

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
        if (config.url === '/plants') {
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
        if (config.url === '/plants/plt-1') {
          return { status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config };
        }
        if (config.url === '/schedules/today') {
          return {
            status: 200,
            data: {
              success: true,
              data: [{ ...todayOverdueItem, scheduleId: 'sch-shared', taskLabel: isB ? 'Today Của B' : 'Today Của A' }],
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-1/schedules') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...scheduleDetailOne, id: 'sch-shared', taskLabel: isB ? 'Schedule Của B' : 'Schedule Của A' }],
                page: 0,
                size: 10,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules' && config.method === 'post') {
          await pendingCreateA.promise;
          return { status: 201, data: { success: true, data: { ...scheduleDetailOne, id: 'sch-a-new' } }, headers: {}, config };
        }
        if (config.url === '/schedules/sch-shared' && config.method === 'put') {
          await pendingUpdateA.promise;
          return { status: 200, data: { success: true, data: { ...scheduleDetailOne, id: 'sch-shared', taskLabel: 'Ghi đè bởi A' } }, headers: {}, config };
        }
        if (config.url === '/schedules/sch-shared/complete' && config.method === 'post') {
          await pendingCompleteA.promise;
          return { status: 200, data: { success: true, data: { careLogId: 'l1', scheduleStatus: 'COMPLETED', nextScheduledAt: pastDueIso } }, headers: {}, config };
        }
        if (config.url === '/schedules/sch-shared/skip' && config.method === 'post') {
          await pendingSkipA.promise;
          return { status: 200, data: { success: true, data: { careLogId: 'l2', scheduleStatus: 'COMPLETED', nextScheduledAt: pastDueIso } }, headers: {}, config };
        }
        if (config.url === '/schedules/sch-shared' && config.method === 'delete') {
          await pendingDeleteA.promise;
          return { status: 200, data: { success: true, data: { message: 'Deleted by A' } }, headers: {}, config };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let createMut!: ReturnType<typeof useCreateScheduleMutation>;
      let updateMut!: ReturnType<typeof useUpdateScheduleMutation>;
      let completeMut!: ReturnType<typeof useCompleteScheduleMutation>;
      let skipMut!: ReturnType<typeof useSkipScheduleMutation>;
      let deleteMut!: ReturnType<typeof useDeleteScheduleMutation>;

      function Probe() {
        authCtx = useAuth();
        useTodaySchedules();
        usePlantSchedules('plt-1', { page: 0, size: 10 });
        createMut = useCreateScheduleMutation();
        updateMut = useUpdateScheduleMutation();
        completeMut = useCompleteScheduleMutation();
        skipMut = useSkipScheduleMutation();
        deleteMut = useDeleteScheduleMutation();
        return null;
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <Probe />
              <CreateScheduleScreen />
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });

      const todayVn = getTodayVnDateString();
      let pCreate!: Promise<unknown>;
      let pUpdate!: Promise<unknown>;
      let pComplete!: Promise<unknown>;
      let pSkip!: Promise<unknown>;
      let pDelete!: Promise<unknown>;

      act(() => {
        pCreate = createMut
          .mutateAsync({ userPlantId: 'plt-1', taskType: 'WATERING', frequency: 'DAILY', startDate: todayVn })
          .catch((e) => e);
        pUpdate = updateMut
          .mutateAsync({ scheduleId: 'sch-shared', plantId: 'plt-1', data: { taskLabel: 'Ghi đè bởi A' } })
          .catch((e) => e);
        pComplete = completeMut.mutateAsync({ scheduleId: 'sch-shared', plantId: 'plt-1' }).catch((e) => e);
        pSkip = skipMut.mutateAsync({ scheduleId: 'sch-shared', plantId: 'plt-1' }).catch((e) => e);
        pDelete = deleteMut.mutateAsync({ scheduleId: 'sch-shared', plantId: 'plt-1' }).catch((e) => e);
      });

      // Also click CreateScheduleScreen submit button while on A to verify UI callback guard
      const createSubmitBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Tạo lịch chăm sóc')
      );
      clickElement(createSubmitBtn);

      // Switch to User B BEFORE A's requests settle
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'Secret123!' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(
          qc.getQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(mockUserB.id))?.[0]?.taskLabel
        ).toBe('Today Của B');
      });

      await act(async () => {
        pendingCreateA.resolve();
        pendingUpdateA.resolve();
        pendingCompleteA.resolve();
        pendingSkipA.resolve();
        pendingDeleteA.resolve();
        await Promise.all([pCreate, pUpdate, pComplete, pSkip, pDelete]);
        await flushAsync(40);
      });

      const bToday = qc.getQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(mockUserB.id));
      expect(bToday).toHaveLength(1);
      expect(bToday?.[0]?.taskLabel).toBe('Today Của B');
      expect(bToday?.[0]?.status).toBe('ACTIVE');

      const bPlantSchedules = qc.getQueryData<PageResponse<CareScheduleDto>>(
        queryKeys.plants.schedules(mockUserB.id, 'plt-1', { page: 0, size: 10 })
      );
      expect(bPlantSchedules?.content.map((s) => s.taskLabel)).toEqual(['Schedule Của B']);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('prevents pending CreateScheduleScreen error/navigation callbacks after Account A -> Account B switch', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingFailedPostA = createDeferred<void>();

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
        if (config.url === '/plants') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...plantSummaryOne, displayName: isB ? 'Cây Của B' : 'Cây Của A' }],
                page: 0,
                size: 100,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules' && config.method === 'post') {
          await pendingFailedPostA.promise;
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 400,
              data: { success: false, error: { code: 'BAD_REQUEST', message: 'Lỗi tạo lịch riêng của User A' } },
            },
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      function Probe() {
        authCtx = useAuth();
        return null;
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <Probe />
              <CreateScheduleScreen />
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Của A');
      });

      clickElement(container!.querySelector('[aria-label="Chọn cây Cây Của A"]'));
      const submitBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Tạo lịch chăm sóc')
      );
      clickElement(submitBtn);

      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'Secret123!' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Cây Của B');
      });

      await act(async () => {
        pendingFailedPostA.resolve();
        await flushAsync(40);
      });

      expect(container!.textContent).not.toContain('Lỗi tạo lịch riêng của User A');
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('prevents pending ScheduleDetailScreen PUT update snapshot/status banner from bleeding into User B after Account A -> Account B switch', async () => {
      await tokenStorage.saveSession(sessionA);
      routeParamsState.current = { plantId: 'plt-1', scheduleId: 'sch-shared' };
      const pendingPutA = createDeferred<void>();

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
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [
                  {
                    ...scheduleDetailOne,
                    id: 'sch-shared',
                    taskLabel: isB ? 'Lịch Riêng Của B' : 'Lịch Riêng Của A',
                  },
                ],
                page: 0,
                size: 100,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules/sch-shared' && config.method === 'put') {
          await pendingPutA.promise;
          return {
            status: 200,
            data: {
              success: true,
              data: { ...scheduleDetailOne, id: 'sch-shared', taskLabel: 'Ghi đè UI bởi User A' },
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
        return null;
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <Probe />
              <ScheduleDetailScreen />
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Lịch Riêng Của A');
      });

      changeInputValue(
        container!.querySelector('[aria-label="Sửa nhãn mô tả công việc"]'),
        'Ghi đè UI bởi User A'
      );
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find(
          (el) => el.textContent === 'Lưu cập nhật lịch'
        )
      );

      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'Secret123!' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Lịch Riêng Của B');
      });

      await act(async () => {
        pendingPutA.resolve();
        await flushAsync(40);
      });

      expect(container!.textContent).toContain('Lịch Riêng Của B');
      expect(container!.textContent).not.toContain('Ghi đè UI bởi User A');
      expect(container!.textContent).not.toContain('Đã cập nhật thông tin lịch chăm sóc.');
    });

    it('resets ScheduleDetailScreen deleted snapshot and blocks User A pending DELETE navigation callback on Account A -> Account B switch', async () => {
      await tokenStorage.saveSession(sessionA);
      routeParamsState.current = { plantId: 'plt-1', scheduleId: 'sch-shared' };
      const pendingDeleteA = createDeferred<void>();

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
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [
                  {
                    ...scheduleDetailOne,
                    id: 'sch-shared',
                    taskLabel: isB ? 'Lịch An Toàn Của B' : 'Lịch Sắp Xóa Của A',
                  },
                ],
                page: 0,
                size: 100,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules/sch-shared' && config.method === 'delete') {
          await pendingDeleteA.promise;
          return {
            status: 200,
            data: { success: true, data: { message: 'Deleted A schedule' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let confirmButtons: { text?: string; style?: string; onPress?: () => void }[] = [];
      vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
        confirmButtons = (buttons as typeof confirmButtons) ?? [];
      });

      let authCtx!: ReturnType<typeof useAuth>;
      function Probe() {
        authCtx = useAuth();
        return null;
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <Probe />
              <ScheduleDetailScreen />
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Lịch Sắp Xóa Của A');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find(
          (el) => el.textContent === 'Xóa vĩnh viễn lịch'
        )
      );
      act(() => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Đang xóa lịch...');
      });

      // Switch to B while User A's DELETE is still in flight
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'Secret123!' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Lịch An Toàn Của B');
      });

      await act(async () => {
        pendingDeleteA.resolve();
        await flushAsync(40);
      });

      expect(container!.textContent).toContain('Lịch An Toàn Của B');
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  describe('10. G5.4.2.1 Live Schedule Clock, Due/Overdue Reactivity, AppState & VN Midnight Rollover', () => {
    async function flushFakeTimersAndMicrotasks(ms = 20) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    async function waitForFake(assertion: () => void, stepMs = 15, maxSteps = 120): Promise<void> {
      let lastError: unknown;
      for (let i = 0; i < maxSteps; i++) {
        try {
          assertion();
          return;
        } catch (err) {
          lastError = err;
          await flushFakeTimersAndMicrotasks(stepMs);
        }
      }
      assertion();
      if (lastError) {
        throw lastError;
      }
    }

    it('Test 1 (Schedule Overview): unlocks Complete/Skip buttons and transitions badge from Chưa đến giờ to Đến hạn automatically without manual refresh', async () => {
      vi.useFakeTimers();
      // 08:59:50 VN on 2026-11-12
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));

      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      const nearDueIso = '2026-11-12T02:00:00.000Z'; // 09:00:00 VN
      const nearDueItem: TodayScheduleItemDto = {
        scheduleId: 'sch-live-due',
        plantId: 'plt-1',
        plantName: 'Monstera Cửa Sổ',
        gardenName: 'Ban công hướng Đông',
        taskType: 'WATERING',
        taskLabel: 'Tưới đúng 09:00 sáng',
        nextScheduledAt: nearDueIso,
        isOverdue: false,
        status: 'ACTIVE',
      };

      let todayCalls = 0;
      let completeCalls = 0;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/schedules/today' && config.method === 'get') {
          todayCalls += 1;
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [nearDueItem] },
            headers: {},
            config,
          });
        }
        if (config.url === '/schedules/sch-live-due/complete' && config.method === 'post') {
          completeCalls += 1;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                careLogId: 'log-live-1',
                scheduleStatus: 'ACTIVE',
                nextScheduledAt: futureIso,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<ScheduleScreen />);

      await waitForFake(() => {
        expect(container!.textContent).toContain('Tưới đúng 09:00 sáng');
        expect(container!.textContent).toContain('Chưa đến giờ');
      });

      const completeBtn = () =>
        container!.querySelector('[aria-label="Hoàn thành Tưới nước cho Monstera Cửa Sổ"]');
      const skipBtn = () =>
        container!.querySelector('[aria-label="Bỏ qua Tưới nước cho Monstera Cửa Sổ"]');

      expect(completeBtn()?.getAttribute('aria-disabled')).toBe('true');
      expect(skipBtn()?.getAttribute('aria-disabled')).toBe('true');
      expect(container!.textContent).toContain('1 việc hôm nay • 0 việc quá hạn');
      expect(todayCalls).toBe(1);

      // Advance fake clock to exact nextScheduledAt boundary without pressing Refresh or touching inputs
      const deltaToDueMs = Math.max(0, Date.parse(nearDueIso) - Date.now());
      await flushFakeTimersAndMicrotasks(deltaToDueMs);

      await waitForFake(() => {
        expect(container!.textContent).toContain('Đến hạn');
        expect(container!.textContent).not.toContain('Chưa đến giờ');
      });

      expect(completeBtn()?.getAttribute('aria-disabled')).not.toBe('true');
      expect(skipBtn()?.getAttribute('aria-disabled')).not.toBe('true');
      expect(todayCalls).toBe(1);

      // Execute Complete immediately once unlocked by live clock
      clickElement(completeBtn());
      await waitForFake(() => {
        expect(completeCalls).toBe(1);
        expect(container!.textContent).toContain('Đã ghi nhận hoàn thành');
      });
    });

    it('Test 2 (Schedule Detail): unlocks Complete/Skip at nextScheduledAt automatically and enforces runtime state rules for PAUSED/COMPLETED/CANCELLED/invalid timestamps', async () => {
      // Independent getScheduleRuntimeState contract verification
      const exactMs = Date.parse('2026-11-12T02:00:00.000Z');
      expect(
        getScheduleRuntimeState(
          { status: 'ACTIVE', nextScheduledAt: '2026-11-12T02:00:00.000Z', isOverdue: false },
          exactMs - 1
        )
      ).toEqual({ isDue: false, isOverdue: false });
      expect(
        getScheduleRuntimeState(
          { status: 'ACTIVE', nextScheduledAt: '2026-11-12T02:00:00.000Z', isOverdue: false },
          exactMs
        )
      ).toEqual({ isDue: true, isOverdue: false });
      expect(
        getScheduleRuntimeState(
          { status: 'ACTIVE', nextScheduledAt: '2026-11-12T02:00:00.000Z', isOverdue: false },
          exactMs + 1
        )
      ).toEqual({ isDue: true, isOverdue: true });
      // Server isOverdue=true preserved on ACTIVE valid timestamp even if client clock slightly behind
      expect(
        getScheduleRuntimeState(
          { status: 'ACTIVE', nextScheduledAt: '2026-11-12T02:00:00.000Z', isOverdue: true },
          exactMs - 5_000
        )
      ).toEqual({ isDue: true, isOverdue: true });
      // Invalid / null / non-ACTIVE schedules never allow action
      expect(
        getScheduleRuntimeState({ status: 'ACTIVE', nextScheduledAt: 'not-a-date', isOverdue: true }, exactMs + 1_000)
      ).toEqual({ isDue: false, isOverdue: false });
      expect(
        getScheduleRuntimeState({ status: 'ACTIVE', nextScheduledAt: null, isOverdue: false }, exactMs)
      ).toEqual({ isDue: false, isOverdue: false });
      for (const nonActive of ['PAUSED', 'COMPLETED', 'CANCELLED'] as const) {
        expect(
          getScheduleRuntimeState(
            { status: nonActive, nextScheduledAt: '2026-11-12T02:00:00.000Z', isOverdue: true },
            exactMs + 60_000
          )
        ).toEqual({ isDue: false, isOverdue: false });
      }

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1', scheduleId: 'sch-detail-live' };

      const nearSchedule: CareScheduleDto = {
        ...scheduleDetailOne,
        id: 'sch-detail-live',
        taskLabel: 'Kiểm tra nút tự mở ở Detail',
        nextScheduledAt: '2026-11-12T02:00:00.000Z',
        isOverdue: false,
        status: 'ACTIVE',
      };

      const calledUrls: string[] = [];
      let pausedOnServer = false;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        calledUrls.push(`${String(config.method).toUpperCase()} ${config.url}`);
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...nearSchedule, status: pausedOnServer ? 'PAUSED' : 'ACTIVE' }],
                page: 0,
                size: 100,
                totalElements: 1,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/schedules/sch-detail-live' && config.method === 'put') {
          pausedOnServer = true;
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { ...nearSchedule, status: 'PAUSED' } },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<ScheduleDetailScreen />);

      await waitForFake(() => {
        expect(container!.textContent).toContain('Kiểm tra nút tự mở ở Detail');
        expect(container!.textContent).toContain('Chưa đến giờ');
      });

      const completeDetailBtn = () =>
        container!.querySelector('[aria-label="Hoàn thành lượt chăm sóc"]');
      const skipDetailBtn = () =>
        container!.querySelector('[aria-label="Bỏ qua lượt chăm sóc"]');

      expect(completeDetailBtn()?.getAttribute('aria-disabled')).toBe('true');
      expect(skipDetailBtn()?.getAttribute('aria-disabled')).toBe('true');

      // Advance clock cleanly to exact deadline
      const deltaToDueMs = Math.max(0, exactMs - Date.now());
      await flushFakeTimersAndMicrotasks(deltaToDueMs);

      await waitForFake(() => {
        expect(container!.textContent).toContain('Đến hạn');
        expect(completeDetailBtn()?.getAttribute('aria-disabled')).not.toBe('true');
        expect(skipDetailBtn()?.getAttribute('aria-disabled')).not.toBe('true');
      });

      // Never calls non-existent GET /schedules/{id}
      expect(calledUrls).not.toContain('GET /schedules/sch-detail-live');
      expect(calledUrls).not.toContain('GET /schedules');

      // Pausing locks execution even though clock is at/past nextScheduledAt
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Tạm ngưng')
      );
      await waitForFake(() => {
        expect(container!.textContent).toContain('Tạm ngưng');
        expect(completeDetailBtn()?.getAttribute('aria-disabled')).toBe('true');
        expect(skipDetailBtn()?.getAttribute('aria-disabled')).toBe('true');
      });
    });

    it('Test 3 (Automatic Overdue & PlantDetail): updates Quá hạn badge, header counters & filters across Overview, Detail & PlantDetailScreen without query refetch', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      const nearDueIso = '2026-11-12T02:00:00.000Z';
      const todayItem: TodayScheduleItemDto = {
        scheduleId: 'sch-auto-overdue',
        plantId: 'plt-1',
        plantName: 'Monstera Cửa Sổ',
        gardenName: 'Ban công hướng Đông',
        taskType: 'WATERING',
        taskLabel: 'Tưới chuyển quá hạn tự động',
        nextScheduledAt: nearDueIso,
        isOverdue: false,
        status: 'ACTIVE',
      };
      const plantActiveSched: CareScheduleDto = {
        ...scheduleDetailOne,
        id: 'sch-auto-overdue',
        taskLabel: 'Tưới chuyển quá hạn tự động',
        nextScheduledAt: nearDueIso,
        isOverdue: false,
        status: 'ACTIVE',
      };
      const plantPausedSched: CareScheduleDto = {
        ...scheduleDetailPaused,
        id: 'sch-paused-past',
        taskLabel: 'Tỉa cành đang tạm ngưng',
        nextScheduledAt: nearDueIso,
        isOverdue: false,
        status: 'PAUSED',
      };

      let todayCalls = 0;
      let plantSchedulesCalls = 0;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/schedules/today' && config.method === 'get') {
          todayCalls += 1;
          return Promise.resolve({ status: 200, data: { success: true, data: [todayItem] }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          plantSchedulesCalls += 1;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [plantActiveSched, plantPausedSched],
                page: 0,
                size: 100,
                totalElements: 2,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (
          (config.url === '/plants/plt-1/care-logs' || config.url === '/plants/plt-1/journals') &&
          config.method === 'get'
        ) {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      // 1) Verify Overview automatic Overdue transition & filter updates without refetch
      mountWithProviders(<ScheduleScreen />);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Tưới chuyển quá hạn tự động');
        expect(container!.textContent).toContain('1 việc hôm nay • 0 việc quá hạn');
        expect(container!.textContent).toContain('Quá hạn (0)');
        expect(container!.textContent).toContain('Trong ngày (1)');
      });
      expect(todayCalls).toBe(1);

      // Advance past deadline + 10s clock interval tick -> 02:00:10Z (strictly after nextScheduledAt)
      await flushFakeTimersAndMicrotasks(20_000);

      await waitForFake(() => {
        expect(container!.textContent).toContain('1 việc hôm nay • 1 việc quá hạn');
        expect(container!.textContent).toContain('Quá hạn (1)');
        expect(container!.textContent).toContain('Trong ngày (0)');
      });
      expect(todayCalls).toBe(1);

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.startsWith('Quá hạn (1)')
        )
      );
      expect(container!.textContent).toContain('Tưới chuyển quá hạn tự động');
      expect(container!.textContent).toContain('Quá hạn');

      // 2) Verify ScheduleDetailScreen transitions automatically to Overdue without refetch
      await act(async () => {
        root!.unmount();
      });
      root = createRoot(container!);
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));
      routeParamsState.current = { plantId: 'plt-1', scheduleId: 'sch-auto-overdue' };

      mountWithProviders(<ScheduleDetailScreen />);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Tưới chuyển quá hạn tự động');
        expect(container!.textContent).toContain('Chưa đến giờ');
      });
      expect(plantSchedulesCalls).toBe(1);

      await flushFakeTimersAndMicrotasks(20_000);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Quá hạn');
        expect(container!.textContent).toContain('Lượt chăm sóc này đã quá hạn');
      });
      expect(plantSchedulesCalls).toBe(1);

      // 3) Verify PlantDetailScreen recalculates Quá hạn ONLY for ACTIVE schedules across time without refetch
      await act(async () => {
        root!.unmount();
      });
      root = createRoot(container!);
      qc.clear();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));
      routeParamsState.current = { plantId: 'plt-1' };
      plantSchedulesCalls = 0;

      mountWithProviders(<PlantDetailScreen />);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Tưới chuyển quá hạn tự động');
        expect(container!.textContent).toContain('Tỉa cành đang tạm ngưng');
      });
      expect(container!.textContent).not.toContain('Quá hạn');
      expect(plantSchedulesCalls).toBe(1);

      await flushFakeTimersAndMicrotasks(20_000);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Quá hạn');
      });
      // Only 1 "Quá hạn" tag (for ACTIVE schedule, never for PAUSED schedule) and 0 refetches
      const overdueOccurrences = (container!.textContent?.match(/Quá hạn/g) ?? []).length;
      expect(overdueOccurrences).toBe(1);
      expect(plantSchedulesCalls).toBe(1);
    });

    it('Test 4 (AppState Foreground, Refocus & VN Midnight): syncs clock and refetches GET /schedules/today on resume, route refocus & Asia/Ho_Chi_Minh day rollover', async () => {
      vi.useFakeTimers();
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      let visibilityStateValue: DocumentVisibilityState = 'visible';
      const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibilityStateValue,
      });

      try {
        // Part A & C: AppState background -> active + ScreenFocusProvider blur -> focus
        vi.setSystemTime(new Date('2026-11-11T16:59:50.000Z')); // 23:59:50 on 2026-11-11 VN (UTC+7!)
        expect(getTodayVnDateString(new Date('2026-11-11T16:59:50.000Z'))).toBe('2026-11-11');
        expect(getNextVnMidnightMs(Date.parse('2026-11-11T16:59:50.000Z'))).toBe(
          Date.parse('2026-11-11T17:00:00.000Z')
        );

        let todayCalls = 0;
        let serverItems: TodayScheduleItemDto[] = [
          {
            ...todayNotYetDueItem,
            scheduleId: 'sch-day-11',
            taskLabel: 'Công việc ngày 11-11 VN',
            nextScheduledAt: '2026-11-11T17:05:00.000Z',
            isOverdue: false,
          },
        ];

        apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
          if (config.url === '/users/me') {
            return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
          }
          if (config.url === '/schedules/today' && config.method === 'get') {
            todayCalls += 1;
            return Promise.resolve({
              status: 200,
              data: { success: true, data: serverItems },
              headers: {},
              config,
            });
          }
          throw new Error(`Unexpected call: ${config.method} ${config.url}`);
        });

        act(() => {
          root!.render(
            <QueryClientProvider client={qc}>
              <AuthProvider>
                <PlantDataProvider>
                  <ScreenFocusProvider isFocused={true}>
                    <ScheduleScreen />
                  </ScreenFocusProvider>
                </PlantDataProvider>
              </AuthProvider>
            </QueryClientProvider>
          );
        });

        await waitForFake(() => {
          expect(container!.textContent).toContain('Công việc ngày 11-11 VN');
          expect(container!.textContent).toContain('Chưa đến giờ');
        });
        expect(todayCalls).toBe(1);

        // Step 1: Cross VN midnight (16:59:50Z -> 17:00:05Z = 2026-11-12 00:00:05 VN) while screen stays open
        serverItems = [
          {
            scheduleId: 'sch-day-12',
            plantId: 'plt-1',
            plantName: 'Monstera Cửa Sổ',
            gardenName: 'Ban công hướng Đông',
            taskType: 'WATERING',
            taskLabel: 'Công việc mới ngày 12-11 VN',
            nextScheduledAt: '2026-11-11T17:00:03.000Z', // 00:00:03 VN (past at 00:00:05!)
            isOverdue: false,
            status: 'ACTIVE',
          },
        ];

        await flushFakeTimersAndMicrotasks(15_000);

        await waitForFake(() => {
          expect(todayCalls).toBe(2);
          expect(container!.textContent).toContain('Công việc mới ngày 12-11 VN');
          expect(container!.textContent).not.toContain('Công việc ngày 11-11 VN');
        });

        // Step 2: Background the app -> change clock + server payload -> foreground AppState 'active'
        act(() => {
          visibilityStateValue = 'hidden';
          document.dispatchEvent(new Event('visibilitychange'));
        });

        serverItems = [
          {
            scheduleId: 'sch-resumed',
            plantId: 'plt-1',
            plantName: 'Monstera Cửa Sổ',
            gardenName: 'Ban công hướng Đông',
            taskType: 'PRUNING',
            taskLabel: 'Đồng bộ sau khi mở lại AppState',
            nextScheduledAt: '2026-11-11T17:10:00.000Z', // 00:10:00 VN
            isOverdue: false,
            status: 'ACTIVE',
          },
        ];
        // Jump time to 00:15:00 VN cleanly while in background
        vi.setSystemTime(new Date('2026-11-11T17:15:00.000Z'));
        expect(todayCalls).toBe(2);

        await act(async () => {
          visibilityStateValue = 'visible';
          document.dispatchEvent(new Event('visibilitychange'));
          await vi.advanceTimersByTimeAsync(20);
        });

        await waitForFake(() => {
          expect(todayCalls).toBe(3);
          expect(container!.textContent).toContain('Đồng bộ sau khi mở lại AppState');
          expect(container!.textContent).toContain('Quá hạn');
        });

        // Step 3: Route blur -> refocus via ScreenFocusProvider refreshes GET /schedules/today
        act(() => {
          root!.render(
            <QueryClientProvider client={qc}>
              <AuthProvider>
                <PlantDataProvider>
                  <ScreenFocusProvider isFocused={false}>
                    <ScheduleScreen />
                  </ScreenFocusProvider>
                </PlantDataProvider>
              </AuthProvider>
            </QueryClientProvider>
          );
        });
        expect(todayCalls).toBe(3);

        serverItems = [
          {
            ...serverItems[0],
            taskLabel: 'Dữ liệu làm mới khi quay lại tab Schedule',
          },
        ];
        act(() => {
          root!.render(
            <QueryClientProvider client={qc}>
              <AuthProvider>
                <PlantDataProvider>
                  <ScreenFocusProvider isFocused={true}>
                    <ScheduleScreen />
                  </ScreenFocusProvider>
                </PlantDataProvider>
              </AuthProvider>
            </QueryClientProvider>
          );
        });

        await waitForFake(() => {
          expect(todayCalls).toBe(4);
          expect(container!.textContent).toContain('Dữ liệu làm mới khi quay lại tab Schedule');
        });
      } finally {
        if (originalVisibilityDescriptor) {
          Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
        }
      }
    });

    it('Test 5 (Timer Lifecycle & Unmount Safety): creates single 10s interval (no 1s polling), cleans up timers & AppState listeners on blur/unmount without post-unmount state updates', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));

      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      const addListenerSpy = vi.spyOn(AppState, 'addEventListener');
      const consoleErrorSpy = vi.spyOn(console, 'error');

      let capturedHandler: ((nextState: 'active' | 'background') => void) | null = null;
      const removeListenerSpy = vi.fn();
      addListenerSpy.mockImplementation((_type, handler) => {
        capturedHandler = handler as typeof capturedHandler;
        return { remove: removeListenerSpy };
      });

      const harnessTransitions = ['2026-11-12T02:00:00.000Z'];
      const onCommitSpy = vi.fn();
      function ClockHarness() {
        const result = useScheduleClock({
          enabled: true,
          intervalMs: DEFAULT_SCHEDULE_CLOCK_INTERVAL_MS,
          transitionIsoTimestamps: harnessTransitions,
          trackVnMidnight: true,
        });
        useEffect(() => {
          onCommitSpy(result.nowMs);
        });
        return (
          <div data-testid="clock-probe" data-active={String(result.isClockActive)}>
            {String(result.nowMs)}
          </div>
        );
      }

      act(() => {
        root!.render(
          <ScreenFocusProvider isFocused={true}>
            <ClockHarness />
          </ScreenFocusProvider>
        );
      });

      const clockIntervals = setIntervalSpy.mock.calls.filter(
        ([, delay]) => delay === DEFAULT_SCHEDULE_CLOCK_INTERVAL_MS
      );
      const oneSecondPolling = setIntervalSpy.mock.calls.filter(([, delay]) => delay === 1000);
      expect(clockIntervals.length).toBe(1);
      expect(oneSecondPolling.length).toBe(0);
      expect(container!.querySelector('[data-testid="clock-probe"]')?.getAttribute('data-active')).toBe(
        'true'
      );

      // Lose focus -> clears interval and removes AppState listener immediately without creating duplicates
      const clearCountBeforeBlur = clearIntervalSpy.mock.calls.length;
      act(() => {
        root!.render(
          <ScreenFocusProvider isFocused={false}>
            <ClockHarness />
          </ScreenFocusProvider>
        );
      });
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearCountBeforeBlur);
      expect(removeListenerSpy).toHaveBeenCalledTimes(1);
      expect(container!.querySelector('[data-testid="clock-probe"]')?.getAttribute('data-active')).toBe(
        'false'
      );

      // Refocus -> re-establishes single interval and single AppState listener
      act(() => {
        root!.render(
          <ScreenFocusProvider isFocused={true}>
            <ClockHarness />
          </ScreenFocusProvider>
        );
      });
      expect(
        setIntervalSpy.mock.calls.filter(([, delay]) => delay === DEFAULT_SCHEDULE_CLOCK_INTERVAL_MS).length
      ).toBe(2);
      expect(addListenerSpy).toHaveBeenCalledTimes(2);

      // Unmount -> removes remaining AppState listener and prevents post-unmount renders/state updates
      await act(async () => {
        root?.unmount();
      });
      root = null;
      expect(removeListenerSpy).toHaveBeenCalledTimes(2);

      const commitsAtUnmount = onCommitSpy.mock.calls.length;
      act(() => {
        capturedHandler?.('background');
        capturedHandler?.('active');
      });
      await flushFakeTimersAndMicrotasks(60_000);
      expect(onCommitSpy.mock.calls.length).toBe(commitsAtUnmount);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('Test 6 (Account A -> B Clock & Refetch Isolation): blocks stale Account A /schedules/today refetch after switching to Account B', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));

      await tokenStorage.saveSession(sessionA);
      const deferredTodayA = createDeferred<void>();
      let blockNextARefetch = false;

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
        if (config.url === '/schedules/today' && config.method === 'get') {
          if (!isB && blockNextARefetch) {
            await deferredTodayA.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: [
                  {
                    ...todayOverdueItem,
                    scheduleId: 'sch-leak-a',
                    plantName: 'RÒ RỈ TÀI KHOẢN A',
                    taskLabel: 'Lịch bí mật của User A',
                  },
                ],
              },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: isB
                ? [
                    {
                      ...todayNotYetDueItem,
                      scheduleId: 'sch-b-only',
                      plantName: 'Cây Riêng User B',
                      taskLabel: 'Lịch An Toàn Của User B',
                      nextScheduledAt: '2026-11-12T02:00:00.000Z',
                      isOverdue: false,
                    },
                  ]
                : [todayOverdueItem],
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
        return null;
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <PlantDataProvider>
                <Probe />
                <ScheduleScreen />
              </PlantDataProvider>
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitForFake(() => {
        expect(container!.textContent).toContain('Tưới 300ml nước quanh gốc');
      });

      // Trigger manual refresh for User A and switch to User B before it resolves
      blockNextARefetch = true;
      clickElement(container!.querySelector('[aria-label="Làm mới lịch hôm nay"]'));

      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'Secret123!' });
      });

      await waitForFake(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Lịch An Toàn Của User B');
      });

      // Resolve User A's late response -> MUST NOT touch User B cache or UI
      await act(async () => {
        deferredTodayA.resolve();
        await vi.advanceTimersByTimeAsync(40);
      });

      expect(container!.textContent).toContain('Lịch An Toàn Của User B');
      expect(container!.textContent).not.toContain('RÒ RỈ TÀI KHOẢN A');
      expect(container!.textContent).not.toContain('Lịch bí mật của User A');
      const cachedB = qc.getQueryData<TodayScheduleItemDto[]>(queryKeys.schedules.today(mockUserB.id));
      expect(cachedB?.map((i) => i.scheduleId)).toEqual(['sch-b-only']);

      // Live clock continues ticking accurately for User B
      await flushFakeTimersAndMicrotasks(20_000);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Quá hạn');
      });
    });
  });

  describe('11. G5.4.2.1.1 Shared Schedule Clock & AppState Listener Lifecycle', () => {
    async function flushFakeTimersAndMicrotasks(ms = 20) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    async function waitForFake(assertion: () => void, stepMs = 15, maxSteps = 120): Promise<void> {
      let lastError: unknown;
      for (let i = 0; i < maxSteps; i++) {
        try {
          assertion();
          return;
        } catch (err) {
          lastError = err;
          await flushFakeTimersAndMicrotasks(stepMs);
        }
      }
      assertion();
      if (lastError) {
        throw lastError;
      }
    }

    function createAppStateTracker() {
      const origAdd = AppState.addEventListener.bind(AppState);
      const activeListeners = new Set<symbol>();
      let addCount = 0;
      let removeCount = 0;
      const capturedHandlers: ((nextState: 'active' | 'background' | 'inactive') => void)[] = [];

      const addSpy = vi.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
        const token = Symbol(`appstate-${++addCount}`);
        activeListeners.add(token);
        capturedHandlers.push(handler as (nextState: 'active' | 'background' | 'inactive') => void);
        const sub = origAdd(type, handler);
        return {
          remove: () => {
            if (activeListeners.delete(token)) {
              removeCount += 1;
            }
            sub?.remove?.();
          },
        };
      });

      return {
        addSpy,
        activeListeners,
        capturedHandlers,
        getAddCount: () => addCount,
        getRemoveCount: () => removeCount,
      };
    }

    function createTimerTracker() {
      const origSetInterval = globalThis.setInterval;
      const origClearInterval = globalThis.clearInterval;
      const active10sIntervals = new Set<ReturnType<typeof setInterval>>();
      let total10sIntervals = 0;
      let total1sIntervals = 0;

      vi.spyOn(globalThis, 'setInterval').mockImplementation(((
        cb: TimerHandler,
        delay?: number,
        ...args: unknown[]
      ) => {
        const id = origSetInterval(cb, delay, ...args);
        if (delay === DEFAULT_SCHEDULE_CLOCK_INTERVAL_MS) {
          total10sIntervals += 1;
          active10sIntervals.add(id);
        }
        if (delay === 1000) {
          total1sIntervals += 1;
        }
        return id;
      }) as typeof globalThis.setInterval);

      vi.spyOn(globalThis, 'clearInterval').mockImplementation(((id?: ReturnType<typeof setInterval>) => {
        if (id !== undefined) {
          active10sIntervals.delete(id);
        }
        origClearInterval(id);
      }) as typeof globalThis.clearInterval);

      return {
        active10sIntervals,
        getTotal10sIntervals: () => total10sIntervals,
        getTotal1sIntervals: () => total1sIntervals,
      };
    }

    it('Test A (Shared Clock in ScheduleScreen): mounts 1 interval, 0 1s polling & 1 AppState listener while synchronizing header, overview UI and VN midnight refetch', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-11T16:59:45.000Z')); // 23:59:45 VN on 2026-11-11
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      const appStateTracker = createAppStateTracker();
      const timerTracker = createTimerTracker();

      const dueSoonIso = '2026-11-11T16:59:50.000Z'; // +5s, 23:59:50 VN
      let todayCalls = 0;
      let serverItems: TodayScheduleItemDto[] = [
        {
          ...todayNotYetDueItem,
          taskType: 'WATERING',
          scheduleId: 'sch-shared-clock',
          taskLabel: 'Đồng bộ header và danh sách',
          nextScheduledAt: dueSoonIso,
          isOverdue: false,
          status: 'ACTIVE',
        },
      ];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/schedules/today' && config.method === 'get') {
          todayCalls += 1;
          return Promise.resolve({
            status: 200,
            data: { success: true, data: serverItems },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <PlantDataProvider>
                <ScreenFocusProvider isFocused={true}>
                  <ScheduleScreen />
                </ScreenFocusProvider>
              </PlantDataProvider>
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitForFake(() => {
        expect(container!.textContent).toContain('Đồng bộ header và danh sách');
        expect(container!.textContent).toContain('1 việc hôm nay • 0 việc quá hạn');
        expect(container!.textContent).toContain('Chưa đến giờ');
      });

      expect(todayCalls).toBe(1);
      expect(appStateTracker.getAddCount()).toBe(1);
      expect(appStateTracker.activeListeners.size).toBe(1);
      expect(timerTracker.getTotal10sIntervals()).toBe(1);
      expect(timerTracker.active10sIntervals.size).toBe(1);
      expect(timerTracker.getTotal1sIntervals()).toBe(0);

      // Advance to exact deadline boundary (16:59:50Z) -> boundary timeout unlocks Đến hạn immediately
      const deltaToBoundary = Math.max(0, Date.parse(dueSoonIso) - Date.now());
      await flushFakeTimersAndMicrotasks(deltaToBoundary);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Đến hạn');
        expect(container!.textContent).not.toContain('Chưa đến giờ');
      });
      const completeBtn = container!.querySelector('[aria-label="Hoàn thành Tưới nước cho Monstera Cửa Sổ"]');
      const skipBtn = container!.querySelector('[aria-label="Bỏ qua Tưới nước cho Monstera Cửa Sổ"]');
      expect(completeBtn?.getAttribute('aria-disabled')).not.toBe('true');
      expect(skipBtn?.getAttribute('aria-disabled')).not.toBe('true');

      // Advance past first 10s interval (16:59:55Z, strictly after 16:59:50Z) -> header and overview sync Quá hạn
      await flushFakeTimersAndMicrotasks(5_500);
      await waitForFake(() => {
        expect(container!.textContent).toContain('1 việc hôm nay • 1 việc quá hạn');
        expect(container!.textContent).toContain('Quá hạn (1)');
        expect(container!.textContent).toContain('Trong ngày (0)');
      });
      expect(todayCalls).toBe(1);

      // Cross VN midnight (17:00:02Z = 00:00:02 VN 2026-11-12) -> single refetch only
      serverItems = [
        {
          ...todayNotYetDueItem,
          taskType: 'WATERING',
          scheduleId: 'sch-new-day-vn',
          taskLabel: 'Lịch ngày 12-11 mới',
          nextScheduledAt: '2026-11-11T17:10:00.000Z',
          isOverdue: false,
          status: 'ACTIVE',
        },
      ];
      await flushFakeTimersAndMicrotasks(6_000);

      await waitForFake(() => {
        expect(todayCalls).toBe(2);
        expect(container!.textContent).toContain('Lịch ngày 12-11 mới');
        expect(container!.textContent).toContain('1 việc hôm nay • 0 việc quá hạn');
      });
    });

    it('Test B (Eligibility & Repeated Blur/Refocus Lifecycle): registers 0 listeners/timers when disabled or blurred initially and avoids listener accumulation across cycles', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));

      const appStateTracker = createAppStateTracker();
      const timerTracker = createTimerTracker();
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const consoleErrorSpy = vi.spyOn(console, 'error');

      // 1) Non-schedule PageContent tab (GardensScreen) passes enabled=false -> 0 listeners & 0 timers
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/gardens') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [] },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <PlantDataProvider>
                <ScreenFocusProvider isFocused={true}>
                  <GardensScreen />
                </ScreenFocusProvider>
              </PlantDataProvider>
            </AuthProvider>
          </QueryClientProvider>
        );
      });
      await waitForFake(() => {
        expect(container!.textContent).toContain('Khu Vườn');
      });
      expect(appStateTracker.getAddCount()).toBe(0);
      expect(appStateTracker.activeListeners.size).toBe(0);
      expect(timerTracker.getTotal10sIntervals()).toBe(0);

      await act(async () => {
        root?.unmount();
      });
      root = createRoot(container!);

      // 2) Mount ClockHarness initially with isFocused={false} -> 0 listeners, 0 intervals, 0 boundary timeouts
      const onCommitSpy = vi.fn();
      const transitions = ['2026-11-12T02:00:00.000Z'];
      function LifecycleHarness({ enabled }: { enabled: boolean }) {
        const result = useScheduleClock({
          enabled,
          transitionIsoTimestamps: transitions,
          trackVnMidnight: true,
        });
        useEffect(() => {
          onCommitSpy(result.nowMs);
        });
        return (
          <div data-testid="lifecycle-probe" data-active={String(result.isClockActive)}>
            {String(result.nowMs)}
          </div>
        );
      }

      const boundaryTimeoutCount = () =>
        setTimeoutSpy.mock.calls.filter(
          ([, delay]) => typeof delay === 'number' && delay >= 5_000 && delay <= 20_000
        ).length;

      act(() => {
        root!.render(
          <ScreenFocusProvider isFocused={false}>
            <LifecycleHarness enabled={true} />
          </ScreenFocusProvider>
        );
      });
      expect(appStateTracker.getAddCount()).toBe(0);
      expect(appStateTracker.activeListeners.size).toBe(0);
      expect(timerTracker.active10sIntervals.size).toBe(0);
      expect(boundaryTimeoutCount()).toBe(0);
      expect(container!.querySelector('[data-testid="lifecycle-probe"]')?.getAttribute('data-active')).toBe(
        'false'
      );

      // 3) Repeat focus/blur 3 cycles -> active listeners always toggle cleanly 1 -> 0 -> 1 without leak
      for (let cycle = 1; cycle <= 3; cycle++) {
        act(() => {
          root!.render(
            <ScreenFocusProvider isFocused={true}>
              <LifecycleHarness enabled={true} />
            </ScreenFocusProvider>
          );
        });
        expect(appStateTracker.getAddCount()).toBe(cycle);
        expect(appStateTracker.activeListeners.size).toBe(1);
        expect(timerTracker.active10sIntervals.size).toBe(1);
        expect(container!.querySelector('[data-testid="lifecycle-probe"]')?.getAttribute('data-active')).toBe(
          'true'
        );

        act(() => {
          root!.render(
            <ScreenFocusProvider isFocused={false}>
              <LifecycleHarness enabled={true} />
            </ScreenFocusProvider>
          );
        });
        expect(appStateTracker.getRemoveCount()).toBe(cycle);
        expect(appStateTracker.activeListeners.size).toBe(0);
        expect(timerTracker.active10sIntervals.size).toBe(0);
        expect(container!.querySelector('[data-testid="lifecycle-probe"]')?.getAttribute('data-active')).toBe(
          'false'
        );
      }

      // Focus once more, then disable clock -> removes listener & interval cleanly
      act(() => {
        root!.render(
          <ScreenFocusProvider isFocused={true}>
            <LifecycleHarness enabled={true} />
          </ScreenFocusProvider>
        );
      });
      expect(appStateTracker.activeListeners.size).toBe(1);
      expect(timerTracker.active10sIntervals.size).toBe(1);

      act(() => {
        root!.render(
          <ScreenFocusProvider isFocused={true}>
            <LifecycleHarness enabled={false} />
          </ScreenFocusProvider>
        );
      });
      expect(appStateTracker.activeListeners.size).toBe(0);
      expect(appStateTracker.getRemoveCount()).toBe(4);
      expect(timerTracker.active10sIntervals.size).toBe(0);

      // Re-enable -> 1 listener & 1 interval, then unmount -> full cleanup + 0 post-unmount updates
      act(() => {
        root!.render(
          <ScreenFocusProvider isFocused={true}>
            <LifecycleHarness enabled={true} />
          </ScreenFocusProvider>
        );
      });
      expect(appStateTracker.activeListeners.size).toBe(1);
      expect(timerTracker.active10sIntervals.size).toBe(1);

      await act(async () => {
        root?.unmount();
      });
      root = null;
      expect(appStateTracker.activeListeners.size).toBe(0);
      expect(appStateTracker.getRemoveCount()).toBe(5);
      expect(timerTracker.active10sIntervals.size).toBe(0);

      const commitsAtUnmount = onCommitSpy.mock.calls.length;
      act(() => {
        for (const handler of appStateTracker.capturedHandlers) {
          handler('background');
          handler('active');
        }
      });
      await flushFakeTimersAndMicrotasks(60_000);
      expect(onCommitSpy.mock.calls.length).toBe(commitsAtUnmount);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('Test C (Background & Foreground Resume): clears intervals in background while keeping 1 listener, then resyncs time, restarts 1 interval and refetches once on resume', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      let visibilityStateValue: DocumentVisibilityState = 'visible';
      const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibilityStateValue,
      });

      try {
        const appStateTracker = createAppStateTracker();
        const timerTracker = createTimerTracker();

        const dueItem: TodayScheduleItemDto = {
          ...todayNotYetDueItem,
          scheduleId: 'sch-bg-resume',
          taskLabel: 'Chăm cây khi trở lại foreground',
          nextScheduledAt: '2026-11-12T02:00:00.000Z',
          isOverdue: false,
          status: 'ACTIVE',
        };

        let todayCalls = 0;
        apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
          if (config.url === '/users/me') {
            return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
          }
          if (config.url === '/schedules/today' && config.method === 'get') {
            todayCalls += 1;
            return Promise.resolve({
              status: 200,
              data: { success: true, data: [dueItem] },
              headers: {},
              config,
            });
          }
          throw new Error(`Unexpected call: ${config.method} ${config.url}`);
        });

        act(() => {
          root!.render(
            <QueryClientProvider client={qc}>
              <AuthProvider>
                <PlantDataProvider>
                  <ScreenFocusProvider isFocused={true}>
                    <ScheduleScreen />
                  </ScreenFocusProvider>
                </PlantDataProvider>
              </AuthProvider>
            </QueryClientProvider>
          );
        });

        await waitForFake(() => {
          expect(container!.textContent).toContain('Chăm cây khi trở lại foreground');
          expect(container!.textContent).toContain('Chưa đến giờ');
        });
        expect(todayCalls).toBe(1);
        expect(appStateTracker.activeListeners.size).toBe(1);
        expect(timerTracker.active10sIntervals.size).toBe(1);

        // Background the app -> stops intervals cleanly while retaining the single AppState listener
        act(() => {
          visibilityStateValue = 'hidden';
          document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(appStateTracker.activeListeners.size).toBe(1);
        expect(timerTracker.active10sIntervals.size).toBe(0);

        // Advance time past deadline while still in background -> no premature background polling or refetch
        vi.setSystemTime(new Date('2026-11-12T02:05:00.000Z'));
        await flushFakeTimersAndMicrotasks(30_000);
        expect(todayCalls).toBe(1);
        expect(timerTracker.active10sIntervals.size).toBe(0);
        expect(container!.textContent).toContain('Chưa đến giờ');

        // Resume to foreground -> single refetch, immediate overdue sync & 1 restarted interval
        await act(async () => {
          visibilityStateValue = 'visible';
          document.dispatchEvent(new Event('visibilitychange'));
          await vi.advanceTimersByTimeAsync(20);
        });

        await waitForFake(() => {
          expect(todayCalls).toBe(2);
          expect(container!.textContent).toContain('Quá hạn');
          expect(container!.textContent).toContain('1 việc hôm nay • 1 việc quá hạn');
        });
        expect(appStateTracker.activeListeners.size).toBe(1);
        expect(timerTracker.active10sIntervals.size).toBe(1);
      } finally {
        if (originalVisibilityDescriptor) {
          Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
        }
      }
    });

    it('Test D (PlantDetailScreen Clock Gating): attaches 0 listeners/intervals with empty or non-ACTIVE schedules, activates 1 listener/interval with ACTIVE schedule, and cleans up on blur/unmount', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { plantId: 'plt-1' };

      const appStateTracker = createAppStateTracker();
      const timerTracker = createTimerTracker();

      let serverSchedules: CareScheduleDto[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1') {
          return Promise.resolve({ status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1/schedules' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: serverSchedules,
                page: 0,
                size: 10,
                totalElements: serverSchedules.length,
                totalPages: serverSchedules.length > 0 ? 1 : 0,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (
          (config.url === '/plants/plt-1/care-logs' || config.url === '/plants/plt-1/journals') &&
          config.method === 'get'
        ) {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      const renderPlantDetail = (focused: boolean) => {
        act(() => {
          root!.render(
            <QueryClientProvider client={qc}>
              <AuthProvider>
                <PlantDataProvider>
                  <ScreenFocusProvider isFocused={focused}>
                    <PlantDetailScreen />
                  </ScreenFocusProvider>
                </PlantDataProvider>
              </AuthProvider>
            </QueryClientProvider>
          );
        });
      };

      // 1) Empty schedules -> 0 listeners & 0 intervals
      renderPlantDetail(true);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Chưa có lịch chăm sóc cho cây này');
      });
      expect(appStateTracker.activeListeners.size).toBe(0);
      expect(appStateTracker.getAddCount()).toBe(0);
      expect(timerTracker.active10sIntervals.size).toBe(0);

      // 2) Only PAUSED / COMPLETED schedules -> still 0 listeners & 0 intervals
      serverSchedules = [
        {
          ...scheduleDetailPaused,
          id: 'sch-paused-only',
          taskLabel: 'Lịch tạm ngưng không cần clock',
          status: 'PAUSED',
        },
        {
          ...scheduleDetailOne,
          id: 'sch-completed-only',
          taskLabel: 'Lịch đã hoàn tất',
          status: 'COMPLETED',
        },
      ];
      await act(async () => {
        await qc.invalidateQueries({ queryKey: queryKeys.plants.schedulesBase(mockUserA.id, 'plt-1') });
      });
      await waitForFake(() => {
        expect(container!.textContent).toContain('Lịch tạm ngưng không cần clock');
      });
      expect(appStateTracker.activeListeners.size).toBe(0);
      expect(appStateTracker.getAddCount()).toBe(0);
      expect(timerTracker.active10sIntervals.size).toBe(0);

      // 3) ACTIVE schedule appears -> activates exactly 1 AppState listener & 1 interval
      serverSchedules = [
        {
          ...scheduleDetailOne,
          id: 'sch-active-appeared',
          taskLabel: 'Lịch mới kích hoạt clock',
          nextScheduledAt: '2026-11-12T02:00:00.000Z',
          isOverdue: false,
          status: 'ACTIVE',
        },
      ];
      await act(async () => {
        await qc.invalidateQueries({ queryKey: queryKeys.plants.schedulesBase(mockUserA.id, 'plt-1') });
      });
      await waitForFake(() => {
        expect(container!.textContent).toContain('Lịch mới kích hoạt clock');
        expect(appStateTracker.activeListeners.size).toBe(1);
        expect(timerTracker.active10sIntervals.size).toBe(1);
      });

      // Deadline passes -> UI transitions cleanly to Quá hạn
      await flushFakeTimersAndMicrotasks(20_000);
      await waitForFake(() => {
        expect(container!.textContent).toContain('Quá hạn');
      });

      // 4) All ACTIVE schedules paused/removed -> automatically tears down AppState listener & interval (0/0)
      const activeServerSchedule = serverSchedules[0];
      serverSchedules = [{ ...activeServerSchedule, status: 'PAUSED' }];
      await act(async () => {
        await qc.invalidateQueries({ queryKey: queryKeys.plants.schedulesBase(mockUserA.id, 'plt-1') });
      });
      await waitForFake(() => {
        expect(appStateTracker.activeListeners.size).toBe(0);
        expect(timerTracker.active10sIntervals.size).toBe(0);
      });

      // Re-activate -> 1/1 again, then Blur -> 0/0, Refocus -> 1/1, Unmount -> 0/0
      serverSchedules = [activeServerSchedule];
      await act(async () => {
        await qc.invalidateQueries({ queryKey: queryKeys.plants.schedulesBase(mockUserA.id, 'plt-1') });
      });
      await waitForFake(() => {
        expect(appStateTracker.activeListeners.size).toBe(1);
        expect(timerTracker.active10sIntervals.size).toBe(1);
      });

      renderPlantDetail(false);
      expect(appStateTracker.activeListeners.size).toBe(0);
      expect(timerTracker.active10sIntervals.size).toBe(0);

      renderPlantDetail(true);
      expect(appStateTracker.activeListeners.size).toBe(1);
      expect(timerTracker.active10sIntervals.size).toBe(1);

      await act(async () => {
        root?.unmount();
      });
      root = null;
      expect(appStateTracker.activeListeners.size).toBe(0);
      expect(timerTracker.active10sIntervals.size).toBe(0);
    });

    it('Test E (Resume + Refocus Dedupe): prevents duplicate GET /schedules/today refetch when AppState resume and route refocus occur together while preserving later refocus refreshes', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-12T01:59:50.000Z'));
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      let visibilityStateValue: DocumentVisibilityState = 'visible';
      const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibilityStateValue,
      });

      try {
        const appStateTracker = createAppStateTracker();

        let todayCalls = 0;
        apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
          if (config.url === '/users/me') {
            return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
          }
          if (config.url === '/schedules/today' && config.method === 'get') {
            todayCalls += 1;
            return Promise.resolve({
              status: 200,
              data: { success: true, data: [todayNotYetDueItem] },
              headers: {},
              config,
            });
          }
          throw new Error(`Unexpected call: ${config.method} ${config.url}`);
        });

        const renderFocused = (focused: boolean) =>
          root!.render(
            <QueryClientProvider client={qc}>
              <AuthProvider>
                <PlantDataProvider>
                  <ScreenFocusProvider isFocused={focused}>
                    <ScheduleScreen />
                  </ScreenFocusProvider>
                </PlantDataProvider>
              </AuthProvider>
            </QueryClientProvider>
          );

        act(() => {
          renderFocused(true);
        });
        await waitForFake(() => {
          expect(todayCalls).toBe(1);
        });

        // Case E1: Background + Blur -> resume both AppState & focus together -> ONLY 1 refetch
        act(() => {
          visibilityStateValue = 'hidden';
          document.dispatchEvent(new Event('visibilitychange'));
          renderFocused(false);
        });
        expect(appStateTracker.activeListeners.size).toBe(0);
        expect(todayCalls).toBe(1);

        await act(async () => {
          visibilityStateValue = 'visible';
          document.dispatchEvent(new Event('visibilitychange'));
          renderFocused(true);
          await vi.advanceTimersByTimeAsync(20);
        });
        await waitForFake(() => {
          expect(todayCalls).toBe(2);
          expect(appStateTracker.activeListeners.size).toBe(1);
        });

        // Case E2: Blur while hidden -> refocus while AppState is still hidden -> then AppState resumes -> ONLY 1 refetch
        act(() => {
          visibilityStateValue = 'hidden';
          document.dispatchEvent(new Event('visibilitychange'));
          renderFocused(false);
        });
        expect(todayCalls).toBe(2);

        act(() => {
          renderFocused(true);
        });
        // App is still hidden (backgrounded) -> must not fire spurious focus refetch yet
        expect(todayCalls).toBe(2);

        await act(async () => {
          visibilityStateValue = 'visible';
          document.dispatchEvent(new Event('visibilitychange'));
          await vi.advanceTimersByTimeAsync(20);
        });
        await waitForFake(() => {
          expect(todayCalls).toBe(3);
        });

        // Case E3: Visibility switched active + route focused, followed immediately by visibilitychange -> ONLY 1 refetch
        act(() => {
          visibilityStateValue = 'hidden';
          document.dispatchEvent(new Event('visibilitychange'));
          renderFocused(false);
        });
        expect(todayCalls).toBe(3);

        act(() => {
          visibilityStateValue = 'visible';
          renderFocused(true);
        });
        await act(async () => {
          document.dispatchEvent(new Event('visibilitychange'));
          await vi.advanceTimersByTimeAsync(20);
        });
        await waitForFake(() => {
          expect(todayCalls).toBe(4);
        });

        // Case E4: Genuine subsequent blur -> refocus (even without timer jump) still triggers valid refresh
        act(() => {
          renderFocused(false);
        });
        await act(async () => {
          renderFocused(true);
          await vi.advanceTimersByTimeAsync(20);
        });
        await waitForFake(() => {
          expect(todayCalls).toBe(5);
        });
      } finally {
        if (originalVisibilityDescriptor) {
          Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
        }
      }
    });
  });
});
