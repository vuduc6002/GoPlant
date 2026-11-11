import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { FilterScreen, SearchScreen } from '@/features/home/SearchScreens';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
import PlantDetailScreen from '@/features/plants/PlantDetailScreen';
import { FavoritesSection } from '@/features/species/FavoritesSection';
import {
  addFavoriteSpecies,
  getFavoriteSpecies,
  getSpeciesDetail,
  getSpeciesList,
  normalizeFavoriteSpeciesParams,
  normalizeSpeciesListParams,
  normalizeSpeciesSort,
  removeFavoriteSpecies,
} from '@/features/species/speciesApi';
import {
  _resetFavoriteLockForTests,
  useFavoritePendingState,
  useFavoriteSpecies,
  useFavoriteToggle,
  useSpeciesDetail,
  useSpeciesList,
} from '@/features/species/speciesHooks';
import type { SpeciesDetailDto, SpeciesSummaryDto } from '@/features/species/speciesTypes';
import { apiClient } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { AuthSession, PageResponse, UserProfileDto } from '@/services/api/apiTypes';
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
  id: 'usr_species_1',
  fullName: 'Nguyễn Minh An',
  email: 'an@goplant.vn',
  roles: ['ROLE_USER'],
};

const mockSession: AuthSession = {
  accessToken: 'jwt-species-token-123',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUser,
  savedAt: Date.now(),
};

const mockProfile: UserProfileDto = {
  id: 'usr_species_1',
  fullName: 'Nguyễn Minh An',
  email: 'an@goplant.vn',
  phoneNumber: null,
  recoveryEmail: null,
  preferredDevice: 'MOBILE',
  status: 'ACTIVE',
  avatarUrl: null,
  roles: ['ROLE_USER'],
  createdAt: '2026-01-01T00:00:00Z',
};

const speciesOne: SpeciesSummaryDto = {
  id: 'sp-1',
  commonName: 'Trầu bà lá xẻ',
  scientificName: 'Monstera deliciosa',
  category: 'Cây cảnh',
  difficulty: 'Dễ',
  thumbnailUrl: 'https://cdn.goplant.vn/monstera.jpg',
  isFavorited: false,
};

const speciesTwo: SpeciesSummaryDto = {
  id: 'sp-2',
  commonName: 'Húng quế ngọt',
  scientificName: 'Ocimum basilicum',
  category: 'Cây gia vị',
  difficulty: null,
  thumbnailUrl: null,
  isFavorited: true,
};

