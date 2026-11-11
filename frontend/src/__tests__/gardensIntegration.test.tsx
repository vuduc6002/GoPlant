import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import {
  AddGardenPlantScreen,
  CreateGardenScreen,
  GardenDetailScreen,
  GardensTabContent,
} from '@/features/gardens/GardenScreens';
import {
  createGarden,
  deleteGarden,
  getGardenDetail,
  getGardensList,
  updateGarden,
} from '@/features/gardens/gardenApi';
import {
  useCreateGardenMutation,
  useDeleteGardenMutation,
  useGardenDetail,
  useGardensList,
  useUpdateGardenMutation,
} from '@/features/gardens/gardenHooks';
import {
  getSpaceTypeLabel,
  type GardenDetailDto,
  type GardenSummaryDto,
} from '@/features/gardens/gardenTypes';
import { PlantDataProvider, usePlantData } from '@/features/plants/PlantDataStore';
import { HomeGardensSection } from '@/features/home/HomeScreen';
import { GardensScreen, PlantsScreen } from '@/features/main/MainScreens';
import { apiClient } from '@/services/api/apiClient';
import type { AuthSession, UserProfileDto } from '@/services/api/apiTypes';
import * as tokenStorage from '@/services/api/tokenStorage';
import { shouldRetry } from '@/services/query/queryClient';
import { queryKeys } from '@/services/query/queryKeys';

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

const mockUser = {
  id: 'usr_garden_1',
  fullName: 'Trần Gia Bảo',
  email: 'bao@goplant.vn',
  roles: ['ROLE_USER'],
};

const mockSession: AuthSession = {
  accessToken: 'jwt-garden-token-456',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUser,
  savedAt: Date.now(),
};

const mockProfile: UserProfileDto = {
  id: 'usr_garden_1',
  fullName: 'Trần Gia Bảo',
  email: 'bao@goplant.vn',
  phoneNumber: null,
  recoveryEmail: null,
  preferredDevice: 'MOBILE',
  status: 'ACTIVE',
  avatarUrl: null,
  roles: ['ROLE_USER'],
  createdAt: '2026-01-01T00:00:00Z',
};

const gardenSummaryBalcony: GardenSummaryDto = {
  id: 'grd-1',
  name: 'Ban công nắng sáng',
  location: 'Tầng 3, Căn hộ 302',
  spaceType: 'BAN_CONG',
  coverImageUrl: 'https://cdn.goplant.vn/balcony.jpg',
  plantCount: 1,
  createdAt: '2026-01-01T00:00:00Z',
};

const gardenSummaryIndoor: GardenSummaryDto = {
  id: 'grd-2',
  name: 'Góc bàn làm việc',
  location: 'Phòng khách',
  spaceType: 'TRONG_NHA',
  coverImageUrl: null,
  plantCount: 0,
  createdAt: '2026-01-02T00:00:00Z',
};

