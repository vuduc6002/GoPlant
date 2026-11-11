import { apiClient, type ApiUserScopeOptions } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type {
  ApiResponse,
  PageResponse,
  SimpleMessageResponseDto,
} from '@/services/api/apiTypes';
import type { UserPlantListQueryKeyParams } from '@/services/query/queryKeys';
import type {
  CreateUserPlantRequestDto,
  HealthStatus,
  PlantSortField,
  UpdateUserPlantRequestDto,
  UserPlantDetailDto,
  UserPlantListParams,
  UserPlantSummaryDto,
} from './plantTypes';

export const DEFAULT_PLANT_PAGE = 0;
export const DEFAULT_PLANT_SIZE = 20;
export const MIN_PLANT_SIZE = 1;
export const MAX_PLANT_SIZE = 100;
export const DEFAULT_PLANT_SORT = 'createdAt,desc';

export const PLANT_DISPLAY_NAME_MAX_LENGTH = 200;
export const PLANT_LOCATION_MAX_LENGTH = 200;

const ALLOWED_PLANT_SORT_FIELDS = new Set<PlantSortField>([
  'displayName',
  'createdAt',
  'plantedAt',
  'healthStatus',
]);

const VALID_HEALTH_STATUSES = new Set<HealthStatus>([
  'HEALTHY',
  'NEEDS_ATTENTION',
  'CRITICAL',
  'UNKNOWN',
]);

const ISO_LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizePlantPageParam(page?: number): number {
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    return DEFAULT_PLANT_PAGE;
  }
  return Math.max(0, Math.trunc(page));
}

export function normalizePlantSizeParam(size?: number): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return DEFAULT_PLANT_SIZE;
  }
  return Math.min(MAX_PLANT_SIZE, Math.max(MIN_PLANT_SIZE, Math.trunc(size)));
}

export function normalizePlantSort(sort?: string): string {
  if (typeof sort !== 'string' || !sort.trim()) {
    return DEFAULT_PLANT_SORT;
  }
  const parts = sort.split(',');
  const rawField = parts[0]?.trim() ?? '';
  if (!ALLOWED_PLANT_SORT_FIELDS.has(rawField as PlantSortField)) {
    return DEFAULT_PLANT_SORT;
  }
  const rawDirection = parts[1]?.trim().toLowerCase();
  const direction = rawDirection === 'asc' ? 'asc' : 'desc';
  return `${rawField},${direction}`;
}

export function normalizeHealthStatusFilter(status?: HealthStatus | string): HealthStatus | undefined {
  if (typeof status !== 'string') {
    return undefined;
  }
  const clean = status.trim();
  if (!clean || !VALID_HEALTH_STATUSES.has(clean as HealthStatus)) {
    return undefined;
  }
  return clean as HealthStatus;
}

export function normalizeUserPlantListParams(
  params?: UserPlantListParams
): UserPlantListQueryKeyParams {
  const trimmedKeyword = params?.keyword?.trim();
  const trimmedGardenId = params?.gardenId?.trim();
  const normalizedStatus = normalizeHealthStatusFilter(params?.healthStatus);

  return {
    ...(trimmedKeyword ? { keyword: trimmedKeyword } : {}),
    ...(trimmedGardenId ? { gardenId: trimmedGardenId } : {}),
    ...(normalizedStatus ? { healthStatus: normalizedStatus } : {}),
    page: normalizePlantPageParam(params?.page),
    size: normalizePlantSizeParam(params?.size),
    sort: normalizePlantSort(params?.sort),
  };
}

export function assertValidPlantId(plantId: string): string {
  const cleanId = typeof plantId === 'string' ? plantId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Mã cây trồng không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'plantId',
    });
  }
  return cleanId;
}

export function assertValidTargetGardenId(gardenId: string): string {
  const cleanId = typeof gardenId === 'string' ? gardenId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Vui lòng chọn khu vườn thực tế trước khi thêm cây.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'gardenId',
    });
  }
  return cleanId;
}

export function assertValidTargetSpeciesId(speciesId: string): string {
  const cleanId = typeof speciesId === 'string' ? speciesId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Vui lòng chọn loài cây thực tế từ thư viện.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'speciesId',
    });
  }
  return cleanId;
}

export function validatePlantDisplayName(displayName: string): string {
  const cleanName = typeof displayName === 'string' ? displayName.trim() : '';
  if (!cleanName) {
    throw new AppApiError({
      message: 'Tên cây hiển thị không được để trống',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'displayName',
    });
  }
  if (cleanName.length > PLANT_DISPLAY_NAME_MAX_LENGTH) {
    throw new AppApiError({
      message: `Tên cây hiển thị tối đa ${PLANT_DISPLAY_NAME_MAX_LENGTH} ký tự`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'displayName',
    });
  }
  return cleanName;
}

