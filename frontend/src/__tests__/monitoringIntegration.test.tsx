import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { formatIsoDateTimeVn } from '@/features/carelog/careLogApi';
import { useCreateCareLogMutation } from '@/features/carelog/careLogHooks';
import type { CareLogDto } from '@/features/carelog/careLogTypes';
import {
  useCreateGardenMutation,
  useDeleteGardenMutation,
  useUpdateGardenMutation,
} from '@/features/gardens/gardenHooks';
import type { GardenDetailDto, GardenSummaryDto } from '@/features/gardens/gardenTypes';
import {
  useCreateJournalMutation,
  useDeleteJournalMutation,
  useUpdateJournalMutation,
} from '@/features/journal/journalHooks';
import type { GrowthJournalDto } from '@/features/journal/journalTypes';
import { MonitoringScreen } from '@/features/main/MainScreens';
import MonitoringDetailScreen from '@/features/monitoring/MonitoringDetailScreen';
import {
  assertValidMonitoringPlantId,
  getMonitoringOverview,
  getPlantMonitoringDetail,
} from '@/features/monitoring/monitoringApi';
import {
  useMonitoringOverview,
  usePlantMonitoringDetail,
} from '@/features/monitoring/monitoringHooks';
import {
  MONITORING_CARE_LOG_PROVENANCE_NOTE,
  MONITORING_DEFAULT_HEALTHY_NOTE,
  MONITORING_JOURNAL_HEALTH_NOTE,
  MONITORING_PROFILE_HEALTH_LABEL,
  MONITORING_SENSOR_DISCONNECTED_TEXT,
  MONITORING_SPECIES_GUIDE_TITLE,
  type MonitoringOverviewDto,
  type PlantMonitoringDetailDto,
} from '@/features/monitoring/monitoringTypes';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
import {
  useCreatePlantMutation,
  useDeletePlantMutation,
  useUpdatePlantMutation,
} from '@/features/plants/plantHooks';
import type { UserPlantDetailDto, UserPlantSummaryDto } from '@/features/plants/plantTypes';
import {
  useCompleteScheduleMutation,
  useCreateScheduleMutation,
  useDeleteScheduleMutation,
  useSkipScheduleMutation,
  useUpdateScheduleMutation,
} from '@/features/schedule/scheduleHooks';
import { getTodayVnDateString } from '@/features/schedule/scheduleApi';
import type { CareScheduleDto } from '@/features/schedule/scheduleTypes';
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
  id: 'usr_mon_a',
  fullName: 'Nguyễn An Nhiên',
  email: 'nhien.mon@goplant.vn',
  roles: ['ROLE_USER'],
};

const mockUserB = {
  id: 'usr_mon_b',
  fullName: 'Phạm Bảo Nam',
  email: 'nam.mon@goplant.vn',
  roles: ['ROLE_USER'],
};

const sessionA: AuthSession = {
  accessToken: 'jwt-mon-token-a',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUserA,
  savedAt: Date.now(),
};

