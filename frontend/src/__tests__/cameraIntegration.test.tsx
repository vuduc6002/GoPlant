import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { CameraManagementSection } from '@/features/cameras/CameraManagementSection';
import {
  buildCreateCameraPayload,
  buildUpdateCameraPayload,
  createGardenCamera,
  deleteCamera,
  getGardenCameras,
  updateCamera,
} from '@/features/cameras/cameraApi';
import {
  useCreateCameraMutation,
  useDeleteCameraMutation,
  useGardenCameras,
  useUpdateCameraMutation,
} from '@/features/cameras/cameraHooks';
import {
  CAMERA_MANUAL_STATUS_DISCLAIMER,
  CAMERA_MONITORING_CTA_SUBTITLE,
  CAMERA_MONITORING_CTA_TITLE,
  CAMERA_SECURITY_HELPER_NOTE,
  CAMERA_STATUS_OPTIONS,
  getCameraStatusMeta,
  type CameraDto,
} from '@/features/cameras/cameraTypes';
import {
  assertValidCameraGardenId,
  assertValidCameraId,
  validateCameraConnectionNote,
  validateCameraName,
  validateCameraStatus,
} from '@/features/cameras/cameraValidation';
import { GardenDetailScreen } from '@/features/gardens/GardenScreens';
import { useDeleteGardenMutation } from '@/features/gardens/gardenHooks';
import type { GardenDetailDto, GardenSummaryDto } from '@/features/gardens/gardenTypes';
import { MonitoringScreen } from '@/features/main/MainScreens';
import type { MonitoringOverviewDto } from '@/features/monitoring/monitoringTypes';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
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
  id: 'usr_cam_a',
  fullName: 'Nguyễn Minh An',
  email: 'an.cam@goplant.vn',
  roles: ['ROLE_USER'],
};

const mockUserB = {
  id: 'usr_cam_b',
  fullName: 'Trần Hoàng Bình',
  email: 'binh.cam@goplant.vn',
  roles: ['ROLE_USER'],
};

const sessionA: AuthSession = {
  accessToken: 'jwt-cam-token-a',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUserA,
  savedAt: Date.now(),
};