export function validatePlantLocation(location: string): string {
  const cleanLocation = typeof location === 'string' ? location.trim() : '';
  if (cleanLocation.length > PLANT_LOCATION_MAX_LENGTH) {
    throw new AppApiError({
      message: `Vị trí trồng tối đa ${PLANT_LOCATION_MAX_LENGTH} ký tự`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'location',
    });
  }
  return cleanLocation;
}

export function validatePlantedAtDate(plantedAt: string): string {
  const cleanDate = typeof plantedAt === 'string' ? plantedAt.trim() : '';
  if (!cleanDate) {
    return '';
  }
  const match = ISO_LOCAL_DATE_PATTERN.exec(cleanDate);
  if (!match) {
    throw new AppApiError({
      message: 'Ngày trồng phải theo định dạng YYYY-MM-DD (ví dụ: 2026-11-11).',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'plantedAt',
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new AppApiError({
      message: 'Ngày trồng không tồn tại trên lịch. Vui lòng kiểm tra lại.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'plantedAt',
    });
  }
  return cleanDate;
}

export function validatePlantHealthStatus(
  healthStatus: HealthStatus | string | undefined
): HealthStatus {
  if (
    typeof healthStatus !== 'string' ||
    !VALID_HEALTH_STATUSES.has(healthStatus as HealthStatus)
  ) {
    throw new AppApiError({
      message: 'Tình trạng sức khỏe cây không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'healthStatus',
    });
  }
  return healthStatus as HealthStatus;
}

export function buildCreatePlantPayload(
  request: CreateUserPlantRequestDto
): CreateUserPlantRequestDto {
  const speciesId = assertValidTargetSpeciesId(request.speciesId);
  const displayName = validatePlantDisplayName(request.displayName);
  const location = request.location !== undefined ? validatePlantLocation(request.location) : '';
  const plantedAt = request.plantedAt !== undefined ? validatePlantedAtDate(request.plantedAt) : '';
  const note = request.note?.trim() ?? '';
  const imageUrl = request.imageUrl?.trim() ?? '';

  return {
    speciesId,
    displayName,
    ...(location ? { location } : {}),
    ...(plantedAt ? { plantedAt } : {}),
    ...(note ? { note } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

export function buildUpdatePlantPayload(
  request: UpdateUserPlantRequestDto
): UpdateUserPlantRequestDto {
  const payload: UpdateUserPlantRequestDto = {};

  if (request.displayName !== undefined) {
    payload.displayName = validatePlantDisplayName(request.displayName);
  }
  if (request.location !== undefined) {
    payload.location = validatePlantLocation(request.location);
  }
  if (request.plantedAt !== undefined) {
    const validDate = validatePlantedAtDate(request.plantedAt);
    if (validDate) {
      payload.plantedAt = validDate;
    }
  }
  if (request.note !== undefined) {
    payload.note = request.note.trim();
  }
  if (request.healthStatus !== undefined) {
    payload.healthStatus = validatePlantHealthStatus(request.healthStatus);
  }
  if (request.imageUrl !== undefined) {
    payload.imageUrl = request.imageUrl.trim();
  }

  return payload;
}

function normalizeHealthStatusValue(value: HealthStatus | string | undefined): HealthStatus {
  return typeof value === 'string' && VALID_HEALTH_STATUSES.has(value as HealthStatus)
    ? (value as HealthStatus)
    : 'UNKNOWN';
}

function normalizeUserPlantSummary(item: UserPlantSummaryDto): UserPlantSummaryDto {
  return {
    ...item,
    speciesName: item.speciesName ?? null,
    scientificName: item.scientificName ?? null,
    category: item.category ?? null,
    gardenName: item.gardenName ?? null,
    healthStatus: normalizeHealthStatusValue(item.healthStatus),
    imageUrl: item.imageUrl ?? null,
  };
}

function normalizeUserPlantDetail(item: UserPlantDetailDto): UserPlantDetailDto {
  return {
    ...item,
    location: item.location ?? null,
    plantedAt: item.plantedAt ?? null,
    note: item.note ?? null,
    healthStatus: normalizeHealthStatusValue(item.healthStatus),
    plantCode: item.plantCode ?? null,
    imageUrl: item.imageUrl ?? null,
    species: item.species
      ? {
          ...item.species,
          difficulty: item.species.difficulty ?? null,
          thumbnailUrl: item.species.thumbnailUrl ?? null,
        }
      : null,
    garden: item.garden ? { id: item.garden.id, name: item.garden.name } : null,
  };
}

function normalizePageResponse(
  rawPage: PageResponse<UserPlantSummaryDto> | undefined,
  fallbackPage: number,
  fallbackSize: number
): PageResponse<UserPlantSummaryDto> {
  if (!rawPage || !Array.isArray(rawPage.content)) {
    throw new AppApiError({
      message: 'Dữ liệu danh sách cây trồng không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return {
    content: rawPage.content.map(normalizeUserPlantSummary),
    page: typeof rawPage.page === 'number' ? rawPage.page : fallbackPage,
    size: typeof rawPage.size === 'number' ? rawPage.size : fallbackSize,
    totalElements:
      typeof rawPage.totalElements === 'number' ? rawPage.totalElements : rawPage.content.length,
    totalPages: typeof rawPage.totalPages === 'number' ? rawPage.totalPages : 1,
    last: Boolean(rawPage.last),
  };
}

function buildScopeConfig(scope?: ApiUserScopeOptions): ApiUserScopeOptions {
  if (!scope) {
    return {};
  }
  return {
    ...(scope.expectedUserId !== undefined ? { expectedUserId: scope.expectedUserId } : {}),
    ...(scope.expectedSessionGeneration !== undefined
      ? { expectedSessionGeneration: scope.expectedSessionGeneration }
      : {}),
  };
}

export async function getMyPlants(
  params?: UserPlantListParams,
  scope?: ApiUserScopeOptions
): Promise<PageResponse<UserPlantSummaryDto>> {
  const normalized = normalizeUserPlantListParams(params);
  const queryParams: Record<string, string | number> = {
    page: normalized.page,
    size: normalized.size,
    sort: normalized.sort,
  };
  if (normalized.keyword) {
    queryParams.keyword = normalized.keyword;
  }
  if (normalized.gardenId) {
    queryParams.gardenId = normalized.gardenId;
  }
  if (normalized.healthStatus) {
    queryParams.healthStatus = normalized.healthStatus;
  }

  const response = await apiClient.get<ApiResponse<PageResponse<UserPlantSummaryDto>>>('/plants', {
    params: queryParams,
    ...buildScopeConfig(scope),
  });

  return normalizePageResponse(response.data?.data, normalized.page, normalized.size);
}

export async function getPlantDetail(
  plantId: string,
  scope?: ApiUserScopeOptions
): Promise<UserPlantDetailDto> {
  const cleanId = assertValidPlantId(plantId);
  const response = await apiClient.get<ApiResponse<UserPlantDetailDto>>(
    `/plants/${encodeURIComponent(cleanId)}`,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Dữ liệu chi tiết cây trồng không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeUserPlantDetail(response.data.data);
}

export async function createPlant(
  gardenId: string,
  request: CreateUserPlantRequestDto,
  scope?: ApiUserScopeOptions
): Promise<UserPlantDetailDto> {
  const cleanGardenId = assertValidTargetGardenId(gardenId);
  const payload = buildCreatePlantPayload(request);
  const response = await apiClient.post<ApiResponse<UserPlantDetailDto>>(
    `/gardens/${encodeURIComponent(cleanGardenId)}/plants`,
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể thêm cây trồng vào khu vườn.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeUserPlantDetail(response.data.data);
}

export async function updatePlant(
  plantId: string,
  request: UpdateUserPlantRequestDto,
  scope?: ApiUserScopeOptions
): Promise<UserPlantDetailDto> {
  const cleanPlantId = assertValidPlantId(plantId);
  const payload = buildUpdatePlantPayload(request);
  const response = await apiClient.put<ApiResponse<UserPlantDetailDto>>(
    `/plants/${encodeURIComponent(cleanPlantId)}`,
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể cập nhật thông tin cây trồng.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeUserPlantDetail(response.data.data);
}

export async function deletePlant(
  plantId: string,
  scope?: ApiUserScopeOptions
): Promise<SimpleMessageResponseDto> {
  const cleanPlantId = assertValidPlantId(plantId);
  const response = await apiClient.delete<ApiResponse<SimpleMessageResponseDto>>(
    `/plants/${encodeURIComponent(cleanPlantId)}`,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    return { message: response.data?.message || 'Cây trồng đã được xóa.' };
  }
  return response.data.data;
}
