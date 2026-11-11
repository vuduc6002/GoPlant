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

describe('G5.3 Species & Favorites Integration', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    routeParamsState.current = {};
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
        expect(qc.getQueryData(queryKeys.species.detail('sp-1'))).toBeDefined();
        expect(
          qc.getQueryData(queryKeys.species.list({ page: 0, size: 20, sort: 'commonName,asc' }))
        ).toBeDefined();
        expect(qc.getQueryData(queryKeys.species.favorites({ page: 0, size: 20 }))).toBeDefined();
      });

      // Concurrent double-call for sp-1 dispatches ONLY ONE POST request
      await act(async () => {
        const p1 = favActions!.toggleFavorite('sp-1', false);
        const p2 = favActions!.toggleFavorite('sp-1', false);
        await Promise.all([p1, p2]);
      });

      expect(postFavCalls).toBe(1);

      const listKey = queryKeys.species.list({ page: 0, size: 20, sort: 'commonName,asc' });
      await waitFor(() => {
        expect(qc.getQueryData<PageResponse<SpeciesSummaryDto>>(listKey)?.content[0].isFavorited).toBe(true);
        expect(qc.getQueryData<SpeciesDetailDto>(queryKeys.species.detail('sp-1'))?.isFavorited).toBe(true);
        expect(
          qc.getQueryData<PageResponse<SpeciesSummaryDto>>(queryKeys.species.favorites({ page: 0, size: 20 }))
            ?.totalElements
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
      expect(qc.getQueryData<SpeciesDetailDto>(queryKeys.species.detail('sp-1'))?.isFavorited).toBe(true);

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
              queryKeys.species.favorites({ page: 0, size: 20 })
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
});
