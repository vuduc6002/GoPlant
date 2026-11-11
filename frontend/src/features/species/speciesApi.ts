import { apiClient } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type {
  ApiResponse,
  PageResponse,
  SimpleMessageResponseDto,
} from '@/services/api/apiTypes';
import type {
  FavoriteSpeciesQueryKeyParams,
  SpeciesListQueryKeyParams,
} from '@/services/query/queryKeys';
import type {
  FavoriteSpeciesParams,
  SpeciesDetailDto,
  SpeciesListParams,
  SpeciesSortField,
  SpeciesSummaryDto,
} from './speciesTypes';

export const DEFAULT_SPECIES_PAGE = 0;
export const DEFAULT_SPECIES_SIZE = 20;
export const MIN_SPECIES_SIZE = 1;
export const MAX_SPECIES_SIZE = 100;
export const DEFAULT_SPECIES_SORT = 'commonName,asc';

const ALLOWED_SPECIES_SORT_FIELDS = new Set<SpeciesSortField>([
  'commonName',
  'scientificName',
  'category',
  'difficulty',
  'createdAt',
  'updatedAt',
]);

export function normalizePageParam(page?: number): number {
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    return DEFAULT_SPECIES_PAGE;
  }
  return Math.max(0, Math.trunc(page));
}

export function normalizeSizeParam(size?: number): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return DEFAULT_SPECIES_SIZE;
  }
  return Math.min(MAX_SPECIES_SIZE, Math.max(MIN_SPECIES_SIZE, Math.trunc(size)));
}

export function normalizeSpeciesSort(sort?: string): string {
  if (typeof sort !== 'string' || !sort.trim()) {
    return DEFAULT_SPECIES_SORT;
  }
  const parts = sort.split(',');
  const rawField = parts[0]?.trim() ?? '';
  if (!ALLOWED_SPECIES_SORT_FIELDS.has(rawField as SpeciesSortField)) {
    return DEFAULT_SPECIES_SORT;
  }
  const rawDirection = parts[1]?.trim().toLowerCase();
  const direction = rawDirection === 'desc' ? 'desc' : 'asc';
  return `${rawField},${direction}`;
}

export function normalizeSpeciesListParams(params?: SpeciesListParams): SpeciesListQueryKeyParams {
  const trimmedKeyword = params?.keyword?.trim();
  const trimmedCategory = params?.category?.trim();

  const keyword = trimmedKeyword ? trimmedKeyword : undefined;
  const category =
    trimmedCategory && trimmedCategory !== 'Tất cả' ? trimmedCategory : undefined;

  return {
    ...(keyword ? { keyword } : {}),
    ...(category ? { category } : {}),
    page: normalizePageParam(params?.page),
    size: normalizeSizeParam(params?.size),
    sort: normalizeSpeciesSort(params?.sort),
  };
}

export function normalizeFavoriteSpeciesParams(
  params?: FavoriteSpeciesParams
): FavoriteSpeciesQueryKeyParams {
  return {
    page: normalizePageParam(params?.page),
    size: normalizeSizeParam(params?.size),
  };
}

function assertValidSpeciesId(speciesId: string): string {
  const cleanId = typeof speciesId === 'string' ? speciesId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Mã loài cây không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'speciesId',
    });
  }
  return cleanId;
}

function normalizeSpeciesSummary(item: SpeciesSummaryDto): SpeciesSummaryDto {
  return {
    ...item,
    difficulty: item.difficulty ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    isFavorited: Boolean(item.isFavorited),
  };
}

function normalizeSpeciesDetail(item: SpeciesDetailDto): SpeciesDetailDto {
  return {
    ...item,
    difficulty: item.difficulty ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    isFavorited: Boolean(item.isFavorited),
    isActive: item.isActive ?? true,
  };
}

function normalizePageResponse(
  rawPage: PageResponse<SpeciesSummaryDto> | undefined,
  fallbackPage: number,
  fallbackSize: number
): PageResponse<SpeciesSummaryDto> {
  if (!rawPage || !Array.isArray(rawPage.content)) {
    throw new AppApiError({
      message: 'Dữ liệu danh sách loài cây không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return {
    content: rawPage.content.map(normalizeSpeciesSummary),
    page: typeof rawPage.page === 'number' ? rawPage.page : fallbackPage,
    size: typeof rawPage.size === 'number' ? rawPage.size : fallbackSize,
    totalElements: typeof rawPage.totalElements === 'number' ? rawPage.totalElements : rawPage.content.length,
    totalPages: typeof rawPage.totalPages === 'number' ? rawPage.totalPages : 1,
    last: Boolean(rawPage.last),
  };
}

export async function getSpeciesList(
  params?: SpeciesListParams
): Promise<PageResponse<SpeciesSummaryDto>> {
  const normalized = normalizeSpeciesListParams(params);
  const queryParams: Record<string, string | number> = {
    page: normalized.page,
    size: normalized.size,
    sort: normalized.sort,
  };
  if (normalized.keyword) {
    queryParams.keyword = normalized.keyword;
  }
  if (normalized.category) {
    queryParams.category = normalized.category;
  }

  const response = await apiClient.get<ApiResponse<PageResponse<SpeciesSummaryDto>>>('/species', {
    params: queryParams,
  });

  return normalizePageResponse(response.data?.data, normalized.page, normalized.size);
}

export async function getSpeciesDetail(speciesId: string): Promise<SpeciesDetailDto> {
  const cleanId = assertValidSpeciesId(speciesId);
  const response = await apiClient.get<ApiResponse<SpeciesDetailDto>>(
    `/species/${encodeURIComponent(cleanId)}`
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Dữ liệu chi tiết loài cây không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeSpeciesDetail(response.data.data);
}

export async function addFavoriteSpecies(speciesId: string): Promise<SimpleMessageResponseDto> {
  const cleanId = assertValidSpeciesId(speciesId);
  const response = await apiClient.post<ApiResponse<SimpleMessageResponseDto>>(
    `/species/${encodeURIComponent(cleanId)}/favorite`
  );
  if (!response.data?.data) {
    return { message: response.data?.message || 'Đã thêm vào danh sách yêu thích.' };
  }
  return response.data.data;
}

export async function removeFavoriteSpecies(speciesId: string): Promise<SimpleMessageResponseDto> {
  const cleanId = assertValidSpeciesId(speciesId);
  const response = await apiClient.delete<ApiResponse<SimpleMessageResponseDto>>(
    `/species/${encodeURIComponent(cleanId)}/favorite`
  );
  if (!response.data?.data) {
    return { message: response.data?.message || 'Đã bỏ khỏi danh sách yêu thích.' };
  }
  return response.data.data;
}

export async function getFavoriteSpecies(
  params?: FavoriteSpeciesParams
): Promise<PageResponse<SpeciesSummaryDto>> {
  const normalized = normalizeFavoriteSpeciesParams(params);
  const response = await apiClient.get<ApiResponse<PageResponse<SpeciesSummaryDto>>>(
    '/species/favorites',
    {
      params: {
        page: normalized.page,
        size: normalized.size,
      },
    }
  );
  return normalizePageResponse(response.data?.data, normalized.page, normalized.size);
}
