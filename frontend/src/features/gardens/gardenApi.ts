import { apiClient, type ApiUserScopeOptions } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { ApiResponse, SimpleMessageResponseDto } from '@/services/api/apiTypes';
import type {
  CreateGardenRequestDto,
  GardenDetailDto,
  GardenSummaryDto,
  SpaceType,
  UpdateGardenRequestDto,
} from './gardenTypes';

const VALID_SPACE_TYPES = new Set<SpaceType>([
  'BAN_CONG',
  'SAN_THUONG',
  'TRONG_NHA',
  'SAN_VUON',
  'KHAC',
]);

export const GARDEN_NAME_MAX_LENGTH = 200;

export function assertValidGardenId(gardenId: string): string {
  const cleanId = typeof gardenId === 'string' ? gardenId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Mã khu vườn không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'gardenId',
    });
  }
  return cleanId;
}

export function validateGardenName(name: string): string {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    throw new AppApiError({
      message: 'Tên khu vườn không được để trống',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'name',
    });
  }
  if (cleanName.length > GARDEN_NAME_MAX_LENGTH) {
    throw new AppApiError({
      message: `Tên khu vườn từ 1 đến ${GARDEN_NAME_MAX_LENGTH} ký tự`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'name',
    });
  }
  return cleanName;
}

export function validateGardenLocation(location: string): string {
  const cleanLocation = typeof location === 'string' ? location.trim() : '';
  if (!cleanLocation) {
    throw new AppApiError({
      message: 'Vị trí không được để trống',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'location',
    });
  }
  return cleanLocation;
}

export function validateGardenSpaceType(spaceType: SpaceType | string | undefined): SpaceType {
  if (typeof spaceType !== 'string' || !VALID_SPACE_TYPES.has(spaceType as SpaceType)) {
    throw new AppApiError({
      message: 'Loại không gian không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'spaceType',
    });
  }
  return spaceType as SpaceType;
}

function normalizeGardenSummary(item: GardenSummaryDto): GardenSummaryDto {
  return {
    ...item,
    spaceType: VALID_SPACE_TYPES.has(item.spaceType) ? item.spaceType : 'KHAC',
    coverImageUrl: item.coverImageUrl ?? null,
    plantCount: typeof item.plantCount === 'number' ? item.plantCount : 0,
  };
}

function normalizeGardenDetail(item: GardenDetailDto): GardenDetailDto {
  return {
    ...item,
    spaceType: VALID_SPACE_TYPES.has(item.spaceType) ? item.spaceType : 'KHAC',
    description: item.description ?? null,
    coverImageUrl: item.coverImageUrl ?? null,
    plants: Array.isArray(item.plants)
      ? item.plants.map((plant) => ({
          ...plant,
          speciesName: plant.speciesName ?? null,
          scientificName: plant.scientificName ?? null,
          category: plant.category ?? null,
          imageUrl: plant.imageUrl ?? null,
        }))
      : [],
  };
}

export function buildCreateGardenPayload(request: CreateGardenRequestDto): CreateGardenRequestDto {
  const name = validateGardenName(request.name);
  const location = validateGardenLocation(request.location);
  const spaceType = validateGardenSpaceType(request.spaceType);
  const description = request.description?.trim();
  const coverImageUrl = request.coverImageUrl?.trim();

  return {
    name,
    location,
    spaceType,
    ...(description ? { description } : {}),
    ...(coverImageUrl ? { coverImageUrl } : {}),
  };
}

export function buildUpdateGardenPayload(request: UpdateGardenRequestDto): UpdateGardenRequestDto {
  const payload: UpdateGardenRequestDto = {};

  if (request.name !== undefined) {
    payload.name = validateGardenName(request.name);
  }
  if (request.location !== undefined) {
    payload.location = validateGardenLocation(request.location);
  }
  if (request.spaceType !== undefined) {
    payload.spaceType = validateGardenSpaceType(request.spaceType);
  }
  if (request.description !== undefined) {
    payload.description = request.description.trim();
  }
  if (request.coverImageUrl !== undefined) {
    payload.coverImageUrl = request.coverImageUrl.trim();
  }

  return payload;
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

export async function getGardensList(scope?: ApiUserScopeOptions): Promise<GardenSummaryDto[]> {
  const response = await apiClient.get<ApiResponse<GardenSummaryDto[]>>(
    '/gardens',
    buildScopeConfig(scope)
  );
  if (!Array.isArray(response.data?.data)) {
    throw new AppApiError({
      message: 'Dữ liệu danh sách khu vườn không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return response.data.data.map(normalizeGardenSummary);
}

export async function createGarden(
  request: CreateGardenRequestDto,
  scope?: ApiUserScopeOptions
): Promise<GardenDetailDto> {
  const payload = buildCreateGardenPayload(request);
  const response = await apiClient.post<ApiResponse<GardenDetailDto>>(
    '/gardens',
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể tạo khu vườn mới.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeGardenDetail(response.data.data);
}

export async function getGardenDetail(
  gardenId: string,
  scope?: ApiUserScopeOptions
): Promise<GardenDetailDto> {
  const cleanId = assertValidGardenId(gardenId);
  const response = await apiClient.get<ApiResponse<GardenDetailDto>>(
    `/gardens/${encodeURIComponent(cleanId)}`,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Dữ liệu chi tiết khu vườn không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeGardenDetail(response.data.data);
}

export async function updateGarden(
  gardenId: string,
  request: UpdateGardenRequestDto,
  scope?: ApiUserScopeOptions
): Promise<GardenDetailDto> {
  const cleanId = assertValidGardenId(gardenId);
  const payload = buildUpdateGardenPayload(request);
  const response = await apiClient.put<ApiResponse<GardenDetailDto>>(
    `/gardens/${encodeURIComponent(cleanId)}`,
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể cập nhật khu vườn.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeGardenDetail(response.data.data);
}

export async function deleteGarden(
  gardenId: string,
  scope?: ApiUserScopeOptions
): Promise<SimpleMessageResponseDto> {
  const cleanId = assertValidGardenId(gardenId);
  const response = await apiClient.delete<ApiResponse<SimpleMessageResponseDto>>(
    `/gardens/${encodeURIComponent(cleanId)}`,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    return { message: response.data?.message || 'Khu vườn đã được xóa.' };
  }
  return response.data.data;
}