const sessionB: AuthSession = {
  accessToken: 'jwt-mon-token-b',
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

const sampleOverviewA: MonitoringOverviewDto = {
  gardensCount: 2,
  plantsCount: 5,
  healthDistribution: {
    healthyCount: 2,
    needsAttentionCount: 1,
    criticalCount: 1,
    unknownCount: 1,
  },
  schedulesSummary: {
    activeCount: 4,
    dueTodayCount: 2,
    overdueCount: 1,
  },
  careLogsSummary7d: {
    unlinkedCompletedLogs: 3,
    unlinkedSkippedLogs: 1,
    linkedScheduledCompletedLogs: 4,
    linkedScheduledSkippedLogs: 0,
  },
  careLogsSummary30d: {
    unlinkedCompletedLogs: 7,
    unlinkedSkippedLogs: 2,
    linkedScheduledCompletedLogs: 9,
    linkedScheduledSkippedLogs: 1,
  },
  attentionPlants: [
    {
      plantId: 'plt-att-1',
      displayName: 'Cà chua ban công A',
      gardenId: 'grd-mon-1',
      gardenName: 'Ban công hướng Đông',
      speciesName: 'Cà chua bi',
      healthStatus: 'CRITICAL',
    },
    {
      plantId: 'plt-att-2',
      displayName: 'Trầu bà phòng khách',
      gardenId: 'grd-mon-2',
      gardenName: 'Góc cửa sổ',
      speciesName: 'Trầu bà vàng',
      healthStatus: 'NEEDS_ATTENTION',
    },
  ],
  gardensSummary: [
    {
      gardenId: 'grd-mon-1',
      name: 'Ban công hướng Đông',
      plantCount: 3,
      attentionCount: 1,
    },
    {
      gardenId: 'grd-mon-2',
      name: 'Góc cửa sổ',
      plantCount: 2,
      attentionCount: 1,
    },
  ],
  sensorConnected: false,
  generatedAt: '2026-11-12T04:15:00Z',
};

const emptyOverview: MonitoringOverviewDto = {
  gardensCount: 0,
  plantsCount: 0,
  healthDistribution: {
    healthyCount: 0,
    needsAttentionCount: 0,
    criticalCount: 0,
    unknownCount: 0,
  },
  schedulesSummary: {
    activeCount: 0,
    dueTodayCount: 0,
    overdueCount: 0,
  },
  careLogsSummary7d: {
    unlinkedCompletedLogs: 0,
    unlinkedSkippedLogs: 0,
    linkedScheduledCompletedLogs: 0,
    linkedScheduledSkippedLogs: 0,
  },
  careLogsSummary30d: {
    unlinkedCompletedLogs: 0,
    unlinkedSkippedLogs: 0,
    linkedScheduledCompletedLogs: 0,
    linkedScheduledSkippedLogs: 0,
  },
  attentionPlants: [],
  gardensSummary: [],
  sensorConnected: false,
  generatedAt: '2026-11-12T04:15:00Z',
};

const samplePlantDetailA: PlantMonitoringDetailDto = {
  plantId: 'plt-att-1',
  displayName: 'Cà chua ban công A',
  garden: {
    id: 'grd-mon-1',
    name: 'Ban công hướng Đông',
  },
  species: {
    id: 'sp-1',
    commonName: 'Cà chua bi',
    scientificName: 'Solanum lycopersicum',
    category: 'Cây ăn quả',
  },
  currentHealthStatus: 'CRITICAL',
  plantedAt: '2026-10-01',
  ageDays: 42,
  schedulesSummary: {
    activeCount: 2,
    dueTodayCount: 1,
    overdueCount: 1,
  },
  careLogsSummary30d: {
    unlinkedCompletedLogs: 4,
    unlinkedSkippedLogs: 1,
    linkedScheduledCompletedLogs: 6,
    linkedScheduledSkippedLogs: 2,
  },
  recentActivityTimeline: [
    {
      id: 'jrn-101',
      sourceType: 'GROWTH_JOURNAL',
      title: 'Nhật ký: Sâu bệnh',
      taskType: null,
      status: null,
      entryType: 'PEST',
      healthStatus: 'NEEDS_ATTENTION',
      notePreview: 'Phát hiện lá vàng nhẹ ở tầng dưới.',
      occurredAt: '2026-11-12T03:30:00Z',
    },
    {
      id: 'cl-102',
      sourceType: 'CARE_LOG_LINKED',
      title: 'Chăm sóc: Tưới nước',
      taskType: 'WATERING',
      status: 'COMPLETED',
      entryType: null,
      healthStatus: null,
      notePreview: 'Tưới đều buổi sáng theo lịch.',
      occurredAt: '2026-11-12T01:00:00Z',
    },
    {
      id: 'cl-103',
      sourceType: 'CARE_LOG_UNLINKED',
      title: 'Chăm sóc: Bón phân',
      taskType: 'FERTILIZING',
      status: 'SKIPPED',
      entryType: null,
      healthStatus: null,
      notePreview: 'Bỏ qua do đất còn ẩm sau mưa.',
      occurredAt: '2026-11-11T16:45:00Z',
    },
  ],
  recentJournalObservations: [
    {
      journalId: 'jrn-101',
      recordedAt: '2026-11-12T03:30:00Z',
      entryType: 'PEST',
      healthStatus: 'NEEDS_ATTENTION',
      notePreview: 'Phát hiện lá vàng nhẹ ở tầng dưới.',
    },
  ],
  speciesCareGuide: {
    lightRequirement: 'Ánh nắng trực tiếp 6 giờ/ngày',
    waterRequirement: 'Tưới giữ ẩm đều quanh gốc',
    wateringFrequency: null,
    temperatureRange: '20-30 độ C',
    humidityRange: null,
    soilPh: '   ',
    usageAndCaution: 'Tránh úng rễ kéo dài.',
  },
  sensorConnected: false,
  generatedAt: '2026-11-12T04:20:00Z',
};

const emptyPlantDetail: PlantMonitoringDetailDto = {
  plantId: 'plt-empty',
  displayName: 'Cây Mới Trồng',
  garden: {
    id: 'grd-empty',
    name: 'Vườn Sân Thượng',
  },
  species: null,
  currentHealthStatus: 'HEALTHY',
  plantedAt: null,
  ageDays: null,
  schedulesSummary: {
    activeCount: 0,
    dueTodayCount: 0,
    overdueCount: 0,
  },
  careLogsSummary30d: {
    unlinkedCompletedLogs: 0,
    unlinkedSkippedLogs: 0,
    linkedScheduledCompletedLogs: 0,
    linkedScheduledSkippedLogs: 0,
  },
  recentActivityTimeline: [],
  recentJournalObservations: [],
  speciesCareGuide: {
    lightRequirement: null,
    waterRequirement: null,
    wateringFrequency: null,
    temperatureRange: null,
    humidityRange: null,
    soilPh: null,
    usageAndCaution: null,
  },
  sensorConnected: false,
  generatedAt: '2026-11-12T04:20:00Z',
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

describe('G5.5.1 Monitoring Overview & Plant Monitoring MVP (Mocked Axios HTTP Adapter)', () => {
  let qc: QueryClient;
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let originalAdapter: typeof apiClient.defaults.adapter;

  beforeEach(async () => {
    originalAdapter = apiClient.defaults.adapter;
    qc = createTestQueryClient();
    container = document.createElement('div');
    document.body.appendChild(container);
    mockRouter.push.mockReset();
    mockRouter.replace.mockReset();
    mockRouter.back.mockReset();
    routeParamsState.current = {};
    await tokenStorage._resetWebMemorySession();
  });

  afterEach(async () => {
    apiClient.defaults.adapter = originalAdapter;
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    qc.clear();
    await tokenStorage._resetWebMemorySession();
  });

  function mountWithProviders(ui: React.ReactElement) {
    root = createRoot(container!);
    act(() => {
      root?.render(
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <PlantDataProvider>{ui}</PlantDataProvider>
          </AuthProvider>
        </QueryClientProvider>
      );
    });
  }

  describe('1. API Normalization, Validation & Query Keys', () => {
    it('validates blank plantId with AppApiError VALIDATION_ERROR on field plantId', async () => {
      expect(() => assertValidMonitoringPlantId('   ')).toThrow(AppApiError);
      try {
        assertValidMonitoringPlantId('  ');
      } catch (err) {
        const apiErr = err as AppApiError;
        expect(apiErr.code).toBe('VALIDATION_ERROR');
        expect(apiErr.statusCode).toBe(400);
        expect(apiErr.field).toBe('plantId');
      }
    });

    it('fetches and normalizes monitoring overview and plant detail endpoints cleanly', async () => {
      await tokenStorage.saveSession(sessionA);
      const adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/monitoring/overview' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: sampleOverviewA },
            headers: {},
            config,
          };
        }
        if (config.url === '/monitoring/plants/plt-att-1' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: samplePlantDetailA },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });
      apiClient.defaults.adapter = adapter;

      const overview = await getMonitoringOverview({ expectedUserId: mockUserA.id });
      const detail = await getPlantMonitoringDetail('  plt-att-1 ', {
        expectedUserId: mockUserA.id,
      });

      expect(overview.gardensCount).toBe(2);
      expect(overview.healthDistribution.criticalCount).toBe(1);
      expect(overview.sensorConnected).toBe(false);
      expect(detail.plantId).toBe('plt-att-1');
      expect(detail.ageDays).toBe(42);
      expect(detail.speciesCareGuide.soilPh).toBeNull();
      expect(adapter).toHaveBeenCalledTimes(2);
    });

    it('scopes queryKeys.monitoring strictly by userId and disables hooks when unauthenticated', async () => {
      expect(queryKeys.monitoring.overview(mockUserA.id)).not.toEqual(
        queryKeys.monitoring.overview(mockUserB.id)
      );
      expect(queryKeys.monitoring.plantDetail(mockUserA.id, 'plt-1')).toEqual([
        'monitoring',
        mockUserA.id,
        'plants',
        'plt-1',
      ]);

      const adapter = vi.fn();
      apiClient.defaults.adapter = adapter;

      let overviewHook!: ReturnType<typeof useMonitoringOverview>;
      let detailHook!: ReturnType<typeof usePlantMonitoringDetail>;
      function Probe() {
        overviewHook = useMonitoringOverview();
        detailHook = usePlantMonitoringDetail('plt-1');
        return null;
      }

      mountWithProviders(<Probe />);
      await flushAsync(40);

      expect(overviewHook.fetchStatus).toBe('idle');
      expect(detailHook.fetchStatus).toBe('idle');
      expect(adapter).not.toHaveBeenCalled();
    });
  });

  describe('2. MonitoringScreen Overview UI & Navigation', () => {
    it('renders loading, populated overview metrics/charts/provenance/no-mock text, and routes cleanly', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingOverview = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/monitoring/overview' && config.method === 'get') {
          await pendingOverview.promise;
          return {
            status: 200,
            data: { success: true, data: sampleOverviewA },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      mountWithProviders(<MonitoringScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Đang tải dữ liệu tổng quan theo dõi...');
      });

      await act(async () => {
        pendingOverview.resolve();
        await flushAsync(30);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Cà chua ban công A');
      });

      const text = container!.textContent ?? '';
      expect(text).toContain('2 khu vườn • 5 cây trồng • 2 việc hôm nay');
      expect(text).toContain(MONITORING_SENSOR_DISCONNECTED_TEXT);
      expect(text).toContain(MONITORING_PROFILE_HEALTH_LABEL);
      expect(text).toContain(MONITORING_DEFAULT_HEALTHY_NOTE);
      expect(text).toContain(MONITORING_CARE_LOG_PROVENANCE_NOTE);
      expect(text).toContain('Ban công hướng Đông');
      expect(text).toContain('3 cây trồng • 1 cây cần chú ý');
      expect(text).toContain('Không/chưa gắn lịch • Hoàn thành (7d)');
      expect(text).toContain('Theo lịch hiện còn • Bỏ qua (30d)');

      // Strictly forbid fabricated mock metrics and misleading field names
      for (const forbidden of [
        '72%',
        '5h',
        '28°C',
        '98%',
        'Tỉ lệ khỏe mạnh',
        'Chỉ số sinh thái',
        'manualCompletedLogs',
        'manualSkippedLogs',
        'Care Adherence',
        'CARE_LOG_MANUAL',
        'CARE_LOG_SCHEDULED',
      ]) {
        expect(text).not.toContain(forbidden);
      }

      const svg = container!.querySelector('svg[data-testid="mock-svg"]');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('aria-label')).toContain('2 khỏe mạnh, 1 cần chú ý, 1 nguy cấp, 1 chưa đánh giá');
      expect(container!.querySelectorAll('svg rect').length).toBe(4);

      const attentionBtn = container!.querySelector(
        '[aria-label="Xem chi tiết theo dõi Cà chua ban công A"]'
      );
      clickElement(attentionBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/monitoring/detail',
        params: { plantId: 'plt-att-1' },
      });
      const pushArg = mockRouter.push.mock.calls[0]?.[0] as {
        pathname: string;
        params: Record<string, string>;
      };
      expect(Object.keys(pushArg.params)).toEqual(['plantId']);

      const gardenBtn = container!.querySelector('[aria-label="Mở khu vườn Ban công hướng Đông"]');
      clickElement(gardenBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/garden-detail',
        params: { gardenId: 'grd-mon-1' },
      });
    });

    it('renders empty state when user has zero gardens and zero plants, plus retry recovery on error', async () => {
      await tokenStorage.saveSession(sessionA);
      let shouldFail = true;

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/monitoring/overview' && config.method === 'get') {
          if (shouldFail) {
            return {
              status: 500,
              data: { success: false, message: 'Hệ thống bận' },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: { success: true, data: emptyOverview },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      mountWithProviders(<MonitoringScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không thể tải tổng quan theo dõi');
      });

      shouldFail = false;
      clickElement(container!.querySelector('[aria-label="Thử lại tải tổng quan theo dõi"]'));

      await waitFor(() => {
        expect(container!.textContent).toContain('Chưa có khu vườn để theo dõi');
      });
      expect(container!.textContent).toContain(MONITORING_SENSOR_DISCONNECTED_TEXT);
      expect(container!.textContent).not.toContain('72%');

      clickElement(container!.querySelector('[aria-label="Tạo khu vườn"]'));
      expect(mockRouter.push).toHaveBeenCalledWith('/garden/create');

      clickElement(container!.querySelector('[aria-label="Thêm cây"]'));
      expect(mockRouter.push).toHaveBeenCalledWith('/garden/add-plant');
    });
  });

  describe('3. MonitoringDetailScreen States, Provenance & Error Matrix', () => {
    it('shows clear error state without mocks when plantId param is missing', async () => {
      await tokenStorage.saveSession(sessionA);
      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      routeParamsState.current = {};
      mountWithProviders(<MonitoringDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không xác định được cây trồng');
      });
      expect(container!.textContent).toContain('Thiếu mã cây trồng (plantId)');
      expect(container!.textContent).not.toContain('Cà chua bi');
      expect(container!.textContent).not.toContain('72%');
    });

    it('renders full plant monitoring detail, VN timeline, provenance notes, null-safe care guide, and quick actions', async () => {
      await tokenStorage.saveSession(sessionA);
      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/monitoring/plants/plt-att-1' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: samplePlantDetailA },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      routeParamsState.current = { plantId: 'plt-att-1' };
      mountWithProviders(<MonitoringDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cà chua ban công A');
      });

      const text = container!.textContent ?? '';
      expect(text).toContain('Solanum lycopersicum');
      expect(text).toContain('42 ngày');
      expect(text).toContain('2026-10-01');
      expect(text).toContain(MONITORING_PROFILE_HEALTH_LABEL);
      expect(text).toContain(MONITORING_DEFAULT_HEALTHY_NOTE);
      expect(text).toContain(MONITORING_JOURNAL_HEALTH_NOTE);
      expect(text).toContain(MONITORING_CARE_LOG_PROVENANCE_NOTE);
      expect(text).toContain(MONITORING_SENSOR_DISCONNECTED_TEXT);
      expect(text).toContain(MONITORING_SPECIES_GUIDE_TITLE);

      // 3 activity source labels & Vietnam timestamps
      expect(text).toContain('Không/chưa gắn lịch');
      expect(text).toContain('Theo lịch hiện còn');
      expect(text).toContain('Nhật ký phát triển');
      expect(text).toContain(formatIsoDateTimeVn('2026-11-12T03:30:00Z'));
      expect(text).toContain(formatIsoDateTimeVn('2026-11-12T01:00:00Z'));
      expect(text).toContain('Phát hiện lá vàng nhẹ ở tầng dưới.');

      // Non-null speciesCareGuide fields shown; null/blank fields hidden
      expect(text).toContain('Nhu cầu ánh sáng');
      expect(text).toContain('Ánh nắng trực tiếp 6 giờ/ngày');
      expect(text).toContain('Tránh úng rễ kéo dài.');
      expect(text).not.toContain('Tần suất tưới tham khảo');
      expect(text).not.toContain('Khoảng độ ẩm tham khảo');
      expect(text).not.toContain('Độ pH đất tham khảo');

      // SVG 30d breakdown bar
      expect(container!.querySelectorAll('svg rect').length).toBe(4);

      clickElement(container!.querySelector('[aria-label="Mở hồ sơ cây"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/plant-detail',
        params: { plantId: 'plt-att-1' },
      });

      clickElement(container!.querySelector('[aria-label="Mở khu vườn"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/garden-detail',
        params: { gardenId: 'grd-mon-1' },
      });

      clickElement(container!.querySelector('[aria-label="Ghi nhận tiến triển"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/journal/new',
        params: { plantId: 'plt-att-1' },
      });
    });

    it('renders clean empty detail fallbacks and handles 403 / 404 / 500 retry states', async () => {
      await tokenStorage.saveSession(sessionA);
      let mode: '403' | '404' | '500' | 'empty' = '403';

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/monitoring/plants/plt-empty' && config.method === 'get') {
          if (mode === '403') {
            return { status: 403, data: { success: false, message: 'Forbidden' }, headers: {}, config };
          }
          if (mode === '404') {
            return { status: 404, data: { success: false, message: 'Không tìm thấy' }, headers: {}, config };
          }
          if (mode === '500') {
            return { status: 500, data: { success: false, message: 'Lỗi máy chủ' }, headers: {}, config };
          }
          return {
            status: 200,
            data: { success: true, data: emptyPlantDetail },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      routeParamsState.current = { plantId: 'plt-empty' };
      mountWithProviders(<MonitoringDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không có quyền truy cập cây trồng');
      });
      expect(container!.querySelector('[aria-label="Thử lại tải chi tiết theo dõi"]')).toBeNull();

      mode = '404';
      await act(async () => {
        await qc.invalidateQueries({ queryKey: queryKeys.monitoring.all(mockUserA.id) });
        await flushAsync(30);
      });
      await waitFor(() => {
        expect(container!.textContent).toContain('Không tìm thấy cây trồng');
      });

      mode = '500';
      await act(async () => {
        await qc.invalidateQueries({ queryKey: queryKeys.monitoring.all(mockUserA.id) });
        await flushAsync(30);
      });
      await waitFor(() => {
        expect(container!.textContent).toContain('Không thể tải chi tiết theo dõi');
      });

      mode = 'empty';
      clickElement(container!.querySelector('[aria-label="Thử lại tải chi tiết theo dõi"]'));
      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Mới Trồng');
      });
      expect(container!.textContent).toContain('Chưa xác định');
      expect(container!.textContent).toContain('Chưa ghi nhận');
      expect(container!.textContent).toContain('Chưa có lượt chăm sóc nào được ghi nhận trong 30 ngày qua.');
      expect(container!.textContent).toContain('Chưa có hướng dẫn chăm sóc tham khảo cho loài cây này.');
    });
  });

  describe('4. Account Isolation (Session A -> B) & Mutation Invalidations', () => {
    it('prevents pending Session A monitoring overview & detail responses from polluting Session B UI or cache', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingOverviewA = createDeferred<void>();
      const pendingDetailA = createDeferred<void>();

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
        if (config.url === '/monitoring/overview' && config.method === 'get') {
          if (!isB) {
            await pendingOverviewA.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  ...sampleOverviewA,
                  attentionPlants: [
                    {
                      ...sampleOverviewA.attentionPlants[0],
                      displayName: 'BÍ MẬT VƯỜN CỦA A',
                    },
                  ],
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
                ...sampleOverviewA,
                gardensCount: 1,
                plantsCount: 1,
                attentionPlants: [
                  {
                    ...sampleOverviewA.attentionPlants[0],
                    plantId: 'plt-b-1',
                    displayName: 'Cây Sạch Của B',
                    gardenId: 'grd-b-1',
                    gardenName: 'Vườn Sạch B',
                  },
                ],
                gardensSummary: [
                  { gardenId: 'grd-b-1', name: 'Vườn Sạch B', plantCount: 1, attentionCount: 1 },
                ],
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/monitoring/plants/plt-shared' && config.method === 'get') {
          if (!isB) {
            await pendingDetailA.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  ...samplePlantDetailA,
                  plantId: 'plt-shared',
                  displayName: 'CHI TIẾT BÍ MẬT CỦA A',
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
                ...samplePlantDetailA,
                plantId: 'plt-shared',
                displayName: 'Chi Tiết Riêng Của B',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      function Harness() {
        authCtx = useAuth();
        return (
          <>
            <MonitoringScreen />
            <MonitoringDetailScreen />
          </>
        );
      }

      routeParamsState.current = { plantId: 'plt-shared' };
      mountWithProviders(<Harness />);

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
      });

      // Switch immediately to B while both User A monitoring queries are in-flight
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'pw' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Cây Sạch Của B');
        expect(container!.textContent).toContain('Chi Tiết Riêng Của B');
      });

      // Resolve slow A promises -> must never taint B UI or B query cache
      await act(async () => {
        pendingOverviewA.resolve();
        pendingDetailA.resolve();
        await flushAsync(40);
      });

      expect(container!.textContent).not.toContain('BÍ MẬT VƯỜN CỦA A');
      expect(container!.textContent).not.toContain('CHI TIẾT BÍ MẬT CỦA A');
      expect(
        qc.getQueryData<MonitoringOverviewDto>(queryKeys.monitoring.overview(mockUserB.id))
          ?.attentionPlants[0]?.displayName
      ).toBe('Cây Sạch Của B');
      expect(
        qc.getQueryData<PlantMonitoringDetailDto>(
          queryKeys.monitoring.plantDetail(mockUserB.id, 'plt-shared')
        )?.displayName
      ).toBe('Chi Tiết Riêng Của B');
    });

    it('clears User A UI immediately with zero placeholderData leak when Session B monitoring queries are still pending', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingOverviewB = createDeferred<void>();
      const pendingDetailB = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const auth = String(config.headers?.Authorization ?? '');
        const isB = auth === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/monitoring/overview' && config.method === 'get') {
          if (isB) {
            await pendingOverviewB.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  ...sampleOverviewA,
                  attentionPlants: [
                    { ...sampleOverviewA.attentionPlants[0], displayName: 'Cây Mới Của B' },
                  ],
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
                ...sampleOverviewA,
                attentionPlants: [
                  { ...sampleOverviewA.attentionPlants[0], displayName: 'CÂY CŨ CỦA A' },
                ],
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/monitoring/plants/plt-shared' && config.method === 'get') {
          if (isB) {
            await pendingDetailB.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: { ...samplePlantDetailA, plantId: 'plt-shared', displayName: 'Chi Tiết B Mới' },
              },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: { ...samplePlantDetailA, plantId: 'plt-shared', displayName: 'CHI TIẾT CŨ CỦA A' },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      function Harness() {
        authCtx = useAuth();
        return (
          <>
            <MonitoringScreen />
            <MonitoringDetailScreen />
          </>
        );
      }

      routeParamsState.current = { plantId: 'plt-shared' };
      mountWithProviders(<Harness />);

      await waitFor(() => {
        expect(container!.textContent).toContain('CÂY CŨ CỦA A');
        expect(container!.textContent).toContain('CHI TIẾT CŨ CỦA A');
      });

      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'pw' });
        await flushAsync(20);
      });

      // While User B queries are STILL PENDING, User A text must NEVER appear as placeholderData
      expect(authCtx.user?.id).toBe(mockUserB.id);
      expect(container!.textContent).not.toContain('CÂY CŨ CỦA A');
      expect(container!.textContent).not.toContain('CHI TIẾT CŨ CỦA A');
      expect(container!.textContent).toContain('Đang tải dữ liệu tổng quan theo dõi...');

      await act(async () => {
        pendingOverviewB.resolve();
        pendingDetailB.resolve();
        await flushAsync(30);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Mới Của B');
        expect(container!.textContent).toContain('Chi Tiết B Mới');
      });
    });

    it('invalidates monitoring caches on Garden, Plant, Schedule, CareLog, and Journal mutations and removes deleted plant details', async () => {
      await tokenStorage.saveSession(sessionA);
      let overviewFetchCount = 0;

      const sampleGardenDetail: GardenDetailDto = {
        id: 'grd-m1',
        name: 'Vườn Test',
        location: 'Sân thượng',
        spaceType: 'SAN_THUONG',
        description: null,
        coverImageUrl: null,
        plants: [
          {
            id: 'plt-m1',
            displayName: 'Cây Test',
            speciesName: 'Húng quế',
            scientificName: 'Ocimum',
            category: 'Rau',
            healthStatus: 'HEALTHY',
            imageUrl: null,
          },
        ],
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      };
      const sampleGardenSummary: GardenSummaryDto = {
        id: 'grd-m1',
        name: 'Vườn Test',
        location: 'Sân thượng',
        spaceType: 'SAN_THUONG',
        coverImageUrl: null,
        plantCount: 1,
        createdAt: '2026-11-01T00:00:00Z',
      };
      const samplePlantDetail: UserPlantDetailDto = {
        id: 'plt-m1',
        displayName: 'Cây Test',
        location: null,
        plantedAt: null,
        note: null,
        healthStatus: 'HEALTHY',
        plantCode: null,
        imageUrl: null,
        species: null,
        garden: { id: 'grd-m1', name: 'Vườn Test' },
        createdAt: '2026-11-01T00:00:00Z',
      };
      const sampleSchedule: CareScheduleDto = {
        id: 'sch-m1',
        userPlantId: 'plt-m1',
        plantName: 'Cây Test',
        taskType: 'WATERING',
        taskLabel: null,
        frequency: 'DAILY',
        intervalDays: 1,
        reminderTime: '07:00',
        startDate: '2026-11-01',
        endDate: null,
        nextScheduledAt: '2026-11-12T00:00:00Z',
        isOverdue: false,
        status: 'ACTIVE',
      };
      const sampleCareLog: CareLogDto = {
        id: 'cl-m1',
        userPlantId: 'plt-m1',
        taskType: 'WATERING',
        status: 'COMPLETED',
        note: 'OK',
        imageUrls: [],
        performedAt: '2026-11-12T01:00:00Z',
        createdAt: '2026-11-12T01:00:00Z',
      };
      const sampleJournal: GrowthJournalDto = {
        id: 'jrn-m1',
        userPlantId: 'plt-m1',
        entryType: 'GROWTH',
        healthStatus: 'HEALTHY',
        note: 'Ra lá non',
        imageUrls: [],
        recordedAt: '2026-11-12T02:00:00Z',
        createdAt: '2026-11-12T02:00:00Z',
      };

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/monitoring/overview' && config.method === 'get') {
          overviewFetchCount += 1;
          return { status: 200, data: { success: true, data: sampleOverviewA }, headers: {}, config };
        }
        if (config.url?.startsWith('/monitoring/plants/') && config.method === 'get') {
          const requestedId = config.url.split('/').pop() ?? '';
          return {
            status: 200,
            data: { success: true, data: { ...samplePlantDetailA, plantId: requestedId } },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens' && config.method === 'post') {
          return { status: 201, data: { success: true, data: sampleGardenDetail }, headers: {}, config };
        }
        if (config.url === '/gardens' && config.method === 'get') {
          return { status: 200, data: { success: true, data: [sampleGardenSummary] }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-m1' && (config.method === 'put' || config.method === 'delete')) {
          return {
            status: 200,
            data: { success: true, data: config.method === 'put' ? sampleGardenDetail : null },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-m1/plants' && config.method === 'post') {
          return { status: 201, data: { success: true, data: samplePlantDetail }, headers: {}, config };
        }
        if (config.url === '/plants' && config.method === 'get') {
          return { status: 200, data: { success: true, data: emptyPage<UserPlantSummaryDto>() }, headers: {}, config };
        }
        if (config.url === '/plants/plt-m1' && (config.method === 'put' || config.method === 'delete')) {
          return {
            status: 200,
            data: { success: true, data: config.method === 'put' ? samplePlantDetail : null },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules' && config.method === 'post') {
          return { status: 201, data: { success: true, data: sampleSchedule }, headers: {}, config };
        }
        if (config.url === '/schedules/sch-m1' && (config.method === 'put' || config.method === 'delete')) {
          return {
            status: 200,
            data: { success: true, data: config.method === 'put' ? sampleSchedule : null },
            headers: {},
            config,
          };
        }
        if (config.url === '/schedules/sch-m1/complete' || config.url === '/schedules/sch-m1/skip') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                careLogId: 'cl-sch-m1',
                scheduleStatus: 'ACTIVE',
                nextScheduledAt: '2026-11-13T00:00:00Z',
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/care-logs' && config.method === 'post') {
          return { status: 201, data: { success: true, data: sampleCareLog }, headers: {}, config };
        }
        if (config.url === '/journals' && config.method === 'post') {
          return { status: 201, data: { success: true, data: sampleJournal }, headers: {}, config };
        }
        if (config.url === '/journals/jrn-m1' && (config.method === 'put' || config.method === 'delete')) {
          return {
            status: 200,
            data: { success: true, data: config.method === 'put' ? sampleJournal : null },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let m!: {
        createGarden: ReturnType<typeof useCreateGardenMutation>;
        updateGarden: ReturnType<typeof useUpdateGardenMutation>;
        deleteGarden: ReturnType<typeof useDeleteGardenMutation>;
        createPlant: ReturnType<typeof useCreatePlantMutation>;
        updatePlant: ReturnType<typeof useUpdatePlantMutation>;
        deletePlant: ReturnType<typeof useDeletePlantMutation>;
        createSchedule: ReturnType<typeof useCreateScheduleMutation>;
        updateSchedule: ReturnType<typeof useUpdateScheduleMutation>;
        deleteSchedule: ReturnType<typeof useDeleteScheduleMutation>;
        completeSchedule: ReturnType<typeof useCompleteScheduleMutation>;
        skipSchedule: ReturnType<typeof useSkipScheduleMutation>;
        createCareLog: ReturnType<typeof useCreateCareLogMutation>;
        createJournal: ReturnType<typeof useCreateJournalMutation>;
        updateJournal: ReturnType<typeof useUpdateJournalMutation>;
        deleteJournal: ReturnType<typeof useDeleteJournalMutation>;
      };

      function Probe() {
        useMonitoringOverview();
        m = {
          createGarden: useCreateGardenMutation(),
          updateGarden: useUpdateGardenMutation(),
          deleteGarden: useDeleteGardenMutation(),
          createPlant: useCreatePlantMutation(),
          updatePlant: useUpdatePlantMutation(),
          deletePlant: useDeletePlantMutation(),
          createSchedule: useCreateScheduleMutation(),
          updateSchedule: useUpdateScheduleMutation(),
          deleteSchedule: useDeleteScheduleMutation(),
          completeSchedule: useCompleteScheduleMutation(),
          skipSchedule: useSkipScheduleMutation(),
          createCareLog: useCreateCareLogMutation(),
          createJournal: useCreateJournalMutation(),
          updateJournal: useUpdateJournalMutation(),
          deleteJournal: useDeleteJournalMutation(),
        };
        return null;
      }

      mountWithProviders(<Probe />);

      await waitFor(() => {
        expect(overviewFetchCount).toBe(1);
      });

      const expectOverviewRefetch = async (runMutation: () => Promise<unknown>) => {
        const before = overviewFetchCount;
        await act(async () => {
          await runMutation();
          await flushAsync(20);
        });
        await waitFor(() => {
          expect(overviewFetchCount).toBeGreaterThan(before);
        });
      };

      await expectOverviewRefetch(() =>
        m.createGarden.mutateAsync({ name: 'Vườn Test', location: 'Sân thượng', spaceType: 'SAN_THUONG' })
      );
      await expectOverviewRefetch(() =>
        m.updateGarden.mutateAsync({ gardenId: 'grd-m1', data: { name: 'Vườn Mới' } })
      );
      await expectOverviewRefetch(() =>
        m.createPlant.mutateAsync({
          gardenId: 'grd-m1',
          request: { displayName: 'Cây Test', speciesId: 'sp-1' },
        })
      );
      await expectOverviewRefetch(() =>
        m.updatePlant.mutateAsync({ plantId: 'plt-m1', data: { healthStatus: 'NEEDS_ATTENTION' } })
      );
      await expectOverviewRefetch(() =>
        m.createSchedule.mutateAsync({
          userPlantId: 'plt-m1',
          taskType: 'WATERING',
          frequency: 'DAILY',
          reminderTime: '07:00',
          startDate: getTodayVnDateString(),
        })
      );
      await expectOverviewRefetch(() =>
        m.updateSchedule.mutateAsync({
          scheduleId: 'sch-m1',
          plantId: 'plt-m1',
          data: { reminderTime: '08:00' },
        })
      );
      await expectOverviewRefetch(() =>
        m.completeSchedule.mutateAsync({ scheduleId: 'sch-m1', plantId: 'plt-m1' })
      );
      await expectOverviewRefetch(() =>
        m.skipSchedule.mutateAsync({ scheduleId: 'sch-m1', plantId: 'plt-m1' })
      );
      await expectOverviewRefetch(() =>
        m.deleteSchedule.mutateAsync({ scheduleId: 'sch-m1', plantId: 'plt-m1' })
      );
      await expectOverviewRefetch(() =>
        m.createCareLog.mutateAsync({
          userPlantId: 'plt-m1',
          taskType: 'WATERING',
        })
      );
      await expectOverviewRefetch(() =>
        m.createJournal.mutateAsync({
          userPlantId: 'plt-m1',
          entryType: 'GROWTH',
          healthStatus: 'HEALTHY',
          note: 'Ra lá non mới',
        })
      );
      await expectOverviewRefetch(() =>
        m.updateJournal.mutateAsync({
          journalId: 'jrn-m1',
          plantId: 'plt-m1',
          data: { healthStatus: 'CRITICAL' },
        })
      );
      await expectOverviewRefetch(() =>
        m.deleteJournal.mutateAsync({ journalId: 'jrn-m1', plantId: 'plt-m1' })
      );

      // Seed cached monitoring detail for plt-m1 and verify deletePlant clears it cleanly
      qc.setQueryData(queryKeys.monitoring.plantDetail(mockUserA.id, 'plt-m1'), {
        ...samplePlantDetailA,
        plantId: 'plt-m1',
      });
      await expectOverviewRefetch(() => m.deletePlant.mutateAsync('plt-m1'));
      expect(
        qc.getQueryData(queryKeys.monitoring.plantDetail(mockUserA.id, 'plt-m1'))
      ).toBeUndefined();

      // Seed cached monitoring detail whose garden matches grd-m1 and verify deleteGarden clears it
      qc.setQueryData(queryKeys.monitoring.plantDetail(mockUserA.id, 'plt-in-garden'), {
        ...samplePlantDetailA,
        plantId: 'plt-in-garden',
        garden: { id: 'grd-m1', name: 'Vườn Test' },
      });
      await expectOverviewRefetch(() => m.deleteGarden.mutateAsync('grd-m1'));
      expect(
        qc.getQueryData(queryKeys.monitoring.plantDetail(mockUserA.id, 'plt-in-garden'))
      ).toBeUndefined();
    });
  });
});
