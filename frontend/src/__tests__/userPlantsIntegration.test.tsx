import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import {
  AddGardenPlantScreen,
  GardenDetailScreen,
} from '@/features/gardens/GardenScreens';
import {
  type GardenDetailDto,
  type GardenSummaryDto,
} from '@/features/gardens/gardenTypes';
import HomeScreen, { HomePlantsSection } from '@/features/home/HomeScreen';
import { FilterScreen, SearchScreen } from '@/features/home/SearchScreens';
import { PlantsScreen } from '@/features/main/MainScreens';
import PlantDetailScreen from '@/features/plants/PlantDetailScreen';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
import {
  createPlant,
  deletePlant,
  getMyPlants,
  getPlantDetail,
  normalizeUserPlantListParams,
  updatePlant,
} from '@/features/plants/plantApi';
import {
  useCreatePlantMutation,
  useDeletePlantMutation,
  useUpdatePlantMutation,
  useUserPlantDetail,
  useUserPlantsList,
} from '@/features/plants/plantHooks';
import {
  type UserPlantDetailDto,
  type UserPlantSummaryDto,
} from '@/features/plants/plantTypes';
import type { SpeciesDetailDto, SpeciesSummaryDto } from '@/features/species/speciesTypes';
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
  id: 'usr_plant_a',
  fullName: 'Nguyễn Minh Khoa',
  email: 'khoa@goplant.vn',
  roles: ['ROLE_USER'],
};

const mockUserB = {
  id: 'usr_plant_b',
  fullName: 'Lê Thanh Hằng',
  email: 'hang@goplant.vn',
  roles: ['ROLE_USER'],
};

const sessionA: AuthSession = {
  accessToken: 'jwt-plant-token-user-a',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUserA,
  savedAt: Date.now(),
};