const speciesOneDetail: SpeciesDetailDto = {
  id: 'sp-1',
  commonName: 'Trầu bà lá xẻ',
  scientificName: 'Monstera deliciosa',
  category: 'Cây cảnh',
  difficulty: null,
  lightRequirement: 'Ánh sáng gián tiếp hoặc bán phần',
  waterRequirement: 'Tưới khi 2-3cm đất mặt khô',
  environment: 'Trong nhà',
  spaceRequirement: null,
  matureSize: '1 - 2m',
  temperatureRange: '18°C - 30°C',
  humidityRange: '60% - 80%',
  growingMedium: null,
  drainage: 'Thoát nước tốt',
  soilPh: null,
  sunTolerance: null,
  origin: 'Trung Mỹ',
  overview: 'Cây lá xẻ trang trí nội thất phổ biến.',
  morphology: null,
  lifespan: null,
  floweringSeason: null,
  usageAndCaution: 'Nhựa cây có thể gây kích ứng nhẹ nếu nuốt phải.',
  growthRate: null,
  wateringFrequency: '2 lần/tuần',
  nutrition: null,
  thumbnailUrl: 'https://cdn.goplant.vn/monstera.jpg',
  isFavorited: false,
  isActive: true,
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
  const input = el as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  act(() => {
    descriptor?.set?.call(input, nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function submitInput(el: Element | null | undefined) {
  if (!el) throw new Error('Input element not found');
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const form = el.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    }
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

describe('G5.3 Species & Favorites Integration', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    routeParamsState.current = {};
    _resetFavoriteLockForTests();
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
    _resetFavoriteLockForTests();
    tokenStorage._resetWebMemorySession();
    qc.clear();
    apiClient.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  describe('Species & Favorites API Layer + Parameter Sanitization', () => {
    it('normalizes pagination and sort allowlist safely before requesting GET /species', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      expect(
        normalizeSpeciesListParams({
          keyword: '  Monstera  ',
          category: 'Tất cả',
          page: -5,
          size: 500,
          sort: 'common_name,desc',
        })
      ).toEqual({
        keyword: 'Monstera',
        page: 0,
        size: 100,
        sort: 'commonName,asc',
      });

      expect(
        normalizeSpeciesListParams({
          category: ' Cây cảnh ',
          page: 1.9,
          size: 0,
          sort: 'scientificName,desc',
        })
      ).toEqual({
        category: 'Cây cảnh',
        page: 1,
        size: 1,
        sort: 'scientificName,desc',
      });

      expect(normalizeSpeciesSort('hackedField,desc')).toBe('commonName,asc');
      expect(normalizeFavoriteSpeciesParams({ page: -2, size: 999 })).toEqual({
        page: 0,
        size: 100,
      });

      const capturedRequests: { url?: string; params?: unknown; auth?: unknown }[] = [];
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        capturedRequests.push({
          url: config.url,
          params: config.params,
          auth: config.headers?.Authorization,
        });
        const pageData: PageResponse<SpeciesSummaryDto> = {
          content: [speciesOne, speciesTwo],
          page: 0,
          size: 20,
          totalElements: 2,
          totalPages: 1,
          last: true,
        };
        return Promise.resolve({
          status: 200,
          data: { success: true, data: pageData },
          headers: {},
          config,
        });
      });

      const result = await getSpeciesList({
        keyword: '  Trầu bà ',
        category: 'Tất cả',
        page: -1,
        size: 250,
        sort: 'common_name,asc',
      });

      expect(capturedRequests[0]).toEqual({
        url: '/species',
        params: {
          keyword: 'Trầu bà',
          page: 0,
          size: 100,
          sort: 'commonName,asc',
        },
        auth: 'Bearer jwt-species-token-123',
      });
      expect(result.content).toHaveLength(2);
      expect(result.content[1].difficulty).toBeNull();
    });

    it('fetches species detail, favorites page, and adds/removes favorites via apiClient', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      const calls: { method?: string; url?: string; params?: unknown }[] = [];
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        calls.push({
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params,
        });

        if (config.url === '/species/sp-1') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: speciesOneDetail },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          return Promise.resolve({
            status: 201,
            data: { success: true, data: { message: 'Đã thêm vào danh sách yêu thích.' } },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'delete') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { message: 'Đã bỏ khỏi danh sách yêu thích.' } },
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
                content: [speciesTwo],
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
        throw new Error(`Unexpected URL: ${config.url}`);
      });

      const detail = await getSpeciesDetail('sp-1');
      expect(detail.id).toBe('sp-1');
      expect(detail.soilPh).toBeNull();

      const added = await addFavoriteSpecies('sp-1');
      expect(added.message).toBe('Đã thêm vào danh sách yêu thích.');

      const removed = await removeFavoriteSpecies('sp-1');
      expect(removed.message).toBe('Đã bỏ khỏi danh sách yêu thích.');

      const favs = await getFavoriteSpecies({ page: 0, size: 20 });
      expect(favs.content[0].id).toBe('sp-2');
      expect(calls).toEqual([
        { method: 'GET', url: '/species/sp-1', params: undefined },
        { method: 'POST', url: '/species/sp-1/favorite', params: undefined },
        { method: 'DELETE', url: '/species/sp-1/favorite', params: undefined },
        { method: 'GET', url: '/species/favorites', params: { page: 0, size: 20 } },
      ]);
    });

    it('rejects empty speciesId locally without network call and propagates backend 404', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);
      const adapter = vi.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 404,
          data: {
            success: false,
            error: { code: 'RESOURCE_NOT_FOUND', message: 'Không tìm thấy Giống cây' },
          },
        },
        config: { url: '/species/missing-id' },
      });
      apiClient.defaults.adapter = adapter;

      await expect(getSpeciesDetail('   ')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
      expect(adapter).not.toHaveBeenCalled();

      await expect(getSpeciesDetail('missing-id')).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('Auth Gating, Cache Sync & Concurrency Guard in Hooks', () => {
    it('does NOT call Species or Favorites APIs while user is unauthenticated', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(null);
      const adapter = vi.fn();
      apiClient.defaults.adapter = adapter;

      function UnauthProbe() {
        const auth = useAuth();
        const list = useSpeciesList({ page: 0, size: 20 });
        const detail = useSpeciesDetail('sp-1');
        const favs = useFavoriteSpecies({ page: 0, size: 20 });
        return (
          <div data-auth={auth.status} data-list={list.fetchStatus} data-detail={detail.fetchStatus} data-fav={favs.fetchStatus} />
        );
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <UnauthProbe />
            </AuthProvider>
          </QueryClientProvider>
        );
      });
      await flushAsync(60);

      expect(adapter).not.toHaveBeenCalled();
    });

    it('syncs favorite state across lists, detail, and favorites cache, dedupes rapid taps, and reconciles 409 / 404 errors', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      let postFavCalls = 0;
      let force409 = false;
      let force404OnDelete = false;
      let isSp1FavOnServer = false;
      let isSp2FavOnServer = true;

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: mockProfile }, headers: {}, config };
        }
        if (config.url === '/species') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...speciesOne, isFavorited: isSp1FavOnServer }],
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
        if (config.url === '/species/sp-1') {
          return {
            status: 200,
            data: {
              success: true,
              data: { ...speciesOneDetail, isFavorited: isSp1FavOnServer },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/favorites') {
          const favItems: SpeciesSummaryDto[] = [];
          if (isSp1FavOnServer) favItems.push({ ...speciesOne, isFavorited: true });
          if (isSp2FavOnServer) favItems.push({ ...speciesTwo, isFavorited: true });
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: favItems,
                page: 0,
                size: 20,
                totalElements: favItems.length,
                totalPages: favItems.length ? 1 : 0,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          postFavCalls += 1;
          await new Promise((r) => setTimeout(r, 25));
          if (force409) {
            isSp1FavOnServer = true;
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 409,
                data: {
                  success: false,
                  error: { code: 'CONFLICT', message: 'Giống cây này đã có trong danh sách yêu thích của bạn.' },
                },
              },
              config,
            });
          }
          isSp1FavOnServer = true;
          return {
            status: 201,
            data: { success: true, data: { message: 'Đã thêm vào danh sách yêu thích.' } },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/sp-2/favorite' && config.method === 'delete') {
          if (force404OnDelete) {
            isSp2FavOnServer = false;
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 404,
                data: {
                  success: false,
                  error: { code: 'RESOURCE_NOT_FOUND', message: 'Giống cây chưa có trong danh sách yêu thích.' },
                },
              },
              config,
            });
          }
          isSp2FavOnServer = false;
          return {
            status: 200,
            data: { success: true, data: { message: 'Đã bỏ khỏi danh sách yêu thích.' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let favActions: ReturnType<typeof useFavoriteToggle> | null = null;
      function HookHarness() {
        useSpeciesList({ page: 0, size: 20 });
        useSpeciesDetail('sp-1');
        useFavoriteSpecies({ page: 0, size: 20 });
        favActions = useFavoriteToggle();
        return null;
      }

      act(() => {
        root!.render(
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <HookHarness />
            </AuthProvider>
          </QueryClientProvider>
        );
      });

      await waitFor(() => {
        expect(qc.getQueryData(queryKeys.species.detail(mockUser.id, 'sp-1'))).toBeDefined();
        expect(
          qc.getQueryData(queryKeys.species.list(mockUser.id, { page: 0, size: 20, sort: 'commonName,asc' }))
        ).toBeDefined();
        expect(qc.getQueryData(queryKeys.species.favorites(mockUser.id, { page: 0, size: 20 }))).toBeDefined();
      });

      // Concurrent double-call for sp-1 dispatches ONLY ONE POST request
      await act(async () => {
        const p1 = favActions!.toggleFavorite('sp-1', false);
        const p2 = favActions!.toggleFavorite('sp-1', false);
        await Promise.all([p1, p2]);
      });

      expect(postFavCalls).toBe(1);

      const listKey = queryKeys.species.list(mockUser.id, { page: 0, size: 20, sort: 'commonName,asc' });
      await waitFor(() => {
        expect(qc.getQueryData<PageResponse<SpeciesSummaryDto>>(listKey)?.content[0].isFavorited).toBe(true);
        expect(qc.getQueryData<SpeciesDetailDto>(queryKeys.species.detail(mockUser.id, 'sp-1'))?.isFavorited).toBe(true);
        expect(
          qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
            queryKeys.species.favorites(mockUser.id, { page: 0, size: 20 })
          )?.totalElements
        ).toBe(2);
      });

      // Simulate stale cache where UI thinks sp-1 is not favorited and hits 409 Conflict
      force409 = true;
      await act(async () => {
        try {
          await favActions!.toggleFavorite('sp-1', false);
          throw new Error('Expected 409 error');
        } catch (err) {
          expect(err).toBeInstanceOf(AppApiError);
          expect((err as AppApiError).statusCode).toBe(409);
        }
      });
      // Cache stays reconciled to isFavorited = true (not rolled back to false!)
      expect(
        qc.getQueryData<SpeciesDetailDto>(queryKeys.species.detail(mockUser.id, 'sp-1'))?.isFavorited
      ).toBe(true);

      // Simulate DELETE hitting 404 (already removed on server): reconciles favorites cache by removing sp-2
      force404OnDelete = true;
      await act(async () => {
        try {
          await favActions!.toggleFavorite('sp-2', true);
          throw new Error('Expected 404 error');
        } catch (err) {
          expect(err).toBeInstanceOf(AppApiError);
          expect((err as AppApiError).statusCode).toBe(404);
        }
      });
      await waitFor(() => {
        const remainingFavIds =
          qc
            .getQueryData<PageResponse<SpeciesSummaryDto>>(
              queryKeys.species.favorites(mockUser.id, { page: 0, size: 20 })
            )
            ?.content.map((item) => item.id) ?? [];
        expect(remainingFavIds).not.toContain('sp-2');
        expect(remainingFavIds).toContain('sp-1');
      });
    });
  });

  describe('UI Screen Integration: SearchScreen, FilterScreen, PlantDetailScreen, FavoritesSection', () => {
    function setupAuthenticatedApp(ui: React.ReactElement) {
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

    it('SearchScreen searches backend /species, resets pagination on filter/keyword change, paginates, toggles favorites, and navigates with speciesId', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});

      const requestedSpeciesParams: Record<string, unknown>[] = [];
      let favStateSp1 = false;

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/species') {
          const p = (config.params ?? {}) as Record<string, unknown>;
          requestedSpeciesParams.push(p);

          if (p.keyword === 'khongco') {
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

          if (p.page === 1) {
            return Promise.resolve({
              status: 200,
              data: {
                success: true,
                data: {
                  content: [speciesTwo],
                  page: 1,
                  size: 20,
                  totalElements: 21,
                  totalPages: 2,
                  last: true,
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
                content: [{ ...speciesOne, isFavorited: favStateSp1 }],
                page: 0,
                size: 20,
                totalElements: 21,
                totalPages: 2,
                last: false,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          favStateSp1 = true;
          return Promise.resolve({
            status: 201,
            data: { success: true, data: { message: 'Đã thêm vào danh sách yêu thích.' } },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/favorites') {
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

      setupAuthenticatedApp(<SearchScreen />);

      // Renders initial page=0 backend result (NOT hardcoded local plantCatalog)
      await waitFor(() => {
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
        expect(container!.textContent).toContain('Monstera deliciosa');
        expect(container!.textContent).toContain('Trang 1 / 2');
      });
      expect(requestedSpeciesParams[0]).toEqual({
        page: 0,
        size: 20,
        sort: 'commonName,asc',
      });

      // Advance to page 1 (Trang sau)
      const nextBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Trang sau')
      );
      clickElement(nextBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Húng quế ngọt');
        expect(container!.textContent).toContain('Độ khó: Chưa có dữ liệu');
        expect(requestedSpeciesParams.at(-1)?.page).toBe(1);
      });

      // Selecting category resets page back to 0!
      const catBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Cây cảnh'
      );
      clickElement(catBtn);

      await waitFor(() => {
        expect(requestedSpeciesParams.at(-1)).toMatchObject({
          category: 'Cây cảnh',
          page: 0,
        });
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
      });

      // Favorite toggle
      const favBtn = container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]');
      clickElement(favBtn);

      await waitFor(() => {
        expect(container!.querySelector('[aria-label="Bỏ yêu thích Trầu bà lá xẻ"]')).toBeTruthy();
      });

      // View detail passes speciesId
      const detailBtn = container!.querySelector('[aria-label="Xem chi tiết Trầu bà lá xẻ"]');
      clickElement(detailBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/plant-detail',
        params: { speciesId: 'sp-1' },
      });

      // Add-plant button previews G5.4 cleanly without breaking
      const addPreviewBtn = container!.querySelector(
        '[aria-label="Thêm Trầu bà lá xẻ vào cây của tôi"]'
      );
      clickElement(addPreviewBtn);
      expect(alertSpy).toHaveBeenCalled();

      // Empty backend result renders empty UI (no fallback mock plants!)
      const searchInput = container!.querySelector('[aria-label="Ô tìm kiếm loài cây"]');
      changeInputValue(searchInput, 'khongco');
      submitInput(searchInput);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không tìm thấy loài cây phù hợp');
      });
      expect(container!.textContent).not.toContain('Philodendron pedatum');
    });

    it('SearchScreen shows retryable error card when GET /species fails', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      let shouldFail = true;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/species') {
          if (shouldFail) {
            return Promise.reject({
              isAxiosError: true,
              response: {
                status: 400,
                data: {
                  success: false,
                  error: { code: 'BAD_REQUEST', message: 'Tham số truy vấn không hợp lệ' },
                },
              },
              config,
            });
          }
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [speciesOne],
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
        throw new Error(`Unexpected call: ${config.url}`);
      });

      setupAuthenticatedApp(<SearchScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không thể tải thư viện loài cây');
        expect(container!.textContent).toContain('Tham số truy vấn không hợp lệ');
      });

      shouldFail = false;
      const retryBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Thử lại'
      );
      clickElement(retryBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
      });
    });

    it('FilterScreen shows only backend-supported filters for catalog scope and passes selections back to /search', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/species') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: [speciesTwo],
                page: 0,
                size: 1,
                totalElements: 4,
                totalPages: 4,
                last: false,
              },
            },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      setupAuthenticatedApp(<FilterScreen />);

      // Explicitly notes unsupported ecological filters are hidden and renders live backend count preview
      await waitFor(() => {
        expect(container!.textContent).toContain('Nhóm loài cây (hỗ trợ API)');
        expect(container!.textContent).toContain('chưa được API GET /api/v1/species hỗ trợ');
        expect(container!.textContent).toContain('4 loài cây phù hợp');
        expect(container!.textContent).toContain('Áp dụng lọc • 4 cây');
      });
      expect(container!.textContent).not.toContain('Độ pH đất');

      const herbOption = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Cây gia vị'
      );
      clickElement(herbOption);

      const applyBtn = Array.from(container!.querySelectorAll('[role="button"]')).find((el) =>
        el.textContent?.includes('Áp dụng lọc')
      );
      clickElement(applyBtn);

      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/search',
        params: {
          query: '',
          category: 'Cây gia vị',
          sort: 'commonName,asc',
          scope: 'catalog',
          filters: '{}',
        },
      });
    });

    it('PlantDetailScreen renders real species data with null fallback, handles 404 cleanly without plantCatalog fallback, and toggles favorite', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);
      routeParamsState.current = { speciesId: 'sp-1' };

      let isFav = false;
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/species/sp-1') {
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { ...speciesOneDetail, isFavorited: isFav } },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/sp-404') {
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 404,
              data: {
                success: false,
                error: { code: 'RESOURCE_NOT_FOUND', message: 'Không tìm thấy giống cây yêu cầu' },
              },
            },
            config,
          });
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          isFav = true;
          return Promise.resolve({
            status: 201,
            data: { success: true, data: { message: 'Đã thêm vào danh sách yêu thích.' } },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/favorites') {
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

      setupAuthenticatedApp(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
        expect(container!.textContent).toContain('Trung Mỹ');
        expect(container!.textContent).toContain('Độ pH đấtChưa có dữ liệu');
      });

      const favHeaderBtn = container!.querySelector('[aria-label="Thêm yêu thích"]');
      clickElement(favHeaderBtn);

      await waitFor(() => {
        expect(container!.querySelector('[aria-label="Bỏ yêu thích"]')).toBeTruthy();
      });

      // Now verify 404 missing species does not fall back to local catalog
      act(() => {
        root?.unmount();
      });
      root = createRoot(container!);
      routeParamsState.current = { speciesId: 'sp-404' };
      setupAuthenticatedApp(<PlantDetailScreen />);

      await waitFor(() => {
        expect(container!.textContent).toContain('Không tìm thấy loài cây');
      });
      expect(container!.textContent).not.toContain('Monstera deliciosa');
    });

    it('FavoritesSection displays paginated favorites, removes favorite via DELETE API, and opens detail with speciesId', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(mockSession.accessToken);

      let favItems: SpeciesSummaryDto[] = [{ ...speciesOne, isFavorited: true }, speciesTwo];
      apiClient.defaults.adapter = vi.fn().mockImplementation((config) => {
        if (config.url === '/users/me') {
          return Promise.resolve({ status: 200, data: { success: true, data: mockProfile }, headers: {}, config });
        }
        if (config.url === '/species/favorites') {
          return Promise.resolve({
            status: 200,
            data: {
              success: true,
              data: {
                content: favItems,
                page: 0,
                size: 20,
                totalElements: favItems.length,
                totalPages: favItems.length ? 1 : 0,
                last: true,
              },
            },
            headers: {},
            config,
          });
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'delete') {
          favItems = favItems.filter((item) => item.id !== 'sp-1');
          return Promise.resolve({
            status: 200,
            data: { success: true, data: { message: 'Đã bỏ khỏi danh sách yêu thích.' } },
            headers: {},
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.url}`);
      });

      setupAuthenticatedApp(<FavoritesSection />);

      await waitFor(() => {
        expect(container!.textContent).toContain('2 loài đã lưu');
        expect(container!.textContent).toContain('Trầu bà lá xẻ');
        expect(container!.textContent).toContain('Húng quế ngọt');
      });

      const openDetailBtn = container!.querySelector('[aria-label="Xem chi tiết Trầu bà lá xẻ"]');
      clickElement(openDetailBtn);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/plant-detail',
        params: { speciesId: 'sp-1' },
      });

      const removeFavBtn = container!.querySelector('[aria-label="Bỏ yêu thích Trầu bà lá xẻ"]');
      clickElement(removeFavBtn);

      await waitFor(() => {
        expect(container!.textContent).toContain('1 loài đã lưu');
        expect(container!.textContent).not.toContain('Trầu bà lá xẻ');
      });
      expect(container!.textContent).toContain('Húng quế ngọt');
    });
  });

  describe('G5.3.1 Favorites Serialization & Concurrency Safety (Section 3.3)', () => {
    function setupApp(ui: React.ReactElement) {
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

    it('serializes favorite operations across species, prevents multi-species rollback race, disables all UI heart buttons while pending, and unlocks for subsequent species B', async () => {
      await tokenStorage.saveSession(mockSession);

      const postADeferred = createDeferred<unknown>();
      const delBDeferred = createDeferred<unknown>();
      let postACalls = 0;
      let deleteBCalls = 0;
      let sp1ServerFav = false;
      let sp2ServerFav = true;

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: mockProfile }, headers: {}, config };
        }
        if (config.url === '/species') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [
                  { ...speciesOne, isFavorited: sp1ServerFav },
                  { ...speciesTwo, isFavorited: sp2ServerFav },
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
          };
        }
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: sp2ServerFav ? [{ ...speciesTwo, isFavorited: true }] : [],
                page: 0,
                size: 20,
                totalElements: sp2ServerFav ? 1 : 0,
                totalPages: sp2ServerFav ? 1 : 0,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          postACalls += 1;
          await postADeferred.promise;
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 500,
              data: {
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Lỗi hệ thống tạm thời' },
              },
            },
            config,
          });
        }
        if (config.url === '/species/sp-2/favorite' && config.method === 'delete') {
          deleteBCalls += 1;
          await delBDeferred.promise;
          sp2ServerFav = false;
          return {
            status: 200,
            data: { success: true, data: { message: 'Đã bỏ khỏi danh sách yêu thích.' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let favToggle!: ReturnType<typeof useFavoriteToggle>;
      let pendingState!: ReturnType<typeof useFavoritePendingState>;
      function Probe() {
        favToggle = useFavoriteToggle();
        pendingState = useFavoritePendingState();
        return null;
      }

      setupApp(
        <>
          <Probe />
          <SearchScreen />
        </>
      );

      await waitFor(() => {
        expect(container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]')).toBeTruthy();
        expect(container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]')).toBeTruthy();
      });

      // 1. Trigger Species A add-favorite (held pending) + tap A again -> ONLY 1 POST dispatched, same Promise returned
      let pA1!: Promise<unknown>;
      let pA2!: Promise<unknown>;
      act(() => {
        const rawA1 = favToggle.toggleFavorite('sp-1', false);
        const rawA2 = favToggle.toggleFavorite('sp-1', false);
        expect(rawA1).toBe(rawA2);
        pA1 = rawA1.catch((err) => err);
        pA2 = rawA2.catch((err) => err);
      });
      void pA2;

      await waitFor(() => {
        expect(postACalls).toBe(1);
        expect(pendingState.isAnyPending).toBe(true);
        expect(pendingState.activeSpeciesId).toBe('sp-1');
        expect(pendingState.isSpeciesPending('sp-1')).toBe(true);
        expect(pendingState.isSpeciesPending('sp-2')).toBe(false);
      });

      // 2. While A is pending, ALL heart buttons in SearchScreen (including Species B) are disabled
      const heartA = container!.querySelector('[aria-label="Bỏ yêu thích Trầu bà lá xẻ"], [aria-label="Yêu thích Trầu bà lá xẻ"]');
      const heartB = container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]');
      expect(heartA?.getAttribute('aria-disabled')).toBe('true');
      expect(heartB?.getAttribute('aria-disabled')).toBe('true');
      expect(heartA?.textContent).toBe('…');
      expect(heartB?.textContent).toBe('♥');

      // Clicking disabled Species B button in DOM causes zero API calls & zero unhandled rejections
      clickElement(heartB);
      expect(deleteBCalls).toBe(0);

      // 3. Programmatically attempting Species B while A is pending MUST NOT send B and MUST NOT return A's Promise
      let pB!: Promise<unknown>;
      await act(async () => {
        pB = favToggle.toggleFavorite('sp-2', true);
        expect(pB).not.toBe(pA1);
        await expect(pB).rejects.toMatchObject({ code: 'FAVORITE_OPERATION_IN_PROGRESS' });
      });
      expect(deleteBCalls).toBe(0);

      // 4. Reject Species A with HTTP 500 -> rolls back sp-1 cleanly without corrupting sp-2, and unlocks ALL heart buttons
      await act(async () => {
        postADeferred.resolve(undefined);
        await pA1;
      });

      await waitFor(() => {
        expect(pendingState.isAnyPending).toBe(false);
        expect(pendingState.activeSpeciesId).toBeNull();
        const unlockedA = container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]');
        const unlockedB = container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]');
        expect(unlockedA?.getAttribute('aria-disabled')).not.toBe('true');
        expect(unlockedB?.getAttribute('aria-disabled')).not.toBe('true');
      });

      const listData = qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
        queryKeys.species.list(mockUser.id, { page: 0, size: 20, sort: 'commonName,asc' })
      );
      expect(listData?.content.find((i) => i.id === 'sp-1')?.isFavorited).toBe(false);
      expect(listData?.content.find((i) => i.id === 'sp-2')?.isFavorited).toBe(true);

      // 5. After A completed/settled, Species B can now execute cleanly!
      let pBNext!: Promise<unknown>;
      act(() => {
        pBNext = favToggle.toggleFavorite('sp-2', true);
      });
      await waitFor(() => {
        expect(deleteBCalls).toBe(1);
        expect(pendingState.activeSpeciesId).toBe('sp-2');
      });
      await act(async () => {
        delBDeferred.resolve(undefined);
        await pBNext;
      });
      await waitFor(() => {
        expect(pendingState.isAnyPending).toBe(false);
        expect(container!.querySelector('[aria-label="Yêu thích Húng quế ngọt"]')).toBeTruthy();
      });
    });

    it('disables heart buttons in FavoritesSection & PlantDetailScreen while another species favorite op is active', async () => {
      await tokenStorage.saveSession(mockSession);

      const postDeferred = createDeferred<unknown>();
      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: mockProfile }, headers: {}, config };
        }
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...speciesOne, isFavorited: true }, speciesTwo],
                page: 0,
                size: 20,
                totalElements: 2,
                totalPages: 1,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/sp-1') {
          return {
            status: 200,
            data: { success: true, data: speciesOneDetail },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/sp-99/favorite' && config.method === 'post') {
          await postDeferred.promise;
          return {
            status: 201,
            data: { success: true, data: { message: 'Đã thêm vào danh sách yêu thích.' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected: ${config.method} ${config.url}`);
      });

      routeParamsState.current = { speciesId: 'sp-1' };
      let favToggle!: ReturnType<typeof useFavoriteToggle>;
      function Control() {
        favToggle = useFavoriteToggle();
        return null;
      }

      setupApp(
        <>
          <Control />
          <FavoritesSection />
          <PlantDetailScreen />
        </>
      );

      await waitFor(() => {
        expect(container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]')).toBeTruthy();
        expect(container!.querySelector('[aria-label="Thêm yêu thích"]')).toBeTruthy();
      });

      let op!: Promise<unknown>;
      act(() => {
        op = favToggle.toggleFavorite('sp-99', false);
      });

      await waitFor(() => {
        const favBtnSp2 = container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]');
        const detailHeartBtn = container!.querySelector('[aria-label="Thêm yêu thích"]');
        expect(favBtnSp2?.getAttribute('aria-disabled')).toBe('true');
        expect(detailHeartBtn?.getAttribute('aria-disabled')).toBe('true');
      });

      await act(async () => {
        postDeferred.resolve(undefined);
        await op;
      });

      await waitFor(() => {
        const favBtnSp2 = container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]');
        const detailHeartBtn = container!.querySelector('[aria-label="Thêm yêu thích"]');
        expect(favBtnSp2?.getAttribute('aria-disabled')).not.toBe('true');
        expect(detailHeartBtn?.getAttribute('aria-disabled')).not.toBe('true');
      });
    });

    it('releases pending lock in finally on network error, timeout error, and 5xx without ever leaving pending state stuck', async () => {
      await tokenStorage.saveSession(mockSession);

      let mode: 'network' | 'timeout' | 'server500' = 'network';
      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: mockProfile }, headers: {}, config };
        }
        if (config.url === '/species/sp-1/favorite') {
          if (mode === 'network') {
            return Promise.reject({ isAxiosError: true, message: 'Network Error', config });
          }
          if (mode === 'timeout') {
            return Promise.reject({
              isAxiosError: true,
              code: 'ECONNABORTED',
              message: 'timeout of 15000ms exceeded',
              config,
            });
          }
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 502,
              data: { success: false, error: { code: 'BAD_GATEWAY', message: 'Upstream down' } },
            },
            config,
          });
        }
        throw new Error(`Unexpected: ${config.url}`);
      });

      let favToggle!: ReturnType<typeof useFavoriteToggle>;
      function Probe() {
        favToggle = useFavoriteToggle();
        return null;
      }

      setupApp(<Probe />);
      await waitFor(() => expect(favToggle).toBeDefined());
      await flushAsync(40);

      for (const nextMode of ['network', 'timeout', 'server500'] as const) {
        mode = nextMode;
        await act(async () => {
          await expect(favToggle.toggleFavorite('sp-1', false)).rejects.toBeInstanceOf(AppApiError);
        });
        expect(favToggle.isAnyFavoritePending).toBe(false);
        expect(favToggle.isSpeciesPending('sp-1')).toBe(false);
      }
    });

    it('reconciles 409/404 to server truth while throwing AppApiError to UI cleanly and releasing lock', async () => {
      await tokenStorage.saveSession(mockSession);

      let favoritesOnServer: SpeciesSummaryDto[] = [{ ...speciesOne, isFavorited: true }, speciesTwo];
      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: mockProfile }, headers: {}, config };
        }
        if (config.url === '/species') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...speciesOne, isFavorited: false }],
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
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: favoritesOnServer,
                page: 0,
                size: 20,
                totalElements: favoritesOnServer.length,
                totalPages: favoritesOnServer.length ? 1 : 0,
                last: true,
              },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          favoritesOnServer = [{ ...speciesOne, isFavorited: true }, speciesTwo];
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 409,
              data: { success: false, error: { code: 'CONFLICT', message: 'Đã tồn tại trong yêu thích.' } },
            },
            config,
          });
        }
        if (config.url === '/species/sp-2/favorite' && config.method === 'delete') {
          favoritesOnServer = favoritesOnServer.filter((s) => s.id !== 'sp-2');
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 404,
              data: { success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Chưa có trong yêu thích.' } },
            },
            config,
          });
        }
        throw new Error(`Unexpected: ${config.method} ${config.url}`);
      });

      setupApp(
        <>
          <SearchScreen />
          <FavoritesSection />
        </>
      );

      await waitFor(() => {
        expect(container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]')).toBeTruthy();
        expect(container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]')).toBeTruthy();
      });

      // Trigger 409 Conflict from SearchScreen UI
      clickElement(container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]'));
      await waitFor(() => {
        expect(container!.textContent).toContain('Loài cây đã có trong danh sách yêu thích, đã đồng bộ trạng thái mới nhất.');
        // Heart button reflects server truth (favorited) & unlocked
        const syncedHeart = container!.querySelector('[aria-label="Bỏ yêu thích Trầu bà lá xẻ"]');
        expect(syncedHeart).toBeTruthy();
        expect(syncedHeart?.getAttribute('aria-disabled')).not.toBe('true');
      });

      // Trigger 404 Not Found from FavoritesSection UI
      clickElement(container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]'));
      await waitFor(() => {
        expect(container!.textContent).toContain('Loài cây này không còn trong danh sách yêu thích, đã đồng bộ lại dữ liệu.');
      });
    });

    it('clears pending favorite lock immediately on logout and produces zero cross-account or unauthenticated cache writes when late promise settles', async () => {
      await tokenStorage.saveSession(mockSession);
      const pendingDeferred = createDeferred<unknown>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: mockProfile }, headers: {}, config };
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          await pendingDeferred.promise;
          return {
            status: 201,
            data: { success: true, data: { message: 'Late resolve after logout' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected: ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let favToggle!: ReturnType<typeof useFavoriteToggle>;
      function Probe() {
        authCtx = useAuth();
        favToggle = useFavoriteToggle();
        return null;
      }

      setupApp(<Probe />);
      await waitFor(() => expect(authCtx.status).toBe('authenticated'));

      let pendingPromise!: Promise<unknown>;
      act(() => {
        pendingPromise = favToggle.toggleFavorite('sp-1', false).catch((err) => err);
      });
      await waitFor(() => expect(favToggle.isAnyFavoritePending).toBe(true));

      // Logout while POST is still pending
      await act(async () => {
        await authCtx.logout();
      });

      expect(authCtx.status).toBe('unauthenticated');
      expect(favToggle.isAnyFavoritePending).toBe(false);

      // Now resolve the stale POST from before logout
      await act(async () => {
        pendingDeferred.resolve(undefined);
        await pendingPromise;
      });

      // Must have created zero cache entries under __unauthenticated__ or another account
      expect(
        qc.getQueriesData({ queryKey: queryKeys.species.all('__unauthenticated__') })
      ).toHaveLength(0);
      expect(qc.getQueryData(queryKeys.species.detail(mockUser.id, 'sp-1'))).toBeUndefined();
    });
  });

  describe('G5.3.1 Account Switch Cache Isolation Regression (Section 5 - Species & Favorites)', () => {
    const userA = {
      id: 'usr_account_a',
      fullName: 'Người Dùng A',
      email: 'a@goplant.vn',
      roles: ['ROLE_USER'],
    };
    const userB = {
      id: 'usr_account_b',
      fullName: 'Người Dùng B',
      email: 'b@goplant.vn',
      roles: ['ROLE_USER'],
    };
    const sessionA: AuthSession = {
      accessToken: 'jwt-user-a-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: userA,
      savedAt: Date.now(),
    };
    const sessionB: AuthSession = {
      accessToken: 'jwt-user-b-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: userB,
      savedAt: Date.now(),
    };
    const profileA: UserProfileDto = { ...mockProfile, ...userA };
    const profileB: UserProfileDto = { ...mockProfile, ...userB };

    function renderWithRealAuth(ui: React.ReactElement) {
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

    it('Section 5 Test 1 & Test 5: isolates Species list, Species detail & Favorites cache between User A and User B via mounted query hooks', async () => {
      await tokenStorage.saveSession(sessionA);

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const authHeader = config.headers?.Authorization as string | undefined;
        const isA = authHeader === `Bearer ${sessionA.accessToken}`;
        const isB = authHeader === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login' && config.method === 'post') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return {
            status: 200,
            data: { success: true, data: isB ? profileB : profileA },
            headers: {},
            config,
          };
        }
        if (config.url === '/species') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...speciesOne, isFavorited: isA }],
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
        if (config.url === '/species/sp-1') {
          return {
            status: 200,
            data: {
              success: true,
              data: { ...speciesOneDetail, isFavorited: isA },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: isB ? [{ ...speciesTwo, isFavorited: true }] : [{ ...speciesOne, isFavorited: true }],
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
        throw new Error(`Unexpected request: ${config.url} auth=${authHeader}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let listResult!: ReturnType<typeof useSpeciesList>;
      let detailResult!: ReturnType<typeof useSpeciesDetail>;
      let favResult!: ReturnType<typeof useFavoriteSpecies>;

      function SpeciesHooksProbe() {
        authCtx = useAuth();
        listResult = useSpeciesList({ page: 0, size: 20 });
        detailResult = useSpeciesDetail('sp-1');
        favResult = useFavoriteSpecies({ page: 0, size: 20 });
        return null;
      }

      renderWithRealAuth(<SpeciesHooksProbe />);

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userA.id);
        expect(listResult.data?.content[0].isFavorited).toBe(true);
        expect(detailResult.data?.isFavorited).toBe(true);
        expect(favResult.data?.content[0].id).toBe('sp-1');
      });

      // Verify cache entries carry User A key identity
      expect(
        qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
          queryKeys.species.list(userA.id, { page: 0, size: 20, sort: 'commonName,asc' })
        )?.content[0].isFavorited
      ).toBe(true);
      expect(
        qc.getQueryData<SpeciesDetailDto>(queryKeys.species.detail(userA.id, 'sp-1'))?.isFavorited
      ).toBe(true);
      expect(
        qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
          queryKeys.species.favorites(userA.id, { page: 0, size: 20 })
        )?.content[0].id
      ).toBe('sp-1');

      // Switch to User B on the EXACT same QueryClient (without calling qc.clear)
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(listResult.data?.content[0].isFavorited).toBe(false);
        expect(detailResult.data?.isFavorited).toBe(false);
        expect(favResult.data?.content[0].id).toBe('sp-2');
      });

      // Verify Test 5 via live mounted query cache entries: distinct keys for A vs B
      const allKeys = qc.getQueryCache().getAll().map((q) => q.queryKey);
      expect(allKeys).toContainEqual(
        queryKeys.species.list(userA.id, { page: 0, size: 20, sort: 'commonName,asc' })
      );
      expect(allKeys).toContainEqual(
        queryKeys.species.list(userB.id, { page: 0, size: 20, sort: 'commonName,asc' })
      );
      expect(allKeys).toContainEqual(queryKeys.species.detail(userA.id, 'sp-1'));
      expect(allKeys).toContainEqual(queryKeys.species.detail(userB.id, 'sp-1'));
      expect(allKeys).toContainEqual(queryKeys.species.favorites(userA.id, { page: 0, size: 20 }));
      expect(allKeys).toContainEqual(queryKeys.species.favorites(userB.id, { page: 0, size: 20 }));

      // User A cache remains intact in its own namespace while User B sees ONLY B data
      expect(
        qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
          queryKeys.species.favorites(userA.id, { page: 0, size: 20 })
        )?.content[0].id
      ).toBe('sp-1');
      expect(
        qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
          queryKeys.species.favorites(userB.id, { page: 0, size: 20 })
        )?.content[0].id
      ).toBe('sp-2');
    });

    it('Section 5 Test 2 (Add resolved late): pending User A add-favorite resolved after switching to User B does NOT alter User B cache or UI', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingAddA = createDeferred<unknown>();
      let favFetchCountB = 0;

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const authHeader = config.headers?.Authorization as string | undefined;
        const isB = authHeader === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login' && config.method === 'post') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/species') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...speciesOne, isFavorited: false }],
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
        if (config.url === '/species/favorites') {
          if (isB) favFetchCountB += 1;
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
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          await pendingAddA.promise;
          return {
            status: 201,
            data: { success: true, data: { message: 'Đã thêm vào danh sách yêu thích.' } },
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

      renderWithRealAuth(
        <>
          <Probe />
          <SearchScreen />
          <FavoritesSection />
        </>
      );

      await waitFor(() => {
        expect(container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]')).toBeTruthy();
        expect(container!.textContent).toContain('0 loài đã lưu');
      });

      // User A clicks favorite on sp-1 (optimistic on User A, POST pending)
      clickElement(container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]'));
      await waitFor(() => expect(container!.querySelector('[aria-label="Bỏ yêu thích Trầu bà lá xẻ"]')?.textContent).toBe('…'));

      // Switch to User B while User A's POST is pending
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(favFetchCountB).toBeGreaterThanOrEqual(1);
        expect(container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]')).toBeTruthy();
        expect(container!.textContent).toContain('0 loài đã lưu');
      });
      const favCountBeforeLateResolve = favFetchCountB;

      // Resolve old request of A
      await act(async () => {
        pendingAddA.resolve(undefined);
      });
      await flushAsync(40);

      // User B cache and UI remain completely unchanged
      expect(favFetchCountB).toBe(favCountBeforeLateResolve);
      expect(
        qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
          queryKeys.species.favorites(userB.id, { page: 0, size: 20 })
        )?.totalElements
      ).toBe(0);
      expect(
        qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
          queryKeys.species.list(userB.id, { page: 0, size: 20, sort: 'commonName,asc' })
        )?.content[0].isFavorited
      ).toBe(false);
      expect(container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]')).toBeTruthy();
      expect(container!.querySelector('[aria-label="Bỏ yêu thích Trầu bà lá xẻ"]')).toBeNull();
    });

    it('Section 5 Test 2 (Remove resolved late & Failed error settled late): stale User A callbacks never corrupt User B favorites, species cache, or UI error state', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingRemoveA = createDeferred<unknown>();
      const pendingFailA = createDeferred<unknown>();
      let serverFavoritesB: SpeciesSummaryDto[] = [{ ...speciesTwo, isFavorited: true }];

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
        if (config.url === '/species/favorites') {
          const items = isB ? serverFavoritesB : [{ ...speciesTwo, isFavorited: true }];
          return {
            status: 200,
            data: {
              success: true,
              data: { content: items, page: 0, size: 20, totalElements: items.length, totalPages: 1, last: true },
            },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/sp-2/favorite' && config.method === 'delete') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          await pendingRemoveA.promise;
          return {
            status: 200,
            data: { success: true, data: { message: 'Removed A' } },
            headers: {},
            config,
          };
        }
        if (config.url === '/species/sp-1/favorite' && config.method === 'post') {
          expect(authHeader).toBe(`Bearer ${sessionA.accessToken}`);
          await pendingFailA.promise;
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 500,
              data: { success: false, error: { code: 'SERVER_ERROR', message: 'Lỗi từ session A' } },
            },
            config,
          });
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let favToggle!: ReturnType<typeof useFavoriteToggle>;
      function Probe() {
        authCtx = useAuth();
        favToggle = useFavoriteToggle();
        return null;
      }

      renderWithRealAuth(
        <>
          <Probe />
          <FavoritesSection />
        </>
      );

      await waitFor(() => {
        expect(container!.textContent).toContain('Húng quế ngọt');
      });

      // Part 1: User A clicks remove favorite on sp-2
      clickElement(container!.querySelector('[aria-label="Bỏ yêu thích Húng quế ngọt"]'));
      await waitFor(() => expect(favToggle.isAnyFavoritePending).toBe(true));

      // Switch to User B (who ALSO has sp-2 favorited)
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(container!.textContent).toContain('Húng quế ngọt');
      });

      // Resolve User A's stale DELETE -> User B MUST still have sp-2!
      await act(async () => {
        pendingRemoveA.resolve(undefined);
      });
      await flushAsync(40);

      expect(
        qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
          queryKeys.species.favorites(userB.id, { page: 0, size: 20 })
        )?.content.map((i) => i.id)
      ).toEqual(['sp-2']);
      expect(container!.textContent).toContain('Húng quế ngọt');

      // Part 2: User B also adds something or holds state; switch back to User A and trigger a failing POST pending across switch to User B
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userA.email, password: 'Password123@' });
      });
      await waitFor(() => expect(authCtx.user?.id).toBe(userA.id));

      let failedPromiseA!: Promise<unknown>;
      act(() => {
        failedPromiseA = favToggle.toggleFavorite('sp-1', false).catch((err) => err);
      });
      await waitFor(() => expect(favToggle.isSpeciesPending('sp-1')).toBe(true));

      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });
      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(container!.textContent).toContain('Húng quế ngọt');
      });

      // Resolve deferred failure for User A's POST -> must NOT roll back B's favorites or show 'Lỗi từ session A' on B UI
      await act(async () => {
        pendingFailA.resolve(undefined);
        await failedPromiseA;
      });
      await flushAsync(40);

      expect(container!.textContent).not.toContain('Lỗi từ session A');
      expect(container!.textContent).toContain('Húng quế ngọt');
      expect(
        qc.getQueryData<PageResponse<SpeciesSummaryDto>>(
          queryKeys.species.favorites(userB.id, { page: 0, size: 20 })
        )?.content.map((i) => i.id)
      ).toEqual(['sp-2']);
    });
  });

  describe('G5.3.1.2 Owner-Scoped Placeholder Isolation Regression (Section 4.B)', () => {
    const userA = {
      id: 'usr_placeholder_a',
      fullName: 'Người Dùng A',
      email: 'placeholder-a@goplant.vn',
      roles: ['ROLE_USER'],
    };
    const userB = {
      id: 'usr_placeholder_b',
      fullName: 'Người Dùng B',
      email: 'placeholder-b@goplant.vn',
      roles: ['ROLE_USER'],
    };
    const sessionA: AuthSession = {
      accessToken: 'jwt-placeholder-a',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: userA,
      savedAt: Date.now(),
    };
    const sessionB: AuthSession = {
      accessToken: 'jwt-placeholder-b',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: userB,
      savedAt: Date.now(),
    };
    const profileA: UserProfileDto = { ...mockProfile, ...userA };
    const profileB: UserProfileDto = { ...mockProfile, ...userB };

    function renderWithRealAuth(ui: React.ReactElement) {
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

    it('Test 1: Species list does NOT leak User A data or isFavorited badge as placeholder while User B request is pending', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingSpeciesB = createDeferred<PageResponse<SpeciesSummaryDto>>();

      const speciesAOnly: SpeciesSummaryDto = {
        ...speciesOne,
        id: 'sp-a-secret',
        commonName: 'Cây bí mật của A',
        isFavorited: true,
      };
      const speciesBOnly: SpeciesSummaryDto = {
        ...speciesTwo,
        id: 'sp-b-public',
        commonName: 'Lan hồ điệp của B',
        isFavorited: false,
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
        if (config.url === '/species') {
          if (isB) {
            const pageB = await pendingSpeciesB.promise;
            return { status: 200, data: { success: true, data: pageB }, headers: {}, config };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [speciesAOnly],
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
      let listResult!: ReturnType<typeof useSpeciesList>;
      function Probe() {
        authCtx = useAuth();
        listResult = useSpeciesList({ page: 0, size: 20 });
        return null;
      }

      renderWithRealAuth(
        <>
          <Probe />
          <SearchScreen />
        </>
      );

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userA.id);
        expect(listResult.data?.content[0].id).toBe('sp-a-secret');
        expect(container!.textContent).toContain('Cây bí mật của A');
        expect(container!.querySelector('[aria-label="Bỏ yêu thích Cây bí mật của A"]')).toBeTruthy();
      });

      // Switch to User B while B's GET /species stays pending
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      // Wait for User B query to be actively pending
      await waitFor(() => {
        expect(authCtx.status).toBe('authenticated');
        expect(authCtx.user?.id).toBe(userB.id);
        expect(listResult.isFetching).toBe(true);
      });
      await flushAsync(40);

      // CRITICAL: During pending B fetch, hook & UI MUST NOT show A's data as placeholder
      expect(listResult.data).toBeUndefined();
      expect(listResult.isLoading).toBe(true);
      expect(listResult.isPlaceholderData).toBe(false);
      expect(container!.textContent).toContain('Đang tải danh sách loài cây từ máy chủ...');
      expect(container!.textContent).not.toContain('Cây bí mật của A');
      expect(container!.querySelector('[aria-label="Bỏ yêu thích Cây bí mật của A"]')).toBeNull();

      // Now resolve User B response
      await act(async () => {
        pendingSpeciesB.resolve({
          content: [speciesBOnly],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          last: true,
        });
      });

      await waitFor(() => {
        expect(listResult.data?.content[0].id).toBe('sp-b-public');
        expect(listResult.data?.content[0].isFavorited).toBe(false);
        expect(container!.textContent).toContain('Lan hồ điệp của B');
        expect(container!.querySelector('[aria-label="Yêu thích Lan hồ điệp của B"]')).toBeTruthy();
      });
      expect(container!.textContent).not.toContain('Cây bí mật của A');
    });

    it('Test 2: FavoritesSection does NOT render User A favorite items while User B GET /species/favorites is pending', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingFavB = createDeferred<PageResponse<SpeciesSummaryDto>>();

      const favAItem: SpeciesSummaryDto = {
        ...speciesOne,
        id: 'sp-fav-a',
        commonName: 'Cây yêu thích riêng của A',
        isFavorited: true,
      };
      const favBItem: SpeciesSummaryDto = {
        ...speciesTwo,
        id: 'sp-fav-b',
        commonName: 'Xương rồng riêng của B',
        isFavorited: true,
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
        if (config.url === '/species/favorites') {
          if (isB) {
            const pageB = await pendingFavB.promise;
            return { status: 200, data: { success: true, data: pageB }, headers: {}, config };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [favAItem],
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
      let favResult!: ReturnType<typeof useFavoriteSpecies>;
      function Probe() {
        authCtx = useAuth();
        favResult = useFavoriteSpecies({ page: 0, size: 20 });
        return null;
      }

      renderWithRealAuth(
        <>
          <Probe />
          <FavoritesSection />
        </>
      );

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userA.id);
        expect(favResult.data?.content[0].id).toBe('sp-fav-a');
        expect(container!.textContent).toContain('Cây yêu thích riêng của A');
        expect(container!.textContent).toContain('1 loài đã lưu');
      });

      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.status).toBe('authenticated');
        expect(authCtx.user?.id).toBe(userB.id);
        expect(favResult.isFetching).toBe(true);
      });
      await flushAsync(40);

      // During entire pending window of B, User A's favorites must NEVER appear
      expect(favResult.data).toBeUndefined();
      expect(favResult.isLoading).toBe(true);
      expect(favResult.isPlaceholderData).toBe(false);
      expect(container!.textContent).toContain('Đang tải danh sách loài cây yêu thích...');
      expect(container!.textContent).not.toContain('Cây yêu thích riêng của A');
      expect(container!.textContent).not.toContain('1 loài đã lưu');

      await act(async () => {
        pendingFavB.resolve({
          content: [favBItem],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          last: true,
        });
      });

      await waitFor(() => {
        expect(favResult.data?.content[0].id).toBe('sp-fav-b');
        expect(container!.textContent).toContain('Xương rồng riêng của B');
        expect(container!.textContent).toContain('1 loài đã lưu');
      });
      expect(container!.textContent).not.toContain('Cây yêu thích riêng của A');
    });

    it('Test 3: Logging out clears User A Species & Favorites data from hooks and UI (never retained on __unauthenticated__ query)', async () => {
      await tokenStorage.saveSession(sessionA);

      const userAPlant: SpeciesSummaryDto = {
        ...speciesOne,
        id: 'sp-logout-check',
        commonName: 'Sen đá riêng của A',
        isFavorited: true,
      };

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/species') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [userAPlant],
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
        if (config.url === '/species/favorites') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [userAPlant],
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
      let listResult!: ReturnType<typeof useSpeciesList>;
      let favResult!: ReturnType<typeof useFavoriteSpecies>;
      function Probe() {
        authCtx = useAuth();
        listResult = useSpeciesList({ page: 0, size: 20 });
        favResult = useFavoriteSpecies({ page: 0, size: 20 });
        return null;
      }

      renderWithRealAuth(
        <>
          <Probe />
          <SearchScreen />
          <FavoritesSection />
        </>
      );

      await waitFor(() => {
        expect(authCtx.status).toBe('authenticated');
        expect(listResult.data?.content[0].id).toBe('sp-logout-check');
        expect(favResult.data?.content[0].id).toBe('sp-logout-check');
        expect(container!.textContent).toContain('Sen đá riêng của A');
        expect(container!.querySelector('[aria-label="Bỏ yêu thích Sen đá riêng của A"]')).toBeTruthy();
      });

      await act(async () => {
        await authCtx.logout();
      });
      await flushAsync(40);

      expect(authCtx.status).toBe('unauthenticated');
      expect(listResult.data).toBeUndefined();
      expect(listResult.isPlaceholderData).toBe(false);
      expect(favResult.data).toBeUndefined();
      expect(favResult.isPlaceholderData).toBe(false);
      expect(container!.textContent).not.toContain('Sen đá riêng của A');
      expect(container!.textContent).not.toContain('1 loài đã lưu');
      expect(container!.querySelector('[aria-label="Bỏ yêu thích Sen đá riêng của A"]')).toBeNull();
    });

    it('Test 4: Same-account pagination keeps previous page as placeholder, respects keepPreviousData: false, and never leaks mid-pagination placeholder to User B', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingPage1 = createDeferred<PageResponse<SpeciesSummaryDto>>();
      const pendingFavPage1 = createDeferred<PageResponse<SpeciesSummaryDto>>();
      const pendingListB = createDeferred<PageResponse<SpeciesSummaryDto>>();
      const pendingFavB = createDeferred<PageResponse<SpeciesSummaryDto>>();

      const page0Plant: SpeciesSummaryDto = {
        ...speciesOne,
        id: 'sp-page-0',
        commonName: 'Cây Trang 0 của A',
        isFavorited: false,
      };
      const page1Plant: SpeciesSummaryDto = {
        ...speciesTwo,
        id: 'sp-page-1',
        commonName: 'Cây Trang 1 của A',
        isFavorited: true,
      };
      const favPage0Plant: SpeciesSummaryDto = {
        ...speciesOne,
        id: 'sp-fav-page-0',
        commonName: 'Yêu thích Trang 0 của A',
        isFavorited: true,
      };
      const favPage1Plant: SpeciesSummaryDto = {
        ...speciesTwo,
        id: 'sp-fav-page-1',
        commonName: 'Yêu thích Trang 1 của A',
        isFavorited: true,
      };
      const userBPlant: SpeciesSummaryDto = {
        ...speciesOne,
        id: 'sp-user-b',
        commonName: 'Cây sạch của B',
        isFavorited: false,
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
        if (config.url === '/species') {
          if (isB) {
            const dataB = await pendingListB.promise;
            return { status: 200, data: { success: true, data: dataB }, headers: {}, config };
          }
          const reqPage = Number((config.params as { page?: number })?.page ?? 0);
          if (reqPage === 0) {
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  content: [page0Plant],
                  page: 0,
                  size: 20,
                  totalElements: 25,
                  totalPages: 2,
                  last: false,
                },
              },
              headers: {},
              config,
            };
          }
          const page1Data = await pendingPage1.promise;
          return { status: 200, data: { success: true, data: page1Data }, headers: {}, config };
        }
        if (config.url === '/species/favorites') {
          if (isB) {
            const dataB = await pendingFavB.promise;
            return { status: 200, data: { success: true, data: dataB }, headers: {}, config };
          }
          const reqPage = Number((config.params as { page?: number })?.page ?? 0);
          if (reqPage === 0) {
            return {
              status: 200,
              data: {
                success: true,
                data: {
                  content: [favPage0Plant],
                  page: 0,
                  size: 20,
                  totalElements: 25,
                  totalPages: 2,
                  last: false,
                },
              },
              headers: {},
              config,
            };
          }
          const favPage1Data = await pendingFavPage1.promise;
          return { status: 200, data: { success: true, data: favPage1Data }, headers: {}, config };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let listWithPlaceholder!: ReturnType<typeof useSpeciesList>;
      let listWithoutPlaceholder!: ReturnType<typeof useSpeciesList>;
      let favWithPlaceholder!: ReturnType<typeof useFavoriteSpecies>;
      let favWithoutPlaceholder!: ReturnType<typeof useFavoriteSpecies>;
      let setHookPage!: (p: number) => void;

      function Probe() {
        const [hookPage, setLocalHookPage] = React.useState(0);
        setHookPage = setLocalHookPage;
        authCtx = useAuth();
        listWithPlaceholder = useSpeciesList({ page: hookPage, size: 20 });
        listWithoutPlaceholder = useSpeciesList(
          { page: hookPage, size: 20, keyword: 'no-placeholder' },
          { keepPreviousData: false }
        );
        favWithPlaceholder = useFavoriteSpecies({ page: hookPage, size: 20 });
        favWithoutPlaceholder = useFavoriteSpecies(
          { page: hookPage, size: 15 },
          { keepPreviousData: false }
        );
        return null;
      }

      renderWithRealAuth(
        <>
          <Probe />
          <SearchScreen />
        </>
      );

      await waitFor(() => {
        expect(listWithPlaceholder.data?.page).toBe(0);
        expect(listWithPlaceholder.isPlaceholderData).toBe(false);
        expect(listWithoutPlaceholder.data?.page).toBe(0);
        expect(favWithPlaceholder.data?.page).toBe(0);
        expect(favWithPlaceholder.isPlaceholderData).toBe(false);
        expect(favWithoutPlaceholder.data?.page).toBe(0);
        expect(container!.textContent).toContain('Cây Trang 0 của A');
        expect(container!.textContent).toContain('Trang sau');
      });

      // Paginate same User A -> page 1 while request stays pending
      act(() => {
        setHookPage(1);
      });
      const nextPageBtn = Array.from(container!.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent === 'Trang sau'
      );
      clickElement(nextPageBtn);

      await waitFor(() => {
        expect(listWithPlaceholder.isFetching).toBe(true);
        expect(listWithoutPlaceholder.isFetching).toBe(true);
        expect(favWithPlaceholder.isFetching).toBe(true);
        expect(favWithoutPlaceholder.isFetching).toBe(true);
      });

      // Same-owner placeholder works when enabled & stays disabled when keepPreviousData: false
      expect(listWithPlaceholder.data?.page).toBe(0);
      expect(listWithPlaceholder.data?.content[0].commonName).toBe('Cây Trang 0 của A');
      expect(listWithPlaceholder.isPlaceholderData).toBe(true);
      expect(favWithPlaceholder.data?.page).toBe(0);
      expect(favWithPlaceholder.data?.content[0].commonName).toBe('Yêu thích Trang 0 của A');
      expect(favWithPlaceholder.isPlaceholderData).toBe(true);
      expect(container!.textContent).toContain('Cây Trang 0 của A');
      expect(container!.textContent).toContain('Đang cập nhật...');
      expect(listWithoutPlaceholder.data).toBeUndefined();
      expect(favWithoutPlaceholder.data).toBeUndefined();

      // Also verify that even while User A is currently showing placeholderData (isPlaceholderData === true),
      // switching to User B drops placeholder completely while B is pending!
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(listWithPlaceholder.isFetching).toBe(true);
        expect(favWithPlaceholder.isFetching).toBe(true);
      });
      await flushAsync(30);

      expect(listWithPlaceholder.data).toBeUndefined();
      expect(listWithPlaceholder.isLoading).toBe(true);
      expect(listWithPlaceholder.isPlaceholderData).toBe(false);
      expect(favWithPlaceholder.data).toBeUndefined();
      expect(favWithPlaceholder.isLoading).toBe(true);
      expect(favWithPlaceholder.isPlaceholderData).toBe(false);
      expect(container!.textContent).not.toContain('Cây Trang 0 của A');

      // Cleanly settle deferred promises
      await act(async () => {
        pendingPage1.resolve({
          content: [page1Plant],
          page: 1,
          size: 20,
          totalElements: 25,
          totalPages: 2,
          last: true,
        });
        pendingFavPage1.resolve({
          content: [favPage1Plant],
          page: 1,
          size: 20,
          totalElements: 25,
          totalPages: 2,
          last: true,
        });
        pendingListB.resolve({
          content: [userBPlant],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          last: true,
        });
        pendingFavB.resolve({
          content: [],
          page: 0,
          size: 20,
          totalElements: 0,
          totalPages: 0,
          last: true,
        });
      });

      await waitFor(() => {
        expect(listWithPlaceholder.data?.content[0].id).toBe('sp-user-b');
        expect(favWithPlaceholder.data?.content).toEqual([]);
        expect(container!.textContent).toContain('Cây sạch của B');
      });
    });

    it('Test 5: Same speciesId with isFavorited=true on A vs isFavorited=false on B never leaks A favorite flag while B list or detail is loading', async () => {
      await tokenStorage.saveSession(sessionA);
      routeParamsState.current = { speciesId: 'sp-1' };

      const pendingListB = createDeferred<PageResponse<SpeciesSummaryDto>>();
      const pendingDetailB = createDeferred<SpeciesDetailDto>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const authHeader = config.headers?.Authorization as string | undefined;
        const isB = authHeader === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login' && config.method === 'post') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/species') {
          if (isB) {
            const pageB = await pendingListB.promise;
            return { status: 200, data: { success: true, data: pageB }, headers: {}, config };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: {
                content: [{ ...speciesOne, isFavorited: true }],
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
        if (config.url === '/species/sp-1') {
          if (isB) {
            const detailB = await pendingDetailB.promise;
            return { status: 200, data: { success: true, data: detailB }, headers: {}, config };
          }
          return {
            status: 200,
            data: {
              success: true,
              data: { ...speciesOneDetail, isFavorited: true },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected call: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let listResult!: ReturnType<typeof useSpeciesList>;
      let detailResult!: ReturnType<typeof useSpeciesDetail>;
      function Probe() {
        authCtx = useAuth();
        listResult = useSpeciesList({ page: 0, size: 20 });
        detailResult = useSpeciesDetail('sp-1');
        return null;
      }

      renderWithRealAuth(
        <>
          <Probe />
          <SearchScreen />
          <PlantDetailScreen />
        </>
      );

      // User A sees sp-1 with isFavorited: true on both list and detail
      await waitFor(() => {
        expect(listResult.data?.content[0].isFavorited).toBe(true);
        expect(detailResult.data?.isFavorited).toBe(true);
        expect(container!.querySelector('[aria-label="Bỏ yêu thích Trầu bà lá xẻ"]')).toBeTruthy();
        expect(container!.querySelector('[aria-label="Bỏ yêu thích"]')).toBeTruthy();
        expect(container!.textContent).toContain('♥ Đã yêu thích');
      });

      // Switch to User B while B's requests are pending
      await act(async () => {
        await authCtx.logout();
        await authCtx.login({ account: userB.email, password: 'Password123@' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(userB.id);
        expect(listResult.isFetching).toBe(true);
        expect(detailResult.isFetching).toBe(true);
      });
      await flushAsync(40);

      // Neither list nor detail may expose A's isFavorited=true while B is loading
      expect(listResult.data).toBeUndefined();
      expect(listResult.isPlaceholderData).toBe(false);
      expect(detailResult.data).toBeUndefined();
      expect(detailResult.isPlaceholderData).toBe(false);
      expect(container!.querySelector('[aria-label="Bỏ yêu thích Trầu bà lá xẻ"]')).toBeNull();
      expect(container!.querySelector('[aria-label="Bỏ yêu thích"]')).toBeNull();
      expect(container!.textContent).not.toContain('♥ Đã yêu thích');

      // Resolve User B responses with isFavorited: false
      await act(async () => {
        pendingListB.resolve({
          content: [{ ...speciesOne, isFavorited: false }],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          last: true,
        });
        pendingDetailB.resolve({ ...speciesOneDetail, isFavorited: false });
      });

      await waitFor(() => {
        expect(listResult.data?.content[0].isFavorited).toBe(false);
        expect(detailResult.data?.isFavorited).toBe(false);
        expect(container!.querySelector('[aria-label="Yêu thích Trầu bà lá xẻ"]')).toBeTruthy();
        expect(container!.querySelector('[aria-label="Thêm yêu thích"]')).toBeTruthy();
      });
      expect(container!.textContent).not.toContain('♥ Đã yêu thích');
    });
  });
});