const gardenDetailOne: GardenDetailDto = {
  id: 'grd-1',
  name: 'Ban công nắng sáng',
  location: 'Tầng 3, Căn hộ 302',
  spaceType: 'BAN_CONG',
  description: 'Đón nắng nhẹ buổi sáng hướng Đông.',
  coverImageUrl: 'https://cdn.goplant.vn/balcony.jpg',
  plants: [
    {
      id: 'up-1',
      displayName: 'Trầu bà phòng khách',
      speciesName: 'Trầu bà lá xẻ',
      scientificName: 'Monstera deliciosa',
      category: 'Cây cảnh',
      healthStatus: 'HEALTHY',
      imageUrl: null,
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
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

describe('G5.3 Gardens REST API Integration', () => {
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

  describe('Gardens API Layer & Validation', () => {
    it('maps all 5 SpaceType enum keys to Vietnamese labels cleanly', () => {
      expect(getSpaceTypeLabel('BAN_CONG')).toBe('Ban công');
      expect(getSpaceTypeLabel('SAN_THUONG')).toBe('Sân thượng');
      expect(getSpaceTypeLabel('TRONG_NHA')).toBe('Trong nhà');
      expect(getSpaceTypeLabel('SAN_VUON')).toBe('Sân vườn');
      expect(getSpaceTypeLabel('KHAC')).toBe('Khác');
    });

    it('rejects blank name, >200 char name, blank location, and UI label spaceType before calling API', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);
      const adapter = vi.fn();
      apiClient.defaults.adapter = adapter;

      await expect(
        createGarden({ name: '   ', location: 'Tầng 2', spaceType: 'BAN_CONG' })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field: 'name' });

      await expect(
        createGarden({ name: 'A'.repeat(201), location: 'Tầng 2', spaceType: 'BAN_CONG' })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field: 'name' });

      await expect(
        createGarden({ name: 'Vườn mới', location: '   ', spaceType: 'BAN_CONG' })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field: 'location' });

      await expect(
        createGarden({
          name: 'Vườn mới',
          location: 'Tầng 2',
          spaceType: 'Ban công' as unknown as 'BAN_CONG',
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field: 'spaceType' });

      expect(adapter).not.toHaveBeenCalled();
    });

    it('performs full CRUD over apiClient with trimmed payloads, Bearer JWT, 403 & 409 normalization', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      const captured: { method?: string; url?: string; data?: unknown; auth?: unknown }[] = [];
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        captured.push({
          method: config.method?.toUpperCase(),
          url: config.url,
          data: config.data ? JSON.parse(String(config.data)) : undefined,
          auth: config.headers?.Authorization,
        });

        if (config.url === '/gardens' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [gardenSummaryBalcony, gardenSummaryIndoor] },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens' && config.method === 'post') {
          const payload = JSON.parse(String(config.data));
          if (payload.name === 'Trùng tên') {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 409,
                data: {
                  success: false,
                  error: {
                    code: 'CONFLICT',
                    message: 'Bạn đã có một khu vườn với tên này.',
                    field: 'name',
                  },
                },
              },
              config,
            });
          }
          return Promise.resolve({
            status: 201,
            data: { success: true, data: { ...gardenDetailOne, id: 'grd-new', ...payload, plants: [] } },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-forbidden') {
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 403,
              data: {
                success: false,
                error: { code: 'FORBIDDEN', message: 'Bạn không có quyền truy cập khu vườn này.' },
              },
            },
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: gardenDetailOne },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'put') {
          const payload = JSON.parse(String(config.data));
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { ...gardenDetailOne, ...payload } },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'delete') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { message: 'Khu vườn đã được xóa.' } },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected request: ${config.url}`);
      });

      const list = await getGardensList();
      expect(list).toHaveLength(2);

      const created = await createGarden({
        name: '  Sân vườn sau nhà  ',
        location: '  Tầng trệt ',
        spaceType: 'SAN_VUON',
        description: '  Thoáng mát  ',
      });
      expect(created.id).toBe('grd-new');

      const detail = await getGardenDetail('grd-1');
      expect(detail.plants[0].displayName).toBe('Trầu bà phòng khách');

      const updated = await updateGarden('grd-1', {
        name: '  Ban công mới  ',
        spaceType: 'SAN_THUONG',
      });
      expect(updated.spaceType).toBe('SAN_THUONG');

      const deleted = await deleteGarden('grd-1');
      expect(deleted.message).toBe('Khu vườn đã được xóa.');

      await expect(
        createGarden({ name: 'Trùng tên', location: 'X', spaceType: 'KHAC' })
      ).rejects.toMatchObject({ statusCode: 409, field: 'name' });

      await expect(getGardenDetail('grd-forbidden')).rejects.toMatchObject({
        statusCode: 403,
        isForbiddenError: true,
      });

      expect(captured[1]).toEqual({
        method: 'POST',
        url: '/gardens',
        data: {
          name: 'Sân vườn sau nhà',
          location: 'Tầng trệt',
          spaceType: 'SAN_VUON',
          description: 'Thoáng mát',
        },
        auth: 'Bearer jwt-garden-token-456',
      });
    });
  });

  describe('Auth Gating & React Query Cache Sync for Gardens', () => {
    it('does NOT query /gardens when unauthenticated', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(null);
      const adapter = vi.fn();
      apiClient.defaults.adapter = adapter;

      function Probe() {
        const auth = useAuth();
        useGardensList();
        useGardenDetail('grd-1');
        return <div data-auth={auth.status} />;
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
      await flushAsync(60);

      expect(adapter).not.toHaveBeenCalled();
    });

    it('updates cache on create/update and removes deleted detail + list item on delete without leaving stale detail', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      let serverGardens: GardenSummaryDto[] = [gardenSummaryBalcony];
      let deletedGrd1 = false;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/gardens' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: serverGardens },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens' && config.method === 'post') {
          const payload = JSON.parse(String(config.data));
          const createdDetail: GardenDetailDto = {
            id: 'grd-created',
            name: payload.name,
            location: payload.location,
            spaceType: payload.spaceType,
            description: payload.description ?? null,
            coverImageUrl: payload.coverImageUrl ?? null,
            plants: [],
            createdAt: '2026-01-05T00:00:00Z',
            updatedAt: '2026-01-05T00:00:00Z',
          };
          serverGardens = [
            ...serverGardens,
            {
              id: 'grd-created',
              name: payload.name,
              location: payload.location,
              spaceType: payload.spaceType,
              coverImageUrl: null,
              plantCount: 0,
              createdAt: '2026-01-05T00:00:00Z',
            },
          ];
          return Promise.resolve({
            status: 201,
            data: { success: true, data: createdDetail },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'get') {
          if (deletedGrd1) {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 404,
                data: {
                  success: false,
                  error: { code: 'RESOURCE_NOT_FOUND', message: 'Khu vườn không tồn tại.' },
                },
              },
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: { success: true, data: gardenDetailOne },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'put') {
          const payload = JSON.parse(String(config.data));
          serverGardens = serverGardens.map((g) =>
            g.id === 'grd-1' ? { ...g, ...payload } : g
          );
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { ...gardenDetailOne, ...payload } },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'delete') {
          deletedGrd1 = true;
          serverGardens = serverGardens.filter((g) => g.id !== 'grd-1');
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { message: 'Khu vườn đã được xóa.' } },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      let createMut!: ReturnType<typeof useCreateGardenMutation>;
      let updateMut!: ReturnType<typeof useUpdateGardenMutation>;
      let deleteMut!: ReturnType<typeof useDeleteGardenMutation>;

      function GardenHooksHarness() {
        useGardensList();
        useGardenDetail('grd-1');
        createMut = useCreateGardenMutation();
        updateMut = useUpdateGardenMutation();
        deleteMut = useDeleteGardenMutation();
        return null;
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <GardenHooksHarness />
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitFor(() => {
        expect(qc.getQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(mockUser.id))).toHaveLength(1);
        expect(qc.getQueryData<GardenDetailDto>(queryKeys.gardens.detail(mockUser.id, 'grd-1'))?.id).toBe(
          'grd-1'
        );
      });

      // Create updates list & sets created detail cache
      await act(async () => {
        await createMut.mutateAsync({
          name: 'Vườn mới tạo',
          location: 'Tầng thượng',
          spaceType: 'SAN_THUONG',
        });
      });
      await waitFor(() => {
        expect(
          qc.getQueryData<GardenDetailDto>(queryKeys.gardens.detail(mockUser.id, 'grd-created'))?.name
        ).toBe('Vườn mới tạo');
      });

      // Update syncs detail & list
      await act(async () => {
        await updateMut.mutateAsync({
          gardenId: 'grd-1',
          data: { name: 'Ban công đã sửa', spaceType: 'SAN_VUON' },
        });
      });
      await waitFor(() => {
        expect(qc.getQueryData<GardenDetailDto>(queryKeys.gardens.detail(mockUser.id, 'grd-1'))?.name).toBe(
          'Ban công đã sửa'
        );
      });

      // Delete removes grd-1 detail completely and strips it from list without stale cache resurrection
      await act(async () => {
        await deleteMut.mutateAsync('grd-1');
      });
      await waitFor(() => {
        expect(qc.getQueryData(queryKeys.gardens.detail(mockUser.id, 'grd-1'))).toBeUndefined();
        const remainingIds =
          qc.getQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(mockUser.id))?.map((g) => g.id) ?? [];
        expect(remainingIds).not.toContain('grd-1');
        expect(remainingIds).toContain('grd-created');
      });
    });
  });

  describe('UI Screen Integration: GardensTabContent, CreateGardenScreen, GardenDetailScreen & G5.4 Demo Preservation', () => {
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

    it('GardensTabContent loads gardens, filters by all 5 SpaceTypes, and handles empty/error/retry states', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      let mode: 'error' | 'list' | 'empty' = 'error';
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/gardens') {
          if (mode === 'error') {
            return Promise.reject({
              isAxiosError: true,
              message: 'Network Error',
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: mode === 'empty' ? [] : [gardenSummaryBalcony, gardenSummaryIndoor],
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      mountWithProviders(<GardensTabContent />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không thể tải danh sách khu vườn');
      });
      mode = 'list';

      const retryBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Thử lại'
      );
      clickElement(retryBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Ban công nắng sáng');
        expect(container!.textContent).toContain('1 cây đang trồng');
        expect(container!.textContent).toContain('Góc bàn làm việc');
        expect(container!.textContent).toContain('Trong nhà (1)');
      });

      // Filter by Sân thượng (0 gardens)
      const rooftopPill = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.startsWith('Sân thượng')
      );
      clickElement(rooftopPill);
      expect(container!.textContent).toContain('Không có khu vườn thuộc nhóm này');

      // Show all and navigate to garden-detail
      const allBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.startsWith('Tất cả (2)')
      );
      clickElement(allBtn);

      const manageBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Quản lý vườn')
      );
      clickElement(manageBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/garden-detail',
        params: { gardenId: 'grd-1' },
      });
    });

    it('CreateGardenScreen creates garden with SpaceType enum and renders 409 name conflict field error; Edit mode prefills and submits PUT', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      let fail409 = true;
      let postedBody: Record<string, unknown> | null = null;
      let putBody: Record<string, unknown> | null = null;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/gardens' && config.method === 'post') {
          postedBody = JSON.parse(String(config.data));
          if (fail409) {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 409,
                data: {
                  success: false,
                  error: {
                    code: 'CONFLICT',
                    message: 'Bạn đã có một khu vườn với tên này.',
                    field: 'name',
                  },
                },
              },
              config,
            });
          }
          return Promise.resolve({
            status: 201,
            data: {
              success: true,
              data: {
                ...gardenDetailOne,
                id: 'grd-created-ui',
                ...postedBody,
                plants: [],
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: gardenDetailOne },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'put') {
          putBody = JSON.parse(String(config.data));
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { ...gardenDetailOne, ...putBody } },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [gardenSummaryBalcony] },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      // Create Mode
      mountWithProviders(<CreateGardenScreen />);
      await waitFor(() => {
        expect(container!.querySelector('[aria-label="Tên khu vườn"]')).toBeTruthy();
      });

      changeInputValue(container!.querySelector('[aria-label="Tên khu vườn"]'), 'Khu vườn mới');
      changeInputValue(container!.querySelector('[aria-label="Vị trí khu vườn"]'), 'Sân thượng tầng 5');
      const spaceOption = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Sân vườn'
      );
      clickElement(spaceOption);

      const submitCreateBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Tạo khu vườn'
      );
      clickElement(submitCreateBtn);

      // Sends enum key SAN_VUON (NOT Vietnamese label) and surfaces backend 409 conflict
      await waitFor(() => {
        expect(postedBody).toMatchObject({
          name: 'Khu vườn mới',
          location: 'Sân thượng tầng 5',
          spaceType: 'SAN_VUON',
        });
        expect(container!.textContent).toContain('Bạn đã có một khu vườn với tên này.');
      });

      // Fix & succeed
      fail409 = false;
      clickElement(submitCreateBtn);
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith({
          pathname: '/garden-detail',
          params: { gardenId: 'grd-created-ui' },
        });
      });

      // Edit Mode prefills detail and calls PUT
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      vi.clearAllMocks();
      routeParamsState.current = { gardenId: 'grd-1' };
      mountWithProviders(<CreateGardenScreen />);

      await waitFor(() => {
        const inputEl = container!.querySelector('[aria-label="Tên khu vườn"]') as HTMLInputElement | null;
        expect(inputEl).toBeTruthy();
        expect(inputEl!.value).toBe('Ban công nắng sáng');
      });

      const nameInput = container!.querySelector('[aria-label="Tên khu vườn"]') as HTMLInputElement;
      changeInputValue(nameInput, 'Ban công hướng Nam');

      const saveBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Lưu thay đổi'
      );
      clickElement(saveBtn);

      await waitFor(() => {
        expect(putBody).toMatchObject({
          name: 'Ban công hướng Nam',
          location: 'Tầng 3, Căn hộ 302',
          spaceType: 'BAN_CONG',
        });
        expect(mockRouter.back).toHaveBeenCalled();
      });
    });

    it('GardenDetailScreen renders real plants without static 28°C/72% mocks, handles 403 error, and confirms cascade delete before DELETE API', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});

      let deletedCalled = false;
      let getDetailCalls = 0;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'get') {
          getDetailCalls += 1;
          return Promise.resolve({
            status: 200,
            data: { success: true, data: gardenDetailOne },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'delete') {
          deletedCalled = true;
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { message: 'Khu vườn đã được xóa.' } },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-403') {
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 403,
              data: {
                success: false,
                error: { code: 'FORBIDDEN', message: 'Bạn không có quyền truy cập khu vườn này.' },
              },
            },
            config,
          });
        }
        if (config.url === '/gardens') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [] },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      routeParamsState.current = { gardenId: 'grd-1' };
      mountWithProviders(<GardenDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Ban công nắng sáng');
        expect(container!.textContent).toContain('Trầu bà phòng khách');
        expect(container!.textContent).toContain('Cây đang trồng (1)');
      });
      // Must NOT contain hardcoded fake prototype data from before G5.3
      expect(container!.textContent).not.toContain('28°C');
      expect(container!.textContent).not.toContain('Cà Chua Cherry');

      const detailCallsBeforeDelete = getDetailCalls;

      const deleteBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Xóa khu vườn'
      );
      clickElement(deleteBtn);

      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [alertTitle, alertMsg, alertButtons] = alertSpy.mock.calls[0];
      expect(alertTitle).toBe('Xác nhận xóa khu vườn');
      expect(alertMsg).toContain('toàn bộ 1 cây đang trồng');
      expect(alertMsg).toContain('lịch chăm sóc');
      expect(alertMsg).toContain('nhật ký');

      // Delete has NOT run until user confirms
      expect(deletedCalled).toBe(false);

      const confirmBtn = alertButtons?.find((btn) => btn.text === 'Xóa khu vườn');
      await act(async () => {
        confirmBtn?.onPress?.();
      });

      await waitFor(() => {
        expect(deletedCalled).toBe(true);
        expect(mockRouter.replace).toHaveBeenCalledWith('/gardens');
        expect(qc.getQueryData(queryKeys.gardens.detail(mockUser.id, 'grd-1'))).toBeUndefined();
      });
      // Must NOT trigger an extra spurious GET /gardens/grd-1 refetch after delete removes cache
      expect(getDetailCalls).toBe(detailCallsBeforeDelete);

      // Verify 403 forbidden ownership UX
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      routeParamsState.current = { gardenId: 'grd-403' };
      mountWithProviders(<GardenDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không có quyền truy cập khu vườn');
      });
    });

    it('AddGardenPlantScreen uses real gardens, species & POST /gardens/{gardenId}/plants without using legacy PlantDataStore demo', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      let postedGardenId: string | undefined;
      let postedBody: Record<string, unknown> | undefined;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/gardens' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [gardenSummaryBalcony] },
            headers: {},
            config,
          });
        }
        if (config.url === '/species' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [
                  {
                    id: 'sp-1',
                    commonName: 'Trầu bà lá xẻ',
                    scientificName: 'Monstera deliciosa',
                    category: 'Cây cảnh',
                    difficulty: 'Dễ',
                    thumbnailUrl: null,
                    isFavorited: false,
                  },
                ],
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
        if (config.url === '/gardens/grd-1/plants' && config.method === 'post') {
          postedGardenId = 'grd-1';
          postedBody = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          return Promise.resolve({
            status: 201,
            data: {
              success: true,
              data: {
                id: 'plt-new-1',
                plantCode: null,
                displayName: 'Trầu bà lá xẻ',
                species: {
                  id: 'sp-1',
                  commonName: 'Trầu bà lá xẻ',
                  scientificName: 'Monstera deliciosa',
                  category: 'Cây cảnh',
                },
                garden: {
                  id: 'grd-1',
                  name: 'Ban công nắng sáng',
                },
                healthStatus: 'HEALTHY',
                location: 'Ban công',
                plantedAt: null,
                note: null,
                imageUrl: null,
                createdAt: '2026-02-01T00:00:00Z',
                updatedAt: '2026-02-01T00:00:00Z',
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      let ownedCount = 0;
      function OwnedObserver() {
        const { ownedPlants } = usePlantData();
        ownedCount = ownedPlants.length;
        return null;
      }

      mountWithProviders(
        <>
          <OwnedObserver />
          <AddGardenPlantScreen />
        </>
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Ban công nắng sáng');
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
      });

      clickElement(container!.querySelector('[aria-label="Chọn khu vườn Ban công nắng sáng"]'));
      clickElement(container!.querySelector('[aria-label="Chọn loài cây Trầu bà lá xẻ"]'));

      const pickLoc = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Ban công'
      );
      clickElement(pickLoc);

      const submitBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Thêm cây vào vườn'
      );
      clickElement(submitBtn);

      await waitFor(() => {
        expect(postedGardenId).toBe('grd-1');
        expect(postedBody).toEqual({
          speciesId: 'sp-1',
          displayName: 'Trầu bà lá xẻ',
          location: 'Ban công',
        });
        expect(ownedCount).toBe(0);
        expect(mockRouter.replace).toHaveBeenCalledWith({
          pathname: '/plant-detail',
          params: { plantId: 'plt-new-1' },
        });
      });
    });

    it('HomeScreen and MainScreens wire real gardens, favorites & user plants APIs', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/gardens') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [gardenSummaryBalcony] },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/favorites') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [
                  {
                    id: 'sp-fav-1',
                    commonName: 'Trầu bà đế vương',
                    scientificName: 'Philodendron Imperial',
                    category: 'Cây cảnh',
                    difficulty: 'Dễ',
                    thumbnailUrl: null,
                    isFavorited: true,
                  },
                ],
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
        if (config.url === '/plants') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [],
                page: 0,
                size: 20,
                totalElements: 0,
                totalPages: 0,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      // HomeGardensSection shows real garden summary from API and handles card click
      mountWithProviders(<HomeGardensSection />);
      await waitFor(() => {
        expect(container!.textContent).toContain('1 khu vực');
        expect(container!.textContent).toContain('Ban công nắng sáng');
        expect(container!.textContent).toContain('1 cây đang trồng');
      });

      const homeGardenCard = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Ban công nắng sáng')
      );
      clickElement(homeGardenCard);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/garden-detail',
        params: { gardenId: 'grd-1' },
      });

      // GardensScreen shows real garden tab
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      mountWithProviders(<GardensScreen />);
      await waitFor(() => {
        expect(container!.textContent).toContain('Đang quản lý 1 khu vườn');
        expect(container!.textContent).toContain('Ban công nắng sáng');
      });

      // PlantsScreen shows real FavoritesSection and real User Plants section
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      mountWithProviders(<PlantsScreen />);
      await waitFor(() => {
        expect(container!.textContent).toContain('1 loài yêu thích • 0 cây sở hữu • 1 khu vườn');
        expect(container!.textContent).toContain('Trầu bà đế vương');
        expect(container!.textContent).toContain('Cây đang sở hữu');
        expect(container!.textContent).toContain('Bạn chưa có cây trồng nào');
      });
      expect(container!.textContent).not.toContain('Demo G5.4');
    });
  });

  describe('G5.3.1 Account Switch Cache Isolation Regression (Section 5 - Gardens)', () => {
    const userA = {
      id: 'usr_garden_acc_a',
      fullName: 'Chủ vườn A',
      email: 'gardena@goplant.vn',
      roles: ['ROLE_USER'],
    };
    const userB = {
      id: 'usr_garden_acc_b',
      fullName: 'Chủ vườn B',
      email: 'gardenb@goplant.vn',
      roles: ['ROLE_USER'],
    };
    const sessionA: AuthSession = {
      accessToken: 'jwt-garden-user-a',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: userA,
      savedAt: Date.now(),
    };
    const sessionB: AuthSession = {
      accessToken: 'jwt-garden-user-b',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: userB,
      savedAt: Date.now(),
    };
    const profileA: UserProfileDto = { ...mockProfile, ...userA };
    const profileB: UserProfileDto = { ...mockProfile, ...userB };

    const gardenBList: GardenSummaryDto[] = [
      {
        id: 'grd-b-1',
        name: 'Vườn riêng của User B',
        location: 'Phòng khách B',
        spaceType: 'TRONG_NHA',
        coverImageUrl: null,
        plantCount: 2,
        createdAt: '2026-02-01T00:00:00Z',
      },
    ];

    function mountWithRealAuth(ui: React.ReactElement) {
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

    it('Section 5 Test 3: pending User A garden creation resolved after switching to User B does NOT leak User A garden into User B cache or UI', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingCreateA = createDeferred<unknown>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const authHeader = config.headers?.Authorization as string | undefined;
        const isB = authHeader === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login' && config.method === 'post') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/gardens' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: isB ? gardenBList : [gardenSummaryBalcony] },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens' && config.method === 'post') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          const payload = JSON.parse(String(config.data));
          await pendingCreateA.promise;
          return {
            status: 201,
            data: {
              success: true,
              data: {
                id: 'grd-a-created',
                name: payload.name,
                location: payload.location,
                spaceType: payload.spaceType,
                description: null,
                coverImageUrl: null,
                plants: [],
                createdAt: '2026-02-05T00:00:00Z',
                updatedAt: '2026-02-05T00:00:00Z',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let createMut!: ReturnType<typeof useCreateGardenMutation>;
      function Probe() {
        authCtx = useAuth();
        createMut = useCreateGardenMutation();
        return null;
      }

      mountWithRealAuth(
        <>
          <Probe />
          <GardensTabContent />
        </>
      );

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userA.id);
        expect(container!.textContent).toContain('Ban công nắng sáng');
      });

      // User A initiates garden creation (POST held pending)
      let pendingCreatePromise!: Promise<unknown>;
      act(() => {
        pendingCreatePromise = createMut
          .mutateAsync({
            name: 'Vườn bí mật của A',
            location: 'Sân thượng A',
            spaceType: 'SAN_THUONG',
          })
          .catch((err) => err);
      });
      await waitFor(() => expect(createMut.isPending).toBe(true));

      // Switch to User B while User A's POST is pending
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(container!.textContent).toContain('Vườn riêng của User B');
      });

      // Now resolve User A's stale POST
      await act(async () => {
        pendingCreateA.resolve(undefined);
        await pendingCreatePromise;
      });
      await flushAsync(40);

      // Verify User B cache and UI never contain User A's created garden
      const listB = qc.getQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(userB.id));
      expect(listB?.map((item) => item.id)).toEqual(['grd-b-1']);
      expect(qc.getQueryData(queryKeys.gardens.detail(userB.id, 'grd-a-created'))).toBeUndefined();
      expect(container!.textContent).toContain('Vườn riêng của User B');
      expect(container!.textContent).not.toContain('Vườn bí mật của A');
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('Section 5 Test 4: pending User A garden update & delete resolved after switching to User B never corrupt User B cache or trigger UI navigation/alerts', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingUpdateA = createDeferred<unknown>();
      const pendingDeleteA = createDeferred<unknown>();
      vi.spyOn(Alert, 'alert').mockImplementation(() => {});

      const gardenDetailForB: GardenDetailDto = {
        ...gardenDetailOne,
        id: 'grd-1',
        name: 'Vườn của User B (grd-1)',
        location: 'Phòng khách B',
        plants: [],
      };

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const authHeader = config.headers?.Authorization as string | undefined;
        const isB = authHeader === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login' && config.method === 'post') {
          const payload = JSON.parse(String(config.data)) as { account?: string };
          return {
            status: 200,
            data: { success: true, data: payload.account === userA.email ? sessionA : sessionB },
            headers: {},
            config,
          };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/gardens' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: isB ? [{ ...gardenSummaryBalcony, name: 'Vườn của User B (grd-1)' }] : [gardenSummaryBalcony],
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-1' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: isB ? gardenDetailForB : gardenDetailOne },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-1' && config.method === 'put') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          await pendingUpdateA.promise;
          return {
            status: 200,
            data: {
              success: true,
              data: { ...gardenDetailOne, name: 'Tên bị đổi bởi User A' },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-1' && config.method === 'delete') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          await pendingDeleteA.promise;
          return {
            status: 200,
            data: { success: true, data: { message: 'Deleted by User A' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let updateMut!: ReturnType<typeof useUpdateGardenMutation>;
      let deleteMut!: ReturnType<typeof useDeleteGardenMutation>;
      function Probe() {
        authCtx = useAuth();
        useGardensList();
        useGardenDetail('grd-1');
        updateMut = useUpdateGardenMutation();
        deleteMut = useDeleteGardenMutation();
        return null;
      }

      routeParamsState.current = { gardenId: 'grd-1' };
      mountWithRealAuth(
        <>
          <Probe />
          <GardenDetailScreen />
        </>
      );

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userA.id);
        expect(container!.textContent).toContain('Ban công nắng sáng');
      });

      // Start update for A, hold pending, switch to User B
      let pendingUpdatePromise!: Promise<unknown>;
      act(() => {
        pendingUpdatePromise = updateMut
          .mutateAsync({ gardenId: 'grd-1', data: { name: 'Tên bị đổi bởi User A' } })
          .catch((err) => err);
      });
      await waitFor(() => expect(updateMut.isPending).toBe(true));

      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(container!.textContent).toContain('Vườn của User B (grd-1)');
        expect(qc.getQueryData<GardenDetailDto>(queryKeys.gardens.detail(userB.id, 'grd-1'))?.name).toBe(
          'Vườn của User B (grd-1)'
        );
      });

      // Resolve A's stale PUT -> User B detail & list cache stay untouched!
      await act(async () => {
        pendingUpdateA.resolve(undefined);
        await pendingUpdatePromise;
      });
      await flushAsync(40);

      expect(qc.getQueryData<GardenDetailDto>(queryKeys.gardens.detail(userB.id, 'grd-1'))?.name).toBe(
        'Vườn của User B (grd-1)'
      );
      expect(qc.getQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(userB.id))?.[0].name).toBe(
        'Vườn của User B (grd-1)'
      );
      expect(container!.textContent).not.toContain('Tên bị đổi bởi User A');

      // Now switch back to A, start DELETE on grd-1, switch to User B, resolve DELETE -> User B grd-1 must NOT be removed!
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userA.email, password: 'Password123@' });
      });
      await waitFor(() => expect(authCtx.user?.id).toBe(userA.id));

      let pendingDeletePromise!: Promise<unknown>;
      act(() => {
        pendingDeletePromise = deleteMut.mutateAsync('grd-1').catch((err) => err);
      });
      await waitFor(() => expect(deleteMut.isPending).toBe(true));

      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(container!.textContent).toContain('Vườn của User B (grd-1)');
      });

      await act(async () => {
        pendingDeleteA.resolve(undefined);
        await pendingDeletePromise;
      });
      await flushAsync(40);

      // User B's detail & list cache are completely preserved and no stale redirect happened
      expect(qc.getQueryData<GardenDetailDto>(queryKeys.gardens.detail(userB.id, 'grd-1'))?.name).toBe(
        'Vườn của User B (grd-1)'
      );
      expect(qc.getQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(userB.id))?.length).toBe(1);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('Section 5 Test 5 (Gardens): mounted useGardensList and useGardenDetail hooks create strictly distinct user-scoped query keys for User A vs User B', async () => {
      await tokenStorage.saveSession(sessionA);

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const authHeader = config.headers?.Authorization as string | undefined;
        const isB = authHeader === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login' && config.method === 'post') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/gardens') {
          return {
            status: 200,
            data: { success: true, data: isB ? gardenBList : [gardenSummaryBalcony] },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-1') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                ...gardenDetailOne,
                name: isB ? 'User B Detail grd-1' : 'User A Detail grd-1',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let listQuery!: ReturnType<typeof useGardensList>;
      let detailQuery!: ReturnType<typeof useGardenDetail>;

      function GardenKeyProbe() {
        authCtx = useAuth();
        listQuery = useGardensList();
        detailQuery = useGardenDetail('grd-1');
        return null;
      }

      mountWithRealAuth(<GardenKeyProbe />);

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userA.id);
        expect(listQuery.data?.[0].id).toBe('grd-1');
        expect(detailQuery.data?.name).toBe('User A Detail grd-1');
      });

      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(listQuery.data?.[0].id).toBe('grd-b-1');
        expect(detailQuery.data?.name).toBe('User B Detail grd-1');
      });

      const allQueryKeys = qc.getQueryCache().getAll().map((entry) => entry.queryKey);
      expect(allQueryKeys).toContainEqual(queryKeys.gardens.list(userA.id));
      expect(allQueryKeys).toContainEqual(queryKeys.gardens.list(userB.id));
      expect(allQueryKeys).toContainEqual(queryKeys.gardens.detail(userA.id, 'grd-1'));
      expect(allQueryKeys).toContainEqual(queryKeys.gardens.detail(userB.id, 'grd-1'));
    });
  });
});