const sessionB: AuthSession = {
  accessToken: 'jwt-plant-token-user-b',
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

const gardenBalcony: GardenSummaryDto = {
  id: 'grd-1',
  name: 'Ban công hướng Đông',
  location: 'Tầng 4',
  spaceType: 'BAN_CONG',
  coverImageUrl: null,
  plantCount: 1,
  createdAt: '2026-01-02T00:00:00Z',
};

const gardenIndoor: GardenSummaryDto = {
  id: 'grd-2',
  name: 'Góc bàn làm việc',
  location: 'Phòng khách',
  spaceType: 'TRONG_NHA',
  coverImageUrl: null,
  plantCount: 0,
  createdAt: '2026-01-03T00:00:00Z',
};

const speciesMonstera: SpeciesSummaryDto = {
  id: 'sp-1',
  commonName: 'Trầu bà lá xẻ',
  scientificName: 'Monstera deliciosa',
  category: 'Cây cảnh',
  difficulty: 'Dễ',
  thumbnailUrl: null,
  isFavorited: false,
};

const speciesMonsteraDetail: SpeciesDetailDto = {
  ...speciesMonstera,
  lightRequirement: 'Ánh sáng gián tiếp',
  waterRequirement: 'Trung bình',
  environment: 'Trong nhà',
  spaceRequirement: 'Chậu vừa',
  matureSize: '1.5m',
  temperatureRange: '18-28°C',
  humidityRange: '60-80%',
  growingMedium: 'Thoát nước tốt',
  drainage: 'Tốt',
  soilPh: '5.5 - 7.0',
  sunTolerance: 'Bán râm',
  origin: 'Trung Mỹ',
  overview: 'Cây lá xẻ trang trí nội thất phổ biến.',
  morphology: 'Lá lớn có khe xẻ tự nhiên.',
  lifespan: 'Lâu năm',
  floweringSeason: null,
  usageAndCaution: 'Nhựa cây nhẹ kích ứng thú cưng.',
  growthRate: 'Trung bình',
  wateringFrequency: '2-3 lần/tuần',
  nutrition: 'NPK cân đối hàng tháng',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
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
  imageUrl: 'https://cdn.goplant.vn/senda.jpg',
  createdAt: '2026-01-09T08:00:00Z',
};

const plantDetailOne: UserPlantDetailDto = {
  id: 'plt-1',
  displayName: 'Monstera Cửa Sổ',
  location: 'Kệ gỗ tầng 2',
  plantedAt: '2026-01-10',
  note: 'Mỗi tuần xoay chậu 1 lần để lá đón sáng đều.',
  healthStatus: 'HEALTHY',
  plantCode: 'GP-PLT-0001',
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

const gardenDetailOne: GardenDetailDto = {
  id: 'grd-1',
  name: 'Ban công hướng Đông',
  location: 'Tầng 4',
  spaceType: 'BAN_CONG',
  description: 'Đón nắng sáng nhẹ.',
  coverImageUrl: null,
  plants: [
    {
      id: 'plt-1',
      displayName: 'Monstera Cửa Sổ',
      speciesName: 'Trầu bà lá xẻ',
      scientificName: 'Monstera deliciosa',
      category: 'Cây cảnh',
      healthStatus: 'HEALTHY',
      imageUrl: null,
    },
  ],
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-10T08:00:00Z',
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

function submitInput(el: Element | null | undefined) {
  if (!el) throw new Error('Input element not found');
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
    );
    el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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

describe('G5.4.1 User Plants REST API Integration (Mocked Axios HTTP Adapter)', () => {
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

  describe('1. plantApi Parameter Normalization & Input Validation', () => {
    it('normalizes GET /plants page, size, keyword, gardenId, healthStatus & sort allowlist safely', () => {
      expect(
        normalizeUserPlantListParams({
          keyword: '  Monstera  ',
          gardenId: '  grd-1  ',
          healthStatus: 'NEEDS_ATTENTION',
          page: -3,
          size: 500,
          sort: 'displayName,asc',
        })
      ).toEqual({
        keyword: 'Monstera',
        gardenId: 'grd-1',
        healthStatus: 'NEEDS_ATTENTION',
        page: 0,
        size: 100,
        sort: 'displayName,asc',
      });

      expect(
        normalizeUserPlantListParams({
          keyword: '   ',
          gardenId: '',
          healthStatus: 'INVALID_STATUS' as never,
          page: Number.NaN,
          size: 0,
          sort: 'user.password,asc',
        })
      ).toEqual({
        page: 0,
        size: 1,
        sort: 'createdAt,desc',
      });
    });

    it('rejects invalid create/update/detail/delete inputs locally before making HTTP requests', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      const adapter = vi.fn();
      apiClient.defaults.adapter = adapter;

      await expect(
        createPlant('   ', { speciesId: 'sp-1', displayName: 'Cây A' })
      ).rejects.toMatchObject({ field: 'gardenId', statusCode: 400 });

      await expect(
        createPlant('grd-1', { speciesId: ' ', displayName: 'Cây A' })
      ).rejects.toMatchObject({ field: 'speciesId', statusCode: 400 });

      await expect(
        createPlant('grd-1', { speciesId: 'sp-1', displayName: '   ' })
      ).rejects.toMatchObject({ field: 'displayName', statusCode: 400 });

      await expect(
        createPlant('grd-1', { speciesId: 'sp-1', displayName: 'x'.repeat(201) })
      ).rejects.toMatchObject({ field: 'displayName', statusCode: 400 });

      await expect(
        createPlant('grd-1', {
          speciesId: 'sp-1',
          displayName: 'Cây A',
          location: 'y'.repeat(201),
        })
      ).rejects.toMatchObject({ field: 'location', statusCode: 400 });

      await expect(
        createPlant('grd-1', {
          speciesId: 'sp-1',
          displayName: 'Cây A',
          plantedAt: '11-11-2026',
        })
      ).rejects.toMatchObject({ field: 'plantedAt', statusCode: 400 });

      await expect(
        createPlant('grd-1', {
          speciesId: 'sp-1',
          displayName: 'Cây A',
          plantedAt: '2026-02-30',
        })
      ).rejects.toMatchObject({ field: 'plantedAt', statusCode: 400 });

      // Update also rejects blank displayName (backend silently ignores empty string instead of clearing)
      await expect(
        updatePlant('plt-1', { displayName: '   ' })
      ).rejects.toMatchObject({ field: 'displayName', statusCode: 400 });

      await expect(
        updatePlant('plt-1', { healthStatus: 'BROKEN_STATUS' as never })
      ).rejects.toMatchObject({ field: 'healthStatus', statusCode: 400 });

      await expect(getPlantDetail('  ')).rejects.toMatchObject({
        field: 'plantId',
        statusCode: 400,
      });
      await expect(deletePlant('')).rejects.toMatchObject({
        field: 'plantId',
        statusCode: 400,
      });

      expect(adapter).not.toHaveBeenCalled();
    });

    it('sends PUT /plants/{id} allowing location/note/imageUrl clearing while omitting blank plantedAt', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      let capturedBody: Record<string, unknown> | undefined;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        capturedBody = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            data: {
              ...plantDetailOne,
              displayName: 'Monstera Đã Đổi Tên',
              location: null,
              note: null,
              imageUrl: null,
              healthStatus: 'CRITICAL',
            },
          },
          headers: {},
          config,
        });
      });

      const updated = await updatePlant('plt-1', {
        displayName: '  Monstera Đã Đổi Tên  ',
        location: '   ',
        plantedAt: '   ',
        note: '',
        healthStatus: 'CRITICAL',
        imageUrl: '   ',
      });

      expect(capturedBody).toEqual({
        displayName: 'Monstera Đã Đổi Tên',
        location: '',
        note: '',
        healthStatus: 'CRITICAL',
        imageUrl: '',
      });
      expect(Object.prototype.hasOwnProperty.call(capturedBody, 'plantedAt')).toBe(false);
      expect(updated.healthStatus).toBe('CRITICAL');
    });

    it('sends normalized GET /plants params via getMyPlants', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      let sentParams: unknown;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        sentParams = config.params;
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            data: {
              content: [plantSummaryOne],
              page: 1,
              size: 10,
              totalElements: 12,
              totalPages: 2,
              last: true,
            },
          },
          headers: {},
          config,
        });
      });

      const res = await getMyPlants({
        keyword: '  Monstera ',
        gardenId: 'grd-1',
        healthStatus: 'HEALTHY',
        page: 1,
        size: 10,
        sort: 'plantedAt,asc',
      });

      expect(sentParams).toEqual({
        keyword: 'Monstera',
        gardenId: 'grd-1',
        healthStatus: 'HEALTHY',
        page: 1,
        size: 10,
        sort: 'plantedAt,asc',
      });
      expect(res.content[0].displayName).toBe('Monstera Cửa Sổ');
    });
  });

  describe('2. PlantDetailScreen (GET /plants/{plantId}, Conditional plantCode, 403/404, Cascade Delete)', () => {
    it('renders full UserPlant detail, conditional plantCode ONLY when non-empty, linked garden & species links, and handles 403/404 without fallback', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      routeParamsState.current = { plantId: 'plt-1' };

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: plantDetailOne },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-no-code') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { ...plantDetailOne, id: 'plt-no-code', plantCode: null } },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-403') {
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 403,
              data: { success: false, error: { code: 'FORBIDDEN', message: 'Cây thuộc sở hữu tài khoản khác.' } },
            },
            config,
          });
        }
        if (config.url === '/plants/plt-404') {
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 404,
              data: { success: false, error: { code: 'PLANT_NOT_FOUND', message: 'Không tìm thấy cây trồng.' } },
            },
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
        expect(container!.textContent).toContain('Ban công hướng Đông');
        expect(container!.textContent).toContain('Kệ gỗ tầng 2');
        expect(container!.textContent).toContain('2026-01-10');
        expect(container!.textContent).toContain('Khỏe mạnh');
        expect(container!.textContent).toContain('GP-PLT-0001');
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
      });
      // Must NOT expose any fake QR/Camera UI
      expect(container!.textContent).not.toContain('Quét QR');
      expect(container!.textContent).not.toContain('Chụp ảnh AI');

      // Test garden & species navigation buttons + Edit button
      const gardenLinkBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Mở khu vườn')
      );
      clickElement(gardenLinkBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/garden-detail',
        params: { gardenId: 'grd-1' },
      });

      const speciesLinkBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Xem chi tiết loài cây')
      );
      clickElement(speciesLinkBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/plant-detail',
        params: { speciesId: 'sp-1' },
      });

      const editBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Chỉnh sửa cây'
      );
      clickElement(editBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/garden/add-plant',
        params: { editPlantId: 'plt-1' },
      });

      // Remount without plantCode -> omits "Mã định danh cây" cleanly
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      routeParamsState.current = { plantId: 'plt-no-code' };
      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });
      expect(container!.textContent).not.toContain('Mã định danh cây');

      // Remount 403 Forbidden
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      routeParamsState.current = { plantId: 'plt-403' };
      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không có quyền truy cập cây trồng');
      });
      expect(container!.textContent).not.toContain('Philodendron pedatum');

      // Remount 404 Not Found
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      routeParamsState.current = { plantId: 'plt-404' };
      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không tìm thấy cây trồng');
      });
    });

    it('warns cascade delete (Care Schedules, Care Logs, Growth Journals), disables controls while pending, handles failure, and clears cache without spurious 404 refetch on success', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      routeParamsState.current = { plantId: 'plt-1' };
      let getDetailCount = 0;
      let deleteCount = 0;
      let shouldFailDelete = true;
      const deferredDelete = createDeferred<unknown>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          getDetailCount += 1;
          if (deleteCount > 0 && !shouldFailDelete) {
            throw new Error('Spurious GET /plants/plt-1 after delete!');
          }
          return { status: 200, data: { success: true, data: plantDetailOne }, headers: {}, config };
        }
        if (config.url === '/plants/plt-1' && config.method === 'delete') {
          deleteCount += 1;
          if (shouldFailDelete) {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 500,
                data: { success: false, error: { code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi xóa cây.' } },
              },
              config,
            });
          }
          await deferredDelete.promise;
          return { status: 200, data: { success: true, data: { message: 'Đã xóa cây.' } }, headers: {}, config };
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      let confirmButtons: { text?: string; style?: string; onPress?: () => void }[] = [];
      let alertMessage = '';
      vi.spyOn(Alert, 'alert').mockImplementation((_title, msg, buttons) => {
        alertMessage = msg ?? '';
        confirmButtons = (buttons as typeof confirmButtons) ?? [];
      });

      mountWithProviders(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });
      const detailCallsBeforeDelete = getDetailCount;

      const deleteBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Xóa cây'
      );
      clickElement(deleteBtn);

      // Must show cascade warning and MUST NOT call DELETE until user confirms!
      expect(alertMessage).toContain('Care Schedules');
      expect(alertMessage).toContain('Care Logs');
      expect(alertMessage).toContain('Growth Journals');
      expect(deleteCount).toBe(0);

      // Cancel -> zero DELETE
      act(() => {
        confirmButtons.find((b) => b.style === 'cancel')?.onPress?.();
      });
      expect(deleteCount).toBe(0);

      // Confirm failure -> renders inline error banner and preserves detail screen
      clickElement(deleteBtn);
      await act(async () => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
        await flushAsync(40);
      });

      await waitFor(() => {
        expect(deleteCount).toBe(1);
        expect(container!.textContent).toContain('Lỗi máy chủ khi xóa cây.');
        expect(mockRouter.replace).not.toHaveBeenCalled();
      });

      // Retry confirm with deferred success -> disabled buttons while pending
      shouldFailDelete = false;
      clickElement(deleteBtn);
      act(() => {
        confirmButtons.find((b) => b.style === 'destructive')?.onPress?.();
      });

      await waitFor(() => {
        const disabledDeleteBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
          el.textContent?.includes('Đang xóa cây')
        );
        expect(disabledDeleteBtn?.getAttribute('aria-disabled')).toBe('true');
      });

      await act(async () => {
        deferredDelete.resolve(undefined);
        await flushAsync(50);
      });

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/plants');
        expect(qc.getQueryData(queryKeys.plants.detail(mockUserA.id, 'plt-1'))).toBeUndefined();
      });
      // No spurious refetch triggered after detail cache removal
      expect(getDetailCount).toBe(detailCallsBeforeDelete);
    });
  });

  describe('3. Create & Edit Plant Flows via AddGardenPlantScreen', () => {
    it('validates fields locally, preselects gardenId & speciesId, handles server 400 errors, and submits POST /gardens/{gardenId}/plants', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      routeParamsState.current = { gardenId: 'grd-1', speciesId: 'sp-1' };
      let postCalls = 0;
      let shouldReturn400 = true;
      let lastPostBody: Record<string, unknown> | undefined;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/gardens') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [gardenBalcony, gardenIndoor] },
            headers: {},
            config,
          });
        }
        if (config.url === '/species') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [speciesMonstera],
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
        if (config.url === '/species/sp-1') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: speciesMonsteraDetail },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens/grd-1/plants' && config.method === 'post') {
          postCalls += 1;
          lastPostBody = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          if (shouldReturn400) {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 400,
                data: {
                  success: false,
                  error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Ngày trồng không hợp lệ từ máy chủ.',
                    field: 'plantedAt',
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
                ...plantDetailOne,
                id: 'plt-created-1',
                displayName: String(lastPostBody.displayName),
                location: (lastPostBody.location as string | undefined) ?? null,
                plantedAt: (lastPostBody.plantedAt as string | undefined) ?? null,
                note: (lastPostBody.note as string | undefined) ?? null,
                plantCode: null,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<AddGardenPlantScreen />);

      // Auto-selects preselected gardenId & speciesId and suggests commonName
      await waitFor(() => {
        const gBtn = container!.querySelector('[aria-label="Chọn khu vườn Ban công hướng Đông"]');
        const sBtn = container!.querySelector('[aria-label="Chọn loài cây Trầu bà lá xẻ"]');
        expect(gBtn?.textContent).toContain('✓ Ban công hướng Đông');
        expect(sBtn?.textContent).toContain('✓');
        const nameInput = container!.querySelector('[aria-label="Tên cây hiển thị"]') as HTMLInputElement;
        expect(nameInput?.value).toBe('Trầu bà lá xẻ');
      });

      // Local validation: invalid date & >200 char location block POST
      const nameInput = container!.querySelector('[aria-label="Tên cây hiển thị"]');
      const locInput = container!.querySelector('[aria-label="Vị trí trồng cây"]');
      const dateInput = container!.querySelector('[aria-label="Ngày trồng cây"]');
      const submitBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Thêm cây vào vườn'
      );

      changeInputValue(nameInput, '   ');
      changeInputValue(locInput, 'A'.repeat(201));
      changeInputValue(dateInput, '11/11/2026');
      clickElement(submitBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Tên cây hiển thị không được để trống');
        expect(container!.textContent).toContain('Vị trí trồng tối đa 200 ký tự');
        expect(container!.textContent).toContain('Ngày trồng phải theo định dạng YYYY-MM-DD');
      });
      expect(postCalls).toBe(0);

      // Fix local fields -> hits server 400 field validation error
      changeInputValue(nameInput, 'Monstera Mới');
      changeInputValue(locInput, 'Góc ban công');
      changeInputValue(dateInput, '2026-11-10');
      clickElement(submitBtn);

      await waitFor(() => {
        expect(postCalls).toBe(1);
        expect(container!.textContent).toContain('Ngày trồng không hợp lệ từ máy chủ.');
      });

      // Retry valid submit -> 201 redirect to /plant-detail?plantId=plt-created-1 without healthStatus in body
      shouldReturn400 = false;
      clickElement(submitBtn);

      await waitFor(() => {
        expect(postCalls).toBe(2);
        expect(mockRouter.replace).toHaveBeenCalledWith({
          pathname: '/plant-detail',
          params: { plantId: 'plt-created-1' },
        });
      });
      expect(lastPostBody).toEqual({
        speciesId: 'sp-1',
        displayName: 'Monstera Mới',
        location: 'Góc ban công',
        plantedAt: '2026-11-10',
      });
      expect(Object.prototype.hasOwnProperty.call(lastPostBody, 'healthStatus')).toBe(false);
    });

    it('supports Edit mode (?editPlantId=...) keeping garden & species read-only and sending PUT /plants/{id}', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      routeParamsState.current = { editPlantId: 'plt-1' };
      let putPayload: Record<string, unknown> | undefined;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/plants/plt-1' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: plantDetailOne },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-1' && config.method === 'put') {
          putPayload = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                ...plantDetailOne,
                displayName: 'Monstera Đã Sửa',
                location: null,
                healthStatus: 'NEEDS_ATTENTION',
                note: '',
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      mountWithProviders(<AddGardenPlantScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Chỉnh sửa cây trồng');
        expect(container!.textContent).toContain('Ban công hướng Đông');
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
        expect(container!.textContent).toContain('API cập nhật cây không hỗ trợ đổi khu vườn hoặc loài cây');
        const nameEl = container!.querySelector('[aria-label="Tên cây hiển thị"]') as HTMLInputElement;
        expect(nameEl?.value).toBe('Monstera Cửa Sổ');
      });

      changeInputValue(container!.querySelector('[aria-label="Tên cây hiển thị"]'), 'Monstera Đã Sửa');
      changeInputValue(container!.querySelector('[aria-label="Vị trí trồng cây"]'), '');
      changeInputValue(container!.querySelector('[aria-label="Ngày trồng cây"]'), '');
      changeInputValue(container!.querySelector('[aria-label="Ghi chú cây trồng"]'), '');

      const needsAttentionBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Cần chú ý'
      );
      clickElement(needsAttentionBtn);

      const saveBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Lưu thay đổi cây'
      );
      clickElement(saveBtn);

      await waitFor(() => {
        expect(putPayload).toEqual({
          displayName: 'Monstera Đã Sửa',
          location: '',
          note: '',
          healthStatus: 'NEEDS_ATTENTION',
          imageUrl: '',
        });
        expect(mockRouter.back).toHaveBeenCalled();
      });
    });
  });

  describe('4. Cache Synchronization Across plants.* & gardens.* (Create, Update, Delete)', () => {
    it('syncs plants.detail, plants.list, gardens.list (plantCount) & gardens.detail (plants) on create, update, and delete', async () => {
      await tokenStorage.saveSession(sessionA);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/gardens/grd-1/plants' && config.method === 'post') {
          return Promise.resolve({
            status: 201,
            data: {
              success: true,
              data: {
                ...plantDetailOne,
                id: 'plt-2',
                displayName: 'Cây Mới Thêm',
                healthStatus: 'HEALTHY',
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-2' && config.method === 'put') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                ...plantDetailOne,
                id: 'plt-2',
                displayName: 'Cây Đã Sửa Tên',
                healthStatus: 'CRITICAL',
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants/plt-2' && config.method === 'delete') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { message: 'Deleted' } },
            headers: {},
            config,
          });
        }
        // Background invalidations after cache update
        if (config.url === '/plants' && config.method === 'get') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/gardens' && config.method === 'get') {
          return Promise.resolve({ status: 200, data: { success: true, data: [gardenBalcony] }, headers: {}, config });
        }
        if (config.url === '/gardens/grd-1' && config.method === 'get') {
          return Promise.resolve({ status: 200, data: { success: true, data: gardenDetailOne }, headers: {}, config });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      const listKey = queryKeys.plants.list(mockUserA.id, {
        page: 0,
        size: 20,
        sort: 'createdAt,desc',
      });
      qc.setQueryData<PageResponse<UserPlantSummaryDto>>(listKey, {
        content: [plantSummaryOne],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        last: true,
      });
      qc.setQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(mockUserA.id), [gardenBalcony]);
      qc.setQueryData<GardenDetailDto>(queryKeys.gardens.detail(mockUserA.id, 'grd-1'), gardenDetailOne);

      let createMut!: ReturnType<typeof useCreatePlantMutation>;
      let updateMut!: ReturnType<typeof useUpdatePlantMutation>;
      let deleteMut!: ReturnType<typeof useDeletePlantMutation>;
      function Probe() {
        createMut = useCreatePlantMutation();
        updateMut = useUpdatePlantMutation();
        deleteMut = useDeletePlantMutation();
        return null;
      }

      mountWithProviders(<Probe />);
      await waitFor(() => expect(createMut).toBeDefined());
      await flushAsync(40);

      // 1) CREATE
      await act(async () => {
        await createMut.mutateAsync({
          gardenId: 'grd-1',
          request: { speciesId: 'sp-1', displayName: 'Cây Mới Thêm' },
        });
      });

      const afterCreateList = qc.getQueryData<PageResponse<UserPlantSummaryDto>>(listKey);
      expect(afterCreateList?.content.map((p) => p.id)).toEqual(['plt-2', 'plt-1']);
      expect(afterCreateList?.totalElements).toBe(2);
      expect(qc.getQueryData<UserPlantDetailDto>(queryKeys.plants.detail(mockUserA.id, 'plt-2'))?.displayName).toBe(
        'Cây Mới Thêm'
      );
      expect(qc.getQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(mockUserA.id))?.[0].plantCount).toBe(2);
      expect(
        qc.getQueryData<GardenDetailDto>(queryKeys.gardens.detail(mockUserA.id, 'grd-1'))?.plants.map((p) => p.id)
      ).toEqual(['plt-1', 'plt-2']);

      // 2) UPDATE
      await act(async () => {
        await updateMut.mutateAsync({
          plantId: 'plt-2',
          data: { displayName: 'Cây Đã Sửa Tên', healthStatus: 'CRITICAL' },
        });
      });

      const afterUpdateList = qc.getQueryData<PageResponse<UserPlantSummaryDto>>(listKey);
      expect(afterUpdateList?.content.find((p) => p.id === 'plt-2')?.displayName).toBe('Cây Đã Sửa Tên');
      expect(afterUpdateList?.content.find((p) => p.id === 'plt-2')?.healthStatus).toBe('CRITICAL');
      expect(
        qc
          .getQueryData<GardenDetailDto>(queryKeys.gardens.detail(mockUserA.id, 'grd-1'))
          ?.plants.find((p) => p.id === 'plt-2')?.healthStatus
      ).toBe('CRITICAL');

      // 3) DELETE
      await act(async () => {
        await deleteMut.mutateAsync('plt-2');
      });

      const afterDeleteList = qc.getQueryData<PageResponse<UserPlantSummaryDto>>(listKey);
      expect(afterDeleteList?.content.map((p) => p.id)).toEqual(['plt-1']);
      expect(afterDeleteList?.totalElements).toBe(1);
      expect(qc.getQueryData(queryKeys.plants.detail(mockUserA.id, 'plt-2'))).toBeUndefined();
      expect(qc.getQueryData<GardenSummaryDto[]>(queryKeys.gardens.list(mockUserA.id))?.[0].plantCount).toBe(1);
      expect(
        qc.getQueryData<GardenDetailDto>(queryKeys.gardens.detail(mockUserA.id, 'grd-1'))?.plants.map((p) => p.id)
      ).toEqual(['plt-1']);
    });
  });

  describe('5. Screens Integration (PlantsScreen, HomePlantsSection, GardenDetailScreen, SearchScreen, FilterScreen)', () => {
    it('PlantsScreen filters by keyword, garden, healthStatus, sort, paginates, refreshes, handles empty/error+retry, keeps FavoritesSection, and uses zero demo data', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      const capturedPlantQueries: Record<string, unknown>[] = [];
      let failPlants = true;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/gardens') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [gardenBalcony, gardenIndoor] },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/favorites') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [{ ...speciesMonstera, isFavorited: true }], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants') {
          const p = (config.params ?? {}) as Record<string, unknown>;
          capturedPlantQueries.push(p);
          if (failPlants) {
            return Promise.reject({
              isAxiosError: true,
              response: { status: 500, data: { success: false, error: { code: 'SERVER_ERROR', message: 'Máy chủ tạm gián đoạn' } } },
              config,
            });
          }
          if (p.keyword === 'empty') {
            return Promise.resolve({
              status: 200,
              data: { success: true, data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true } },
              headers: {},
              config,
            });
          }
          if (p.page === 1) {
            return Promise.resolve({
              status: 200,
              data: {
                success: true,
                data: { content: [plantSummaryTwo], page: 1, size: 20, totalElements: 22, totalPages: 2, last: true },
              },
              headers: {},
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne], page: 0, size: 20, totalElements: 22, totalPages: 2, last: false },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      mountWithProviders(<PlantsScreen />);

      // Renders error card + retry when backend fails, preserving FavoritesSection
      await waitFor(() => {
        expect(container!.textContent).toContain('Không thể tải danh sách cây trồng');
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
      });

      failPlants = false;
      const retryBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Thử lại'
      );
      clickElement(retryBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
        expect(container!.textContent).toContain('1 loài yêu thích • 22 cây sở hữu • 2 khu vườn');
        expect(container!.textContent).toContain('Trang 1 / 2');
      });
      expect(container!.textContent).not.toContain('Demo G5.4');
      expect(container!.textContent).not.toContain('Bản xem trước');

      // Paginate -> page 1
      const nextBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Trang sau'
      );
      clickElement(nextBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Sen Đá Bàn Làm Việc');
        expect(container!.textContent).toContain('Cần chú ý');
        expect(capturedPlantQueries.at(-1)?.page).toBe(1);
      });

      // Garden filter resets page back to 0 and sends gardenId
      const gardenFilterBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Ban công hướng Đông'
      );
      clickElement(gardenFilterBtn);

      await waitFor(() => {
        expect(capturedPlantQueries.at(-1)).toMatchObject({ gardenId: 'grd-1', page: 0 });
      });

      // HealthStatus filter sends CRITICAL
      const healthBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Nguy cấp'
      );
      clickElement(healthBtn);

      await waitFor(() => {
        expect(capturedPlantQueries.at(-1)).toMatchObject({
          gardenId: 'grd-1',
          healthStatus: 'CRITICAL',
          page: 0,
        });
      });

      // Sort option updates sort parameter
      const sortBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Tên A → Z'
      );
      clickElement(sortBtn);

      await waitFor(() => {
        expect(capturedPlantQueries.at(-1)).toMatchObject({ sort: 'displayName,asc', page: 0 });
      });

      // Empty state with active filters offers "Xóa bộ lọc" -> resets to default query
      const searchInput = container!.querySelector('[aria-label="Tìm kiếm cây đang sở hữu"]');
      changeInputValue(searchInput, 'empty');
      submitInput(searchInput);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không tìm thấy cây phù hợp');
      });

      const resetFiltersBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Xóa bộ lọc'
      );
      clickElement(resetFiltersBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
        expect(capturedPlantQueries.at(-1)).toEqual({
          page: 0,
          size: 20,
          sort: 'createdAt,desc',
        });
      });

      const callsBeforeRefresh = capturedPlantQueries.length;
      clickElement(container!.querySelector('[aria-label="Làm mới danh sách cây"]'));
      await waitFor(() => {
        expect(capturedPlantQueries.length).toBeGreaterThan(callsBeforeRefresh);
      });
    });

    it('HomeScreen, HomePlantsSection & GardenDetailScreen render real gardens & plant cards and navigate cleanly without G5.4 preview strings', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/gardens') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [gardenBalcony] },
            headers: {},
            config,
          });
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
        if (config.url === '/gardens/grd-1') {
          return Promise.resolve({ status: 200, data: { success: true, data: gardenDetailOne }, headers: {}, config });
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      mountWithProviders(<HomeScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Vườn của bạn');
        expect(container!.textContent).toContain('Ban công hướng Đông');
        expect(container!.textContent).toContain('Cây trồng của bạn');
        expect(container!.textContent).toContain('1 cây • Quản lý');
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });
      expect(container!.textContent).not.toContain('Bản xem trước G5.4');
      expect(container!.textContent).not.toContain('Thêm cây demo');

      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      mountWithProviders(<HomePlantsSection />);

      await waitFor(() => {
        expect(container!.textContent).toContain('1 cây • Quản lý');
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });

      clickElement(container!.querySelector('[aria-label="Xem chi tiết Monstera Cửa Sổ"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/plant-detail',
        params: { plantId: 'plt-1' },
      });

      // Verify GardenDetailScreen + Thêm cây & clickable plant row
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      routeParamsState.current = { gardenId: 'grd-1' };
      mountWithProviders(<GardenDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });

      const addPlantInGardenBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === '＋ Thêm cây'
      );
      clickElement(addPlantInGardenBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/garden/add-plant',
        params: { gardenId: 'grd-1' },
      });

      const gardenPlantCard = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Monstera Cửa Sổ')
      );
      clickElement(gardenPlantCard);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/plant-detail',
        params: { plantId: 'plt-1' },
      });
    });

    it('SearchScreen (scope=owned) and FilterScreen (scope=owned) filter real User Plants via GET /plants without demo data', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(sessionA);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(sessionA.accessToken);
      routeParamsState.current = { scope: 'owned' };

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: profileA }, headers: {}, config });
        }
        if (config.url === '/gardens') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: [gardenBalcony] },
            headers: {},
            config,
          });
        }
        if (config.url === '/plants') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: { content: [plantSummaryOne], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      mountWithProviders(<SearchScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây của tôi (1)');
        expect(container!.textContent).toContain('Monstera Cửa Sổ');
      });
      expect(container!.textContent).not.toContain('Demo G5.4');
      expect(container!.textContent).not.toContain('Xem hồ sơ demo');

      clickElement(container!.querySelector('[aria-label="Xem chi tiết Monstera Cửa Sổ"]'));
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/plant-detail',
        params: { plantId: 'plt-1' },
      });

      // Verify FilterScreen owned scope uses GET /plants & GET /gardens and passes params back
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      routeParamsState.current = { scope: 'owned' };
      mountWithProviders(<FilterScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây của tôi (API)');
        expect(container!.textContent).toContain('1 cây phù hợp');
        expect(container!.textContent).toContain('Ban công hướng Đông');
      });
      expect(container!.textContent).not.toContain('Demo G5.4');

      const pickHealthy = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Khỏe mạnh'
      );
      clickElement(pickHealthy);

      const applyBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Áp dụng lọc')
      );
      clickElement(applyBtn);

      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/search',
        params: {
          query: '',
          scope: 'owned',
          gardenId: '',
          healthStatus: 'HEALTHY',
          plantSort: 'createdAt,desc',
          filters: '{}',
        },
      });
    });
  });

  describe('6. Account-Switch Session & Cache Isolation (Pending Queries & Pending Mutations)', () => {
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

    it('isolates pending list queries & placeholderData when switching Account A → Account B mid-pagination', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingPage1A = createDeferred<unknown>();

      const plantA0: UserPlantSummaryDto = {
        ...plantSummaryOne,
        id: 'plt-a-0',
        displayName: 'Lan Hồ Điệp Riêng Của A',
      };
      const plantA1: UserPlantSummaryDto = {
        ...plantSummaryOne,
        id: 'plt-a-1',
        displayName: 'Dương Xỉ Trang 2 Của A',
      };
      const plantB0: UserPlantSummaryDto = {
        ...plantSummaryOne,
        id: 'plt-b-0',
        displayName: 'Xương Rồng Riêng Của B',
      };

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
          return { status: 200, data: { success: true, data: [] }, headers: {}, config };
        }
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: { success: true, data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true } },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants') {
          const params = (config.params ?? {}) as Record<string, unknown>;
          if (isB) {
            return {
              status: 200,
              data: {
                success: true,
                data: { content: [plantB0], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
              },
              headers: {},
              config,
            };
          }
          if (params.page === 1) {
            await pendingPage1A.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: { content: [plantA1], page: 1, size: 20, totalElements: 21, totalPages: 2, last: true },
              },
              headers: {},
              config,
            };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: { content: [plantA0], page: 0, size: 20, totalElements: 21, totalPages: 2, last: false },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected API call: ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      function Probe() {
        authCtx = useAuth();
        return null;
      }

      mountWithRealAuth(
        <>
          <Probe />
          <PlantsScreen />
        </>
      );

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
        expect(container!.textContent).toContain('Lan Hồ Điệp Riêng Của A');
      });

      // Trigger page 1 for User A (held pending)
      const nextBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Trang sau'
      );
      clickElement(nextBtn);

      // Immediately switch to User B while A's page 1 request is in flight!
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: mockUserB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Xương Rồng Riêng Của B');
      });

      // Resolve User A's late page 1 response
      await act(async () => {
        pendingPage1A.resolve(undefined);
        await flushAsync(40);
      });

      expect(container!.textContent).toContain('Xương Rồng Riêng Của B');
      expect(container!.textContent).not.toContain('Lan Hồ Điệp Riêng Của A');
      expect(container!.textContent).not.toContain('Dương Xỉ Trang 2 Của A');
    });

    it('prevents pending create/update/delete mutations from Account A from corrupting Account B cache or UI (including same plantId)', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingCreateA = createDeferred<unknown>();
      const pendingUpdateA = createDeferred<unknown>();
      const pendingDeleteA = createDeferred<unknown>();
      const pendingFailedCreateA = createDeferred<unknown>();
      vi.spyOn(Alert, 'alert').mockImplementation(() => {});

      const bPlantShared: UserPlantDetailDto = {
        ...plantDetailOne,
        id: 'plt-shared-1',
        displayName: 'Cây Nguyên Bản Của B',
        healthStatus: 'HEALTHY',
        garden: { id: 'grd-b', name: 'Vườn B' },
      };

      const aPlantShared: UserPlantDetailDto = {
        ...plantDetailOne,
        id: 'plt-shared-1',
        displayName: 'Cây Của A',
        garden: { id: 'grd-a', name: 'Vườn A' },
      };

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const authHeader = config.headers?.Authorization as string | undefined;
        const isB = authHeader === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login' && config.method === 'post') {
          const payload = JSON.parse(String(config.data ?? '{}')) as { account?: string };
          return {
            status: 200,
            data: { success: true, data: payload.account === mockUserA.email ? sessionA : sessionB },
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
              data: [
                isB
                  ? { ...gardenBalcony, id: 'grd-b', name: 'Vườn B', plantCount: 1 }
                  : { ...gardenBalcony, id: 'grd-a', name: 'Vườn A', plantCount: 1 },
              ],
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: { content: [speciesMonstera], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true } },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [
                  {
                    ...plantSummaryOne,
                    id: 'plt-shared-1',
                    displayName: isB ? 'Cây Nguyên Bản Của B' : 'Cây Của A',
                    gardenName: isB ? 'Vườn B' : 'Vườn A',
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
          };
        }
        if (config.url === '/plants/plt-shared-1' && config.method === 'get') {
          return {
            status: 200,
            data: { success: true, data: isB ? bPlantShared : aPlantShared },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-a/plants' && config.method === 'post') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          const body = JSON.parse(String(config.data ?? '{}')) as { displayName?: string };
          if (body.displayName === 'Sẽ Lỗi Của A') {
            await pendingFailedCreateA.promise;
            return Promise.reject({
              isAxiosError: true,
              response: { status: 400, data: { success: false, error: { code: 'BAD_REQUEST', message: 'Lỗi tạo cây của A' } } },
              config,
            });
          }
          await pendingCreateA.promise;
          return {
            status: 201,
            data: {
              success: true,
              data: { ...aPlantShared, id: 'plt-a-created', displayName: 'Cây Rò Rỉ Của A' },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-shared-1' && config.method === 'put') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          await pendingUpdateA.promise;
          return {
            status: 200,
            data: { success: true, data: { ...aPlantShared, displayName: 'Tên Bị Ghi Đè Bởi A' } },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-shared-1' && config.method === 'delete') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          await pendingDeleteA.promise;
          return { status: 200, data: { success: true, data: { message: 'Deleted by A' } }, headers: {}, config };
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let createMut!: ReturnType<typeof useCreatePlantMutation>;
      let updateMut!: ReturnType<typeof useUpdatePlantMutation>;
      let deleteMut!: ReturnType<typeof useDeletePlantMutation>;
      function Probe() {
        authCtx = useAuth();
        useUserPlantsList({ page: 0, size: 20, sort: 'createdAt,desc' });
        useUserPlantDetail('plt-shared-1');
        createMut = useCreatePlantMutation();
        updateMut = useUpdatePlantMutation();
        deleteMut = useDeletePlantMutation();
        return null;
      }

      routeParamsState.current = { plantId: 'plt-shared-1' };
      mountWithRealAuth(
        <>
          <Probe />
          <PlantDetailScreen />
        </>
      );

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
        expect(container!.textContent).toContain('Cây Của A');
      });

      // Trigger pending CREATE, failed CREATE, UPDATE, and DELETE on User A simultaneously
      let pCreate!: Promise<unknown>;
      let pFailCreate!: Promise<unknown>;
      let pUpdate!: Promise<unknown>;
      let pDelete!: Promise<unknown>;

      act(() => {
        pCreate = createMut
          .mutateAsync({ gardenId: 'grd-a', request: { speciesId: 'sp-1', displayName: 'Cây Rò Rỉ Của A' } })
          .catch((e) => e);
        pFailCreate = createMut
          .mutateAsync({ gardenId: 'grd-a', request: { speciesId: 'sp-1', displayName: 'Sẽ Lỗi Của A' } })
          .catch((e) => e);
        pUpdate = updateMut
          .mutateAsync({ plantId: 'plt-shared-1', data: { displayName: 'Tên Bị Ghi Đè Bởi A' } })
          .catch((e) => e);
        pDelete = deleteMut.mutateAsync('plt-shared-1').catch((e) => e);
      });

      await waitFor(() => expect(createMut.isPending).toBe(true));

      // Switch User A -> User B before ANY of A's mutations settle
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: mockUserB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Cây Nguyên Bản Của B');
      });

      // Settle all stale User A mutations AFTER B is active
      await act(async () => {
        pendingCreateA.resolve(undefined);
        pendingFailedCreateA.resolve(undefined);
        pendingUpdateA.resolve(undefined);
        pendingDeleteA.resolve(undefined);
        await Promise.all([pCreate, pFailCreate, pUpdate, pDelete]);
      });
      await flushAsync(50);

      // Verify User B's caches and UI remain 100% pure
      const listB = qc.getQueryData<PageResponse<UserPlantSummaryDto>>(
        queryKeys.plants.list(mockUserB.id, { page: 0, size: 20, sort: 'createdAt,desc' })
      );
      expect(listB?.content.map((p) => p.id)).toEqual(['plt-shared-1']);
      expect(listB?.content[0].displayName).toBe('Cây Nguyên Bản Của B');
      expect(qc.getQueryData<UserPlantDetailDto>(queryKeys.plants.detail(mockUserB.id, 'plt-shared-1'))?.displayName).toBe(
        'Cây Nguyên Bản Của B'
      );
      expect(qc.getQueryData(queryKeys.plants.detail(mockUserB.id, 'plt-a-created'))).toBeUndefined();
      expect(container!.textContent).toContain('Cây Nguyên Bản Của B');
      expect(container!.textContent).not.toContain('Cây Rò Rỉ Của A');
      expect(container!.textContent).not.toContain('Tên Bị Ghi Đè Bởi A');
      expect(container!.textContent).not.toContain('Lỗi tạo cây của A');
      expect(mockRouter.replace).not.toHaveBeenCalled();

      // Verify apiClient rejects outbound requests explicitly scoped to stale A after B is logged in
      await expect(
        createPlant(
          'grd-a',
          { speciesId: 'sp-1', displayName: 'Late Call' },
          { expectedUserId: mockUserA.id, expectedSessionGeneration: 1 }
        )
      ).rejects.toBeInstanceOf(AppApiError);
    });

    it('prevents pending AddGardenPlantScreen submit callback from navigating or showing error on Account B after A → B switch', async () => {
      await tokenStorage.saveSession(sessionA);
      const deferredPost = createDeferred<unknown>();

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
            data: {
              success: true,
              data: [isB ? { ...gardenBalcony, id: 'grd-b', name: 'Vườn của B' } : gardenBalcony],
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: { content: [speciesMonstera], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/gardens/grd-1/plants' && config.method === 'post') {
          await deferredPost.promise;
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 400,
              data: { success: false, error: { code: 'BAD_REQUEST', message: 'Lỗi trễ của Account A' } },
            },
            config,
          });
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      function Probe() {
        authCtx = useAuth();
        return null;
      }

      mountWithRealAuth(
        <>
          <Probe />
          <AddGardenPlantScreen />
        </>
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Ban công hướng Đông');
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
      });

      clickElement(container!.querySelector('[aria-label="Chọn khu vườn Ban công hướng Đông"]'));
      clickElement(container!.querySelector('[aria-label="Chọn loài cây Trầu bà lá xẻ"]'));

      const submitBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Thêm cây vào vườn'
      );
      clickElement(submitBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Đang lưu...');
      });

      // Switch Account A -> Account B while form POST is pending
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: mockUserB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
        expect(container!.textContent).toContain('Vườn của B');
      });

      // Settle late failure from A -> must NOT show A's error or navigate on B!
      await act(async () => {
        deferredPost.resolve(undefined);
        await flushAsync(40);
      });

      expect(container!.textContent).not.toContain('Lỗi trễ của Account A');
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  describe('7. Last-Page Delete Pagination & Placeholder Clamping (G5.4.1.1)', () => {
    function makePagedPlants(count: number): UserPlantSummaryDto[] {
      return Array.from({ length: count }, (_, idx) => {
        const num = idx + 1;
        return {
          ...plantSummaryOne,
          id: `plt-pg-${num}`,
          displayName: `Cây Phân Trang #${String(num).padStart(2, '0')}`,
          createdAt: `2026-01-10T00:${String(Math.floor(num / 60)).padStart(2, '0')}:${String(num % 60).padStart(2, '0')}Z`,
        };
      });
    }

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

    it('Test 1: deleting the sole item on the last page (21 -> 20, size 20) clamps page back to 0 and loads the 20 remaining plants without showing Trang 2 / 1', async () => {
      await tokenStorage.saveSession(sessionA);
      let plantsDb = makePagedPlants(21);
      const requestedPlantPages: number[] = [];
      const deleteDeferred = createDeferred<void>();
      let deleteCalled = false;

      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens') {
          return {
            status: 200,
            data: { success: true, data: [{ ...gardenBalcony, plantCount: plantsDb.length }] },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: { success: true, data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true } },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants' && config.method === 'get') {
          const p = (config.params ?? {}) as { page?: number; size?: number };
          const pageIdx = p.page ?? 0;
          const size = p.size ?? 20;
          requestedPlantPages.push(pageIdx);
          const totalElements = plantsDb.length;
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          const content = plantsDb.slice(pageIdx * size, (pageIdx + 1) * size);
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content,
                page: pageIdx,
                size,
                totalElements,
                totalPages,
                last: totalPages === 0 || pageIdx + 1 >= totalPages,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-pg-21' && config.method === 'delete') {
          deleteCalled = true;
          await deleteDeferred.promise;
          plantsDb = plantsDb.filter((item) => item.id !== 'plt-pg-21');
          return { status: 200, data: { success: true, data: { message: 'Deleted plt-pg-21' } }, headers: {}, config };
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      const seenTexts: string[] = [];
      const observer = new MutationObserver(() => {
        seenTexts.push(container?.textContent ?? '');
      });
      observer.observe(container!, { childList: true, subtree: true, characterData: true });

      mountWithRealAuth(<PlantsScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Phân Trang #01');
        expect(container!.textContent).toContain('Cây Phân Trang #20');
        expect(container!.textContent).toContain('Trang 1 / 2');
        expect(container!.textContent).toContain('21 cây sở hữu');
      });
      expect(container!.textContent).not.toContain('Cây Phân Trang #21');

      // Navigate to page 1 (second page, containing only #21)
      const nextBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Trang sau'
      );
      clickElement(nextBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Phân Trang #21');
        expect(container!.textContent).toContain('Trang 2 / 2');
        expect(container!.querySelectorAll('[aria-label^="Xóa Cây Phân Trang #"]')).toHaveLength(1);
      });
      expect(container!.textContent).not.toContain('Cây Phân Trang #01');

      // Trigger delete confirmation & execute DELETE
      clickElement(container!.querySelector('[aria-label="Xóa Cây Phân Trang #21"]'));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const buttons = alertSpy.mock.calls[0]?.[2] as { text?: string; onPress?: () => void }[] | undefined;
      const confirmDelete = buttons?.find((b) => b.text === 'Xóa cây');

      act(() => {
        confirmDelete?.onPress?.();
      });
      await waitFor(() => expect(deleteCalled).toBe(true));

      await act(async () => {
        deleteDeferred.resolve(undefined);
        await flushAsync(40);
      });

      // After page 1 refetch returns totalPages=1 & content=[], UI automatically clamps back to page 0 and fetches remaining 20 plants
      await waitFor(() => {
        expect(plantsDb).toHaveLength(20);
        expect(container!.textContent).toContain('20 cây sở hữu');
        expect(container!.textContent).toContain('Cây Phân Trang #01');
        expect(container!.textContent).toContain('Cây Phân Trang #20');
        expect(requestedPlantPages.at(-1)).toBe(0);
      });

      observer.disconnect();
      expect(seenTexts.some((t) => t.includes('Trang 2 / 1'))).toBe(false);
      expect(container!.textContent).not.toContain('Cây Phân Trang #21');
      expect(container!.textContent).not.toContain('Trang 2 / 1');
      expect(container!.textContent).not.toContain('Bạn chưa có cây trồng nào');
    });

    it('Test 2: deleting the last remaining plant at page 0 (1 -> 0) keeps page 0 and renders empty state without negative or invalid page indicator', async () => {
      await tokenStorage.saveSession(sessionA);
      let plantsDb = makePagedPlants(1);
      const requestedPlantPages: number[] = [];

      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens') {
          return {
            status: 200,
            data: { success: true, data: [{ ...gardenBalcony, plantCount: plantsDb.length }] },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: { success: true, data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true } },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants' && config.method === 'get') {
          const p = (config.params ?? {}) as { page?: number; size?: number };
          const pageIdx = p.page ?? 0;
          const size = p.size ?? 20;
          requestedPlantPages.push(pageIdx);
          const totalElements = plantsDb.length;
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: plantsDb.slice(pageIdx * size, (pageIdx + 1) * size),
                page: pageIdx,
                size,
                totalElements,
                totalPages,
                last: totalPages === 0 || pageIdx + 1 >= totalPages,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-pg-1' && config.method === 'delete') {
          plantsDb = [];
          return { status: 200, data: { success: true, data: { message: 'Deleted last plant' } }, headers: {}, config };
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      mountWithRealAuth(<PlantsScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Phân Trang #01');
        expect(container!.textContent).toContain('1 cây sở hữu');
      });

      clickElement(container!.querySelector('[aria-label="Xóa Cây Phân Trang #01"]'));
      const buttons = alertSpy.mock.calls[0]?.[2] as { text?: string; onPress?: () => void }[] | undefined;
      act(() => {
        buttons?.find((b) => b.text === 'Xóa cây')?.onPress?.();
      });

      await waitFor(() => {
        expect(plantsDb).toHaveLength(0);
        expect(container!.textContent).toContain('0 cây sở hữu');
        expect(container!.textContent).toContain('Bạn chưa có cây trồng nào');
      });

      expect(container!.textContent).not.toContain('Cây Phân Trang #01');
      expect(requestedPlantPages.every((p) => p === 0)).toBe(true);
      expect(container!.textContent).not.toMatch(/Trang\s+-?\d+\s*\/\s*-?\d+/);
    });

    it('Test 3: preserves placeholder items while next-page request is pending and never jumps back even if placeholder carries stale totalPages', async () => {
      await tokenStorage.saveSession(sessionA);
      const page0Plants = makePagedPlants(20);
      const page1Plant: UserPlantSummaryDto = {
        ...plantSummaryOne,
        id: 'plt-pg-21',
        displayName: 'Cây Phân Trang #21',
      };
      const page2Plant: UserPlantSummaryDto = {
        ...plantSummaryOne,
        id: 'plt-pg-41',
        displayName: 'Cây Phân Trang #41',
      };

      const pendingPage1 = createDeferred<void>();
      const pendingPage2 = createDeferred<void>();
      const requestedPages: number[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens') {
          return { status: 200, data: { success: true, data: [gardenBalcony] }, headers: {}, config };
        }
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: { success: true, data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true } },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants' && config.method === 'get') {
          const p = (config.params ?? {}) as { page?: number };
          const pageIdx = p.page ?? 0;
          requestedPages.push(pageIdx);
          if (pageIdx === 0) {
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  content: page0Plants,
                  page: 0,
                  size: 20,
                  totalElements: 21,
                  totalPages: 2,
                  last: false,
                },
              },
              headers: {},
              config,
            };
          }
          if (pageIdx === 1) {
            await pendingPage1.promise;
            // Carries stale totalPages=2 with last=false (simulating server growth to 3 pages while client navigates further)
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  content: [page1Plant],
                  page: 1,
                  size: 20,
                  totalElements: 40,
                  totalPages: 2,
                  last: false,
                },
              },
              headers: {},
              config,
            };
          }
          if (pageIdx === 2) {
            await pendingPage2.promise;
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  content: [page2Plant],
                  page: 2,
                  size: 20,
                  totalElements: 41,
                  totalPages: 3,
                  last: true,
                },
              },
              headers: {},
              config,
            };
          }
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      mountWithRealAuth(<PlantsScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Phân Trang #01');
        expect(container!.textContent).toContain('Trang 1 / 2');
      });

      // Advance page 0 -> page 1 while page 1 request is pending
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Trang sau')
      );

      await waitFor(() => expect(requestedPages).toEqual([0, 1]));
      await flushAsync(40);

      // Placeholder page 0 items stay visible while fetching page 1; never jumps back to page 0
      expect(container!.textContent).toContain('Cây Phân Trang #01');
      expect(container!.textContent).toContain('Trang 2 / 2');
      expect(requestedPages).toEqual([0, 1]);

      await act(async () => {
        pendingPage1.resolve(undefined);
        await flushAsync(30);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Phân Trang #21');
        expect(container!.textContent).toContain('Trang 2 / 2');
      });

      // Advance page 1 -> page 2 while placeholder still carries stale totalPages=2 (page >= placeholder.totalPages!)
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Trang sau')
      );

      await waitFor(() => expect(requestedPages).toEqual([0, 1, 2]));
      await flushAsync(40);

      // Must NOT snap back to page 1 because placeholder carries stale totalPages=2; and must not render invalid Trang 3 / 2
      expect(container!.textContent).toContain('Cây Phân Trang #21');
      expect(container!.textContent).not.toContain('Trang 3 / 2');
      expect(requestedPages).toEqual([0, 1, 2]);

      await act(async () => {
        pendingPage2.resolve(undefined);
        await flushAsync(30);
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Phân Trang #41');
        expect(container!.textContent).toContain('Trang 3 / 3');
      });
    });

    it('Test 4: deleting one item on page 1 when remaining items still fill page 1 (25 -> 24, totalPages remains 2) keeps UI on page 1', async () => {
      await tokenStorage.saveSession(sessionA);
      let plantsDb = makePagedPlants(25);
      const requestedPlantPages: number[] = [];

      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens') {
          return {
            status: 200,
            data: { success: true, data: [{ ...gardenBalcony, plantCount: plantsDb.length }] },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: { success: true, data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, last: true } },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants' && config.method === 'get') {
          const p = (config.params ?? {}) as { page?: number; size?: number };
          const pageIdx = p.page ?? 0;
          const size = p.size ?? 20;
          requestedPlantPages.push(pageIdx);
          const totalElements = plantsDb.length;
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: plantsDb.slice(pageIdx * size, (pageIdx + 1) * size),
                page: pageIdx,
                size,
                totalElements,
                totalPages,
                last: totalPages === 0 || pageIdx + 1 >= totalPages,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-pg-25' && config.method === 'delete') {
          plantsDb = plantsDb.filter((item) => item.id !== 'plt-pg-25');
          return { status: 200, data: { success: true, data: { message: 'Deleted #25' } }, headers: {}, config };
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      mountWithRealAuth(<PlantsScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('25 cây sở hữu');
        expect(container!.textContent).toContain('Trang 1 / 2');
      });

      // Switch to page 1 (5 plants: #21..#25)
      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Trang sau')
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Phân Trang #21');
        expect(container!.textContent).toContain('Cây Phân Trang #25');
        expect(container!.textContent).toContain('Trang 2 / 2');
      });

      clickElement(container!.querySelector('[aria-label="Xóa Cây Phân Trang #25"]'));
      const buttons = alertSpy.mock.calls[0]?.[2] as { text?: string; onPress?: () => void }[] | undefined;
      act(() => {
        buttons?.find((b) => b.text === 'Xóa cây')?.onPress?.();
      });

      await waitFor(() => {
        expect(plantsDb).toHaveLength(24);
        expect(container!.textContent).toContain('24 cây sở hữu');
        expect(container!.textContent).not.toContain('Cây Phân Trang #25');
      });

      // Wait briefly to confirm page stays on 1 (does not reset back to page 0)
      await flushAsync(40);
      expect(requestedPlantPages.at(-1)).toBe(1);
      expect(container!.textContent).toContain('Cây Phân Trang #21');
      expect(container!.textContent).toContain('Cây Phân Trang #24');
      expect(container!.textContent).toContain('Trang 2 / 2');
      expect(container!.textContent).not.toContain('Cây Phân Trang #01');
    });

    it('also clamps SearchScreen (scope=owned) back to page 0 when last-page items are deleted', async () => {
      await tokenStorage.saveSession(sessionA);
      let plantsDb = makePagedPlants(21);
      const requestedOwnedPages: number[] = [];
      routeParamsState.current = { scope: 'owned' };

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/gardens') {
          return { status: 200, data: { success: true, data: [gardenBalcony] }, headers: {}, config };
        }
        if (config.url === '/plants' && config.method === 'get') {
          const p = (config.params ?? {}) as { page?: number; size?: number };
          const pageIdx = p.page ?? 0;
          const size = p.size ?? 20;
          requestedOwnedPages.push(pageIdx);
          const totalElements = plantsDb.length;
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: plantsDb.slice(pageIdx * size, (pageIdx + 1) * size),
                page: pageIdx,
                size,
                totalElements,
                totalPages,
                last: totalPages === 0 || pageIdx + 1 >= totalPages,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/plants/plt-pg-21' && config.method === 'delete') {
          plantsDb = plantsDb.filter((item) => item.id !== 'plt-pg-21');
          return { status: 200, data: { success: true, data: { message: 'Deleted #21' } }, headers: {}, config };
        }
        throw new Error(`Unexpected API call: ${config.method} ${config.url}`);
      });

      let deleteMut!: ReturnType<typeof useDeletePlantMutation>;
      function DeleteProbe() {
        deleteMut = useDeletePlantMutation();
        return null;
      }

      mountWithRealAuth(
        <>
          <DeleteProbe />
          <SearchScreen />
        </>
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây của tôi (21)');
        expect(container!.textContent).toContain('Trang 1 / 2');
      });

      clickElement(
        Array.from(container!.querySelectorAll('[role="button"]')).find((el) => el.textContent === 'Trang sau')
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây Phân Trang #21');
        expect(container!.textContent).toContain('Trang 2 / 2');
      });

      await act(async () => {
        await deleteMut.mutateAsync('plt-pg-21');
      });

      await waitFor(() => {
        expect(container!.textContent).toContain('Cây của tôi (20)');
        expect(container!.textContent).toContain('Cây Phân Trang #01');
        expect(container!.textContent).toContain('Cây Phân Trang #20');
        expect(requestedOwnedPages.at(-1)).toBe(0);
      });
      expect(container!.textContent).not.toContain('Cây Phân Trang #21');
      expect(container!.textContent).not.toContain('Trang 2 / 1');
    });
  });
});