const sessionB: AuthSession = {
  accessToken: 'jwt-cam-token-b',
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

const sampleGardenDetail: GardenDetailDto = {
  id: 'grd-cam-1',
  name: 'Ban công nắng sáng',
  location: 'Tầng 4, Căn hộ A2',
  spaceType: 'BAN_CONG',
  description: 'Khu vườn có trồng rau và hoa.',
  coverImageUrl: null,
  plants: [
    {
      id: 'plt-cam-1',
      displayName: 'Trầu bà phòng khách',
      speciesName: 'Trầu bà vàng',
      scientificName: 'Epipremnum aureum',
      category: 'Cây cảnh',
      healthStatus: 'HEALTHY',
      imageUrl: null,
    },
  ],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const sampleCamera1: CameraDto = {
  id: 'cam-1',
  gardenId: 'grd-cam-1',
  name: 'Camera Ban Công Đông',
  locationDesc: 'Góc tường phía Đông',
  status: 'OFFLINE',
  connectionNote: 'Đã kiểm tra nguồn điện và cáp mạng',
  createdAt: '2026-11-10T02:00:00Z',
  updatedAt: '2026-11-10T02:00:00Z',
};

const sampleCamera2: CameraDto = {
  id: 'cam-2',
  gardenId: 'grd-cam-1',
  name: 'Camera Góc Chậu Cà Chua',
  locationDesc: null,
  status: 'ONLINE',
  connectionNote: null,
  createdAt: '2026-11-11T03:00:00Z',
  updatedAt: '2026-11-11T04:00:00Z',
};

const sampleOverview: MonitoringOverviewDto = {
  gardensCount: 1,
  plantsCount: 1,
  healthDistribution: {
    healthyCount: 1,
    needsAttentionCount: 0,
    criticalCount: 0,
    unknownCount: 0,
  },
  schedulesSummary: {
    activeCount: 1,
    dueTodayCount: 1,
    overdueCount: 0,
  },
  careLogsSummary7d: {
    unlinkedCompletedLogs: 1,
    unlinkedSkippedLogs: 0,
    linkedScheduledCompletedLogs: 0,
    linkedScheduledSkippedLogs: 0,
  },
  careLogsSummary30d: {
    unlinkedCompletedLogs: 2,
    unlinkedSkippedLogs: 0,
    linkedScheduledCompletedLogs: 1,
    linkedScheduledSkippedLogs: 0,
  },
  attentionPlants: [],
  gardensSummary: [
    {
      gardenId: 'grd-cam-1',
      name: 'Ban công nắng sáng',
      plantCount: 1,
      attentionCount: 0,
    },
  ],
  sensorConnected: false,
  generatedAt: '2026-11-12T06:00:00Z',
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

function findButtonByLabel(container: HTMLElement, ariaLabel: string) {
  return container.querySelector(`[role="button"][aria-label="${ariaLabel}"]`);
}

function emptyPage<T>(): PageResponse<T> {
  return {
    content: [],
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
    last: true,
  };
}

describe('G5.5.2a Camera Metadata CRUD Integration', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    routeParamsState.current = {};
    tokenStorage._resetWebMemorySession();
    qc = createTestQueryClient();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
    tokenStorage._resetWebMemorySession();
    qc.clear();
    apiClient.defaults.adapter = originalAdapter;
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

  describe('Camera Types, Validation & API Layer', () => {
    it('maps CameraStatus enum values to truthful Vietnamese labels without false probing claims', () => {
      expect(CAMERA_STATUS_OPTIONS.map((opt) => opt.value)).toEqual(['ONLINE', 'OFFLINE', 'ERROR']);
      expect(getCameraStatusMeta('ONLINE')).toEqual({
        label: 'Đã ghi nhận Online',
        tone: 'mint',
      });
      expect(getCameraStatusMeta('OFFLINE')).toEqual({
        label: 'Đã ghi nhận Offline',
        tone: 'plain',
      });
      expect(getCameraStatusMeta('ERROR')).toEqual({
        label: 'Đã ghi nhận lỗi',
        tone: 'danger',
      });
      expect(getCameraStatusMeta('UNKNOWN').label).toBe('Đã ghi nhận Offline');
    });

    it('validates IDs, camera name, status, and rejects credential patterns in connectionNote without echoing secrets', () => {
      expect(() => assertValidCameraGardenId('   ')).toThrowError(AppApiError);
      try {
        assertValidCameraGardenId('');
      } catch (err) {
        expect(err).toMatchObject({ code: 'VALIDATION_ERROR', field: 'gardenId', statusCode: 400 });
      }

      expect(() => assertValidCameraId('   ')).toThrowError(AppApiError);
      try {
        assertValidCameraId('');
      } catch (err) {
        expect(err).toMatchObject({ code: 'VALIDATION_ERROR', field: 'cameraId', statusCode: 400 });
      }

      expect(validateCameraName('  Camera Ban Công  ')).toBe('Camera Ban Công');
      expect(() => validateCameraName('   ')).toThrowError(AppApiError);
      expect(() => validateCameraName('A'.repeat(201))).toThrowError(AppApiError);

      expect(validateCameraStatus('ONLINE')).toBe('ONLINE');
      expect(() => validateCameraStatus('PAUSED')).toThrowError(AppApiError);

      const forbiddenNotes = [
        'rtsp://admin:supersecret99@192.168.1.10:554/stream1',
        'rtsps://camuser:topsecret99@10.0.0.5/live',
        'http://camadmin:pass999@192.168.0.2/video',
        'camadmin:barepass88@192.168.1.9:554',
        'password=my-secret-pw',
        'Password: my-secret-pw',
        'passwd=secret_val',
        'pwd: secret_val',
        'token=my_api_token_123',
        'secret=my_client_secret',
        'apiKey=live_key_999',
        'api_key: live_key_999',
        'username=camadmin',
        'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      ];

      for (const dangerous of forbiddenNotes) {
        let caught: AppApiError | null = null;
        try {
          validateCameraConnectionNote(dangerous);
        } catch (err) {
          caught = err as AppApiError;
        }
        expect(caught).toBeInstanceOf(AppApiError);
        expect(caught?.code).toBe('VALIDATION_ERROR');
        expect(caught?.field).toBe('connectionNote');
        expect(caught?.message).toBe(
          'Ghi chú kết nối không được chứa mật khẩu, token hoặc thông tin đăng nhập.'
        );
        expect(caught?.message).not.toContain('supersecret99');
        expect(caught?.message).not.toContain('my-secret-pw');
        expect(caught?.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      }

      const safeNotes = [
        '',
        '   ',
        'Đã kiểm tra nguồn điện và cáp mạng',
        'Token camera chưa cần thiết',
        'Không chứa password hay token ở đây',
        'Đầu nối nguồn gần công tắc mật khẩu cửa',
        'Góc quan sát hướng Đông, không ngược sáng',
      ];
      for (const safe of safeNotes) {
        expect(() => validateCameraConnectionNote(safe)).not.toThrow();
      }
      expect(validateCameraConnectionNote('  Cáp nguồn dài 3m  ')).toBe('Cáp nguồn dài 3m');
    });

    it('builds create/update payloads without privileged fields and executes all 4 CRUD camera API calls', async () => {
      expect(
        buildCreateCameraPayload({
          name: '  Camera Tầng 3  ',
          locationDesc: '   ',
          connectionNote: '  Gắn trên mái che  ',
        })
      ).toEqual({
        name: 'Camera Tầng 3',
        connectionNote: 'Gắn trên mái che',
      });

      expect(
        buildUpdateCameraPayload({
          status: 'ERROR',
          locationDesc: '   ',
          connectionNote: '   ',
        })
      ).toEqual({
        status: 'ERROR',
        locationDesc: '',
        connectionNote: '',
      });

      await tokenStorage.saveSession(sessionA);
      const calls: { method?: string; url?: string; data?: unknown; auth?: unknown }[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        calls.push({
          method: config.method,
          url: config.url,
          data: config.data ? JSON.parse(String(config.data)) : undefined,
          auth: config.headers?.Authorization,
        });
        if (config.url === '/gardens/grd%201/cameras' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: [sampleCamera1] },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-cam-1/cameras' && config.method === 'post') {
          return {
            status: 201,
            data: { success: true, data: sampleCamera1 },
            headers: {},
            config,
          };
        }
        if (config.url === '/cameras/cam-1' && config.method === 'put') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                ...sampleCamera1,
                status: 'ONLINE',
                locationDesc: null,
                connectionNote: null,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/cameras/cam-1' && config.method === 'delete') {
          return {
            status: 200,
            data: { success: true, data: { message: 'Camera đã được xóa.' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      const list = await getGardenCameras('grd 1');
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Camera Ban Công Đông');

      const created = await createGardenCamera('grd-cam-1', {
        name: 'Camera Ban Công Đông',
        locationDesc: 'Góc tường phía Đông',
        connectionNote: 'Đã kiểm tra nguồn điện và cáp mạng',
      });
      expect(created.status).toBe('OFFLINE');

      const updated = await updateCamera('cam-1', {
        status: 'ONLINE',
        locationDesc: '   ',
        connectionNote: '   ',
      });
      expect(updated.status).toBe('ONLINE');
      expect(updated.locationDesc).toBeNull();
      expect(updated.connectionNote).toBeNull();

      const deleted = await deleteCamera('cam-1');
      expect(deleted.message).toBe('Camera đã được xóa.');

      expect(calls).toEqual([
        {
          method: 'get',
          url: '/gardens/grd%201/cameras',
          data: undefined,
          auth: `Bearer ${sessionA.accessToken}`,
        },
        {
          method: 'post',
          url: '/gardens/grd-cam-1/cameras',
          data: {
            name: 'Camera Ban Công Đông',
            locationDesc: 'Góc tường phía Đông',
            connectionNote: 'Đã kiểm tra nguồn điện và cáp mạng',
          },
          auth: `Bearer ${sessionA.accessToken}`,
        },
        {
          method: 'put',
          url: '/cameras/cam-1',
          data: {
            status: 'ONLINE',
            locationDesc: '',
            connectionNote: '',
          },
          auth: `Bearer ${sessionA.accessToken}`,
        },
        {
          method: 'delete',
          url: '/cameras/cam-1',
          data: undefined,
          auth: `Bearer ${sessionA.accessToken}`,
        },
      ]);
    });

    it('rejects invalid response shape and normalizes 403/404 API errors', async () => {
      await tokenStorage.saveSession(sessionA);

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/gardens/grd-bad/cameras') {
          return { status: 200, data: { success: true, data: { unexpected: true } }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-403/cameras') {
          throw {
            isAxiosError: true,
            response: {
              status: 403,
              data: {
                success: false,
                error: { code: 'FORBIDDEN', message: 'Bạn không có quyền xem camera của khu vườn này.' },
              },
            },
            config,
          };
        }
        throw {
          isAxiosError: true,
          response: {
            status: 404,
            data: {
              success: false,
              error: { code: 'RESOURCE_NOT_FOUND', message: 'Không tìm thấy camera.' },
            },
          },
          config,
        };
      });

      await expect(getGardenCameras('grd-bad')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      await expect(getGardenCameras('grd-403')).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
      await expect(deleteCamera('cam-missing')).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('Hooks & Garden Delete Cache Cleanup', () => {
    it('scopes queryKeys.cameras by userId, blocks unauthenticated fetches, and cleans up camera cache when deleting a garden', async () => {
      expect(queryKeys.cameras.all(mockUserA.id)).toEqual(['cameras', mockUserA.id]);
      expect(queryKeys.cameras.gardenList(mockUserA.id, 'grd-1')).toEqual([
        'cameras',
        mockUserA.id,
        'garden',
        'grd-1',
      ]);

      // Unauthenticated: useGardenCameras stays disabled (0 network calls)
      const unauthCalls: string[] = [];
      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        unauthCalls.push(String(config.url));
        return { status: 200, data: { success: true, data: [] }, headers: {}, config };
      });

      let queryState!: ReturnType<typeof useGardenCameras>;
      function UnauthHarness() {
        queryState = useGardenCameras('grd-cam-1');
        return null;
      }
      mountWithProviders(<UnauthHarness />);
      await flushAsync(40);
      expect(unauthCalls).toEqual([]);
      expect(queryState.data).toBeUndefined();

      // Remount cleanly for authenticated session bootstrap
      act(() => {
        root?.unmount();
      });
      qc.clear();
      root = createRoot(container!);

      // Authenticated: populate cameras cache, then delete garden and verify camera cache is removed & not refetched
      await tokenStorage.saveSession(sessionA);
      let cameraGetCount = 0;

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-cam-1/cameras' && config.method === 'get') {
          cameraGetCount += 1;
          return { status: 200, data: { success: true, data: [sampleCamera1] }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-cam-1' && config.method === 'delete') {
          return {
            status: 200,
            data: { success: true, data: { message: 'Đã xóa khu vườn.' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let deleteGardenMut!: ReturnType<typeof useDeleteGardenMutation>;
      let authCtx!: ReturnType<typeof useAuth>;
      let disableCamerasOnDelete!: (deleted: boolean) => void;
      function AuthHarness() {
        authCtx = useAuth();
        const [camerasEnabled, setCamerasEnabled] = React.useState(true);
        disableCamerasOnDelete = (deleted: boolean) => setCamerasEnabled(!deleted);
        useGardenCameras('grd-cam-1', { enabled: camerasEnabled });
        deleteGardenMut = useDeleteGardenMutation();
        return null;
      }
      mountWithProviders(<AuthHarness />);

      await waitFor(() => {
        expect(authCtx.status).toBe('authenticated');
        expect(qc.getQueryData<CameraDto[]>(queryKeys.cameras.gardenList(mockUserA.id, 'grd-cam-1'))).toHaveLength(1);
      });
      const initialFetchCount = cameraGetCount;
      expect(initialFetchCount).toBeGreaterThanOrEqual(1);

      await act(async () => {
        disableCamerasOnDelete(true);
        await deleteGardenMut.mutateAsync('grd-cam-1');
        await flushAsync(40);
      });

      expect(
        qc.getQueryData(queryKeys.cameras.gardenList(mockUserA.id, 'grd-cam-1'))
      ).toBeUndefined();
      // Removing garden camera cache while disabling deleted-garden observer must NOT trigger a 404 refetch of /gardens/grd-cam-1/cameras
      expect(cameraGetCount).toBe(initialFetchCount);
    });
  });

  describe('GardenDetailScreen & CameraManagementSection UI Integration', () => {
    it('renders camera list inline inside GardenDetailScreen alongside garden plants without stream/RTSP/credential UI', async () => {
      await tokenStorage.saveSession(sessionA);
      routeParamsState.current = { gardenId: 'grd-cam-1' };

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-cam-1' && config.method === 'get') {
          return { status: 200, data: { success: true, data: sampleGardenDetail }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-cam-1/cameras' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: [sampleCamera1, sampleCamera2] },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      mountWithProviders(<GardenDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Ban công nắng sáng');
        expect(container!.textContent).toContain('Trầu bà phòng khách');
        expect(container!.textContent).toContain('Camera giám sát (2)');
        expect(container!.textContent).toContain('Camera Ban Công Đông');
        expect(container!.textContent).toContain('Đã ghi nhận Offline');
        expect(container!.textContent).toContain('Camera Góc Chậu Cà Chua');
        expect(container!.textContent).toContain('Đã ghi nhận Online');
      });

      expect(container!.textContent).toContain(CAMERA_MANUAL_STATUS_DISCLAIMER);
      expect(container!.textContent).not.toContain('Xem video trực tiếp');
      expect(container!.textContent).not.toContain('Stream URL');
      expect(container!.querySelector('video')).toBeNull();
      expect(container!.querySelector('input[type="password"]')).toBeNull();
    });

    it('creates, edits, clears optional fields, handles server field errors, and confirms delete without removing garden/plants', async () => {
      await tokenStorage.saveSession(sessionA);
      routeParamsState.current = { gardenId: 'grd-cam-1' };
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});

      let camerasStore: CameraDto[] = [];
      let postCalls = 0;
      let deleteCalls = 0;
      let failNextPut = true;

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-cam-1' && config.method === 'get') {
          return { status: 200, data: { success: true, data: sampleGardenDetail }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-cam-1/cameras' && config.method === 'get') {
          return { status: 200, data: { success: true, data: camerasStore }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-cam-1/cameras' && config.method === 'post') {
          postCalls += 1;
          const body = JSON.parse(String(config.data)) as Record<string, unknown>;
          expect(body).not.toHaveProperty('status');
          const created: CameraDto = {
            id: 'cam-created-1',
            gardenId: 'grd-cam-1',
            name: String(body.name),
            locationDesc: typeof body.locationDesc === 'string' && body.locationDesc ? body.locationDesc : null,
            status: 'OFFLINE',
            connectionNote:
              typeof body.connectionNote === 'string' && body.connectionNote ? body.connectionNote : null,
            createdAt: '2026-11-12T05:00:00Z',
            updatedAt: '2026-11-12T05:00:00Z',
          };
          camerasStore = [...camerasStore, created];
          return { status: 201, data: { success: true, data: created }, headers: {}, config };
        }
        if (config.url === '/cameras/cam-created-1' && config.method === 'put') {
          const body = JSON.parse(String(config.data)) as Record<string, unknown>;
          if (failNextPut) {
            failNextPut = false;
            throw {
              isAxiosError: true,
              response: {
                status: 400,
                data: {
                  success: false,
                  error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Ghi chú kết nối không được chứa mật khẩu, token hoặc thông tin đăng nhập.',
                    field: 'connectionNote',
                  },
                },
              },
              config,
            };
          }
          const updated: CameraDto = {
            ...camerasStore[0],
            name: String(body.name ?? camerasStore[0].name),
            locationDesc:
              body.locationDesc !== undefined
                ? String(body.locationDesc).trim() || null
                : camerasStore[0].locationDesc,
            status: (body.status as CameraDto['status']) ?? camerasStore[0].status,
            connectionNote:
              body.connectionNote !== undefined
                ? String(body.connectionNote).trim() || null
                : camerasStore[0].connectionNote,
            updatedAt: '2026-11-12T05:30:00Z',
          };
          camerasStore = [updated];
          return { status: 200, data: { success: true, data: updated }, headers: {}, config };
        }
        if (config.url === '/cameras/cam-created-1' && config.method === 'delete') {
          deleteCalls += 1;
          camerasStore = [];
          return {
            status: 200,
            data: { success: true, data: { message: 'Camera đã được xóa.' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      mountWithProviders(<GardenDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Khu vườn này chưa có camera giám sát nào.');
      });

      // Open Add form: verify status selector NOT shown in Add mode, helper note IS shown
      clickElement(findButtonByLabel(container!, 'Thêm camera'));
      expect(container!.textContent).toContain('Thêm camera mới');
      expect(container!.textContent).toContain(CAMERA_SECURITY_HELPER_NOTE);
      expect(container!.textContent).toContain('Camera mới tạo luôn bắt đầu ở trạng thái Offline (OFFLINE).');
      expect(findButtonByLabel(container!, 'Trạng thái Đã ghi nhận Online')).toBeNull();

      // Test local credential validation blocks unsafe note BEFORE calling API
      changeInputValue(container!.querySelector('[aria-label="Tên camera"]'), '  Camera Sân Thượng  ');
      changeInputValue(
        container!.querySelector('[aria-label="Ghi chú kết nối camera"]'),
        'rtsp://admin:SuperSecret999@192.168.1.55:554/stream'
      );
      clickElement(findButtonByLabel(container!, 'Lưu camera mới'));

      expect(postCalls).toBe(0);
      expect(container!.textContent).toContain(
        'Ghi chú kết nối không được chứa mật khẩu, token hoặc thông tin đăng nhập.'
      );
      const leakedErrorText = Array.from(container!.querySelectorAll('div, span, p')).some(
        (el) =>
          !el.querySelector('textarea, input') &&
          el.textContent?.includes('không được chứa mật khẩu') &&
          el.textContent?.includes('SuperSecret999')
      );
      expect(leakedErrorText).toBe(false);

      // Enter valid metadata and submit POST
      changeInputValue(
        container!.querySelector('[aria-label="Vị trí lắp đặt camera"]'),
        'Góc tường hướng Tây Nam'
      );
      changeInputValue(
        container!.querySelector('[aria-label="Ghi chú kết nối camera"]'),
        'Đã kiểm tra nguồn điện và cáp mạng'
      );
      clickElement(findButtonByLabel(container!, 'Lưu camera mới'));

      await waitFor(() => {
        expect(postCalls).toBe(1);
        expect(container!.textContent).toContain('Camera giám sát (1)');
        expect(container!.textContent).toContain('Camera Sân Thượng');
        expect(container!.textContent).toContain('Đã ghi nhận Offline');
        expect(container!.textContent).toContain('Góc tường hướng Tây Nam');
      });

      // Open Edit form -> test server 400 validation banner without losing form, then update status & clear optional fields
      clickElement(findButtonByLabel(container!, 'Chỉnh sửa camera Camera Sân Thượng'));
      expect(container!.textContent).toContain('Chỉnh sửa camera');
      clickElement(findButtonByLabel(container!, 'Trạng thái Đã ghi nhận Online'));

      // First PUT intentionally returns server 400
      clickElement(findButtonByLabel(container!, 'Lưu thay đổi camera'));
      await waitFor(() => {
        expect(container!.textContent).toContain(
          'Ghi chú kết nối không được chứa mật khẩu, token hoặc thông tin đăng nhập.'
        );
      });

      // Clear optional fields and switch status to ERROR -> second PUT succeeds
      changeInputValue(container!.querySelector('[aria-label="Vị trí lắp đặt camera"]'), '   ');
      changeInputValue(container!.querySelector('[aria-label="Ghi chú kết nối camera"]'), '');
      clickElement(findButtonByLabel(container!, 'Trạng thái Đã ghi nhận lỗi'));
      clickElement(findButtonByLabel(container!, 'Lưu thay đổi camera'));

      await waitFor(() => {
        expect(container!.textContent).toContain('Đã ghi nhận lỗi');
        expect(container!.textContent).toContain('Vị trí: Chưa ghi vị trí cụ thể');
        expect(container!.textContent).toContain('Ghi chú kết nối: Không có ghi chú kết nối');
      });

      // Delete flow requires Alert confirmation; Cancel keeps camera
      clickElement(findButtonByLabel(container!, 'Xóa camera Camera Sân Thượng'));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(deleteCalls).toBe(0);

      const alertButtons = alertSpy.mock.calls[0][2] ?? [];
      const confirmBtn = alertButtons.find((btn) => btn.text === 'Xóa camera');
      expect(confirmBtn).toBeDefined();
      await act(async () => {
        confirmBtn?.onPress?.();
        await flushAsync(30);
      });

      await waitFor(() => {
        expect(deleteCalls).toBe(1);
        expect(container!.textContent).toContain('Khu vườn này chưa có camera giám sát nào.');
        // Garden and existing plants MUST remain intact
        expect(container!.textContent).toContain('Ban công nắng sáng');
        expect(container!.textContent).toContain('Trầu bà phòng khách');
      });
    });

    it('recovers from 500 error via Retry and hides Retry on 403 Forbidden', async () => {
      await tokenStorage.saveSession(sessionA);
      let mode: '500' | '200' | '403' = '500';

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-cam-1/cameras' && config.method === 'get') {
          if (mode === '500') {
            throw {
              isAxiosError: true,
              response: {
                status: 500,
                data: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ.' } },
              },
              config,
            };
          }
          if (mode === '403') {
            throw {
              isAxiosError: true,
              response: {
                status: 403,
                data: {
                  success: false,
                  error: { code: 'FORBIDDEN', message: 'Không có quyền truy cập camera.' },
                },
              },
              config,
            };
          }
          return { status: 200, data: { success: true, data: [sampleCamera1] }, headers: {}, config };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      mountWithProviders(<CameraManagementSection gardenId="grd-cam-1" />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không thể tải danh sách camera');
        expect(findButtonByLabel(container!, 'Thử lại tải danh sách camera')).toBeTruthy();
      });

      mode = '200';
      clickElement(findButtonByLabel(container!, 'Thử lại tải danh sách camera'));

      await waitFor(() => {
        expect(container!.textContent).toContain('Camera Ban Công Đông');
      });

      // Remount for 403 matrix (useGardenCameras does not retry 403 and hides retry button)
      act(() => {
        root?.unmount();
      });
      qc.clear();
      root = createRoot(container!);
      mode = '403';
      mountWithProviders(<CameraManagementSection gardenId="grd-cam-1" />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không có quyền truy cập camera.');
        expect(findButtonByLabel(container!, 'Thử lại tải danh sách camera')).toBeNull();
      });
    });
  });

  describe('MonitoringOverviewContent Static Camera CTA', () => {
    it('renders Camera CTA navigating to /gardens without calling any /cameras API or showing fake camera counts', async () => {
      await tokenStorage.saveSession(sessionA);
      const requestedUrls: string[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        requestedUrls.push(String(config.url));
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/monitoring/overview' && config.method === 'get') {
          return { status: 200, data: { success: true, data: sampleOverview }, headers: {}, config };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      mountWithProviders(<MonitoringScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain(CAMERA_MONITORING_CTA_TITLE);
        expect(container!.textContent).toContain(CAMERA_MONITORING_CTA_SUBTITLE);
      });

      expect(requestedUrls.some((url) => url.includes('camera'))).toBe(false);
      expect(container!.textContent).not.toContain('Camera Online');

      const ctaBtn = findButtonByLabel(container!, 'Mở danh sách khu vườn để quản lý camera');
      clickElement(ctaBtn);
      expect(mockRouter.push).toHaveBeenCalledWith('/gardens');
    });
  });

  describe('Account Isolation (Session A -> Session B)', () => {
    it('isolates pending camera queries and mutations when switching Session A -> Session B and avoids placeholderData flash', async () => {
      await tokenStorage.saveSession(sessionA);

      const pendingGetA = createDeferred<void>();
      const pendingPostA = createDeferred<void>();
      const pendingPutA = createDeferred<void>();
      const pendingDeleteA = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const auth = String(config.headers?.Authorization ?? '');
        const isB = auth === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-shared/cameras' && config.method === 'get') {
          if (!isB) {
            await pendingGetA.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: [{ ...sampleCamera1, id: 'cam-a-secret', gardenId: 'grd-shared', name: 'CAMERA BÍ MẬT CỦA A' }],
              },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: [{ ...sampleCamera2, id: 'cam-b-clean', gardenId: 'grd-shared', name: 'Camera Riêng Của B' }],
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-shared/cameras' && config.method === 'post') {
          await pendingPostA.promise;
          return {
            status: 201,
            data: {
              success: true,
              data: { ...sampleCamera1, id: 'cam-a-post', gardenId: 'grd-shared', name: 'POST BÍ MẬT A' },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/cameras/cam-a-1' && config.method === 'put') {
          await pendingPutA.promise;
          return {
            status: 200,
            data: {
              success: true,
              data: { ...sampleCamera1, id: 'cam-a-1', gardenId: 'grd-shared', name: 'PUT BÍ MẬT A' },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/cameras/cam-b-clean' && config.method === 'delete') {
          await pendingDeleteA.promise;
          return {
            status: 200,
            data: { success: true, data: { message: 'Deleted A' } },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens' && config.method === 'get') {
          return { status: 200, data: { success: true, data: [] as GardenSummaryDto[] }, headers: {}, config };
        }
        if (config.url === '/plants' && config.method === 'get') {
          return { status: 200, data: { success: true, data: emptyPage() }, headers: {}, config };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let createMut!: ReturnType<typeof useCreateCameraMutation>;
      let updateMut!: ReturnType<typeof useUpdateCameraMutation>;
      let deleteMut!: ReturnType<typeof useDeleteCameraMutation>;

      function Harness() {
        authCtx = useAuth();
        createMut = useCreateCameraMutation();
        updateMut = useUpdateCameraMutation();
        deleteMut = useDeleteCameraMutation();
        return <CameraManagementSection gardenId="grd-shared" />;
      }

      mountWithProviders(<Harness />);

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
      });

      // Fire Session A mutations while Session A GET is also still in-flight
      const postPromiseA = createMut.mutateAsync({
        gardenId: 'grd-shared',
        request: { name: 'POST A' },
      });
      const putPromiseA = updateMut.mutateAsync({
        cameraId: 'cam-a-1',
        gardenId: 'grd-shared',
        data: { name: 'PUT A' },
      });
      const deletePromiseA = deleteMut.mutateAsync({
        cameraId: 'cam-b-clean',
        gardenId: 'grd-shared',
      });
      await flushAsync(10);

      // Switch immediately to Session B
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'pw' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Camera Riêng Của B');
      });

      // Resolve all slow Session A network operations after Session B is active
      await act(async () => {
        pendingGetA.resolve();
        pendingPostA.resolve();
        pendingPutA.resolve();
        pendingDeleteA.resolve();
        await Promise.allSettled([postPromiseA, putPromiseA, deletePromiseA]);
        await flushAsync(40);
      });

      expect(container!.textContent).toContain('Camera Riêng Của B');
      expect(container!.textContent).not.toContain('CAMERA BÍ MẬT CỦA A');
      expect(container!.textContent).not.toContain('POST BÍ MẬT A');
      expect(container!.textContent).not.toContain('PUT BÍ MẬT A');

      const cachedB = qc.getQueryData<CameraDto[]>(
        queryKeys.cameras.gardenList(mockUserB.id, 'grd-shared')
      );
      expect(cachedB?.map((cam) => cam.id)).toEqual(['cam-b-clean']);
    });

    it('clears User A camera UI immediately with zero placeholderData leak while Session B camera query is still pending', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingGetB = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const auth = String(config.headers?.Authorization ?? '');
        const isB = auth === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/gardens/grd-shared/cameras' && config.method === 'get') {
          if (isB) {
            await pendingGetB.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: [{ ...sampleCamera2, id: 'cam-b-fresh', gardenId: 'grd-shared', name: 'Camera Mới Của B' }],
              },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: [{ ...sampleCamera1, id: 'cam-a-old', gardenId: 'grd-shared', name: 'CAMERA CŨ CỦA A' }],
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
        return <CameraManagementSection gardenId="grd-shared" />;
      }

      mountWithProviders(<Harness />);

      await waitFor(() => {
        expect(container!.textContent).toContain('CAMERA CŨ CỦA A');
      });

      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'pw' });
        await flushAsync(20);
      });

      expect(authCtx.user?.id).toBe(mockUserB.id);
      expect(container!.textContent).not.toContain('CAMERA CŨ CỦA A');
      expect(container!.textContent).toContain('Đang tải danh sách camera...');

      await act(async () => {
        pendingGetB.resolve();
        await flushAsync(30);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Camera Mới Của B');
      });
    });
  });
});
