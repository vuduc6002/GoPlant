import { apiClient, type ApiUserScopeOptions } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { ApiResponse, SimpleMessageResponseDto } from '@/services/api/apiTypes';
import type {
  CameraDto,
  CameraStatus,
  CreateCameraRequestDto,
  UpdateCameraRequestDto,
} from './cameraTypes';
import {
  assertValidCameraGardenId,
  assertValidCameraId,
  VALID_CAMERA_STATUSES,
  validateCameraConnectionNote,
  validateCameraName,
  validateCameraStatus,
} from './cameraValidation';

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCameraDto(raw: CameraDto): CameraDto {
  const status: CameraStatus = VALID_CAMERA_STATUSES.has(raw.status) ? raw.status : 'OFFLINE';
  return {
    id: String(raw.id ?? ''),
    gardenId: String(raw.gardenId ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    locationDesc: normalizeOptionalText(raw.locationDesc),
    status,
    connectionNote: normalizeOptionalText(raw.connectionNote),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
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

export function buildCreateCameraPayload(request: CreateCameraRequestDto): CreateCameraRequestDto {
  const name = validateCameraName(request.name);
  const locationDesc =
    request.locationDesc !== undefined ? request.locationDesc.trim() : undefined;
  const connectionNote =
    request.connectionNote !== undefined
      ? validateCameraConnectionNote(request.connectionNote)
      : undefined;

  return {
    name,
    ...(locationDesc ? { locationDesc } : {}),
    ...(connectionNote ? { connectionNote } : {}),
  };
}

export function buildUpdateCameraPayload(request: UpdateCameraRequestDto): UpdateCameraRequestDto {
  const payload: UpdateCameraRequestDto = {};

  if (request.name !== undefined) {
    payload.name = validateCameraName(request.name);
  }
  if (request.locationDesc !== undefined) {
    payload.locationDesc = request.locationDesc.trim();
  }
  if (request.status !== undefined) {
    payload.status = validateCameraStatus(request.status);
  }
  if (request.connectionNote !== undefined) {
    payload.connectionNote = validateCameraConnectionNote(request.connectionNote);
  }

  return payload;
}

export async function getGardenCameras(
  gardenId: string,
  scope?: ApiUserScopeOptions
): Promise<CameraDto[]> {
  const cleanGardenId = assertValidCameraGardenId(gardenId);
  const response = await apiClient.get<ApiResponse<CameraDto[]>>(
    `/gardens/${encodeURIComponent(cleanGardenId)}/cameras`,
    buildScopeConfig(scope)
  );
  if (!Array.isArray(response.data?.data)) {
    throw new AppApiError({
      message: 'Dữ liệu danh sách camera không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return response.data.data.map(normalizeCameraDto);
}

export async function createGardenCamera(
  gardenId: string,
  request: CreateCameraRequestDto,
  scope?: ApiUserScopeOptions
): Promise<CameraDto> {
  const cleanGardenId = assertValidCameraGardenId(gardenId);
  const payload = buildCreateCameraPayload(request);
  const response = await apiClient.post<ApiResponse<CameraDto>>(
    `/gardens/${encodeURIComponent(cleanGardenId)}/cameras`,
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể thêm camera mới.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeCameraDto(response.data.data);
}

export async function updateCamera(
  cameraId: string,
  request: UpdateCameraRequestDto,
  scope?: ApiUserScopeOptions
): Promise<CameraDto> {
  const cleanCameraId = assertValidCameraId(cameraId);
  const payload = buildUpdateCameraPayload(request);
  const response = await apiClient.put<ApiResponse<CameraDto>>(
    `/cameras/${encodeURIComponent(cleanCameraId)}`,
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể cập nhật thông tin camera.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeCameraDto(response.data.data);
}

export async function deleteCamera(
  cameraId: string,
  scope?: ApiUserScopeOptions
): Promise<SimpleMessageResponseDto> {
  const cleanCameraId = assertValidCameraId(cameraId);
  const response = await apiClient.delete<ApiResponse<SimpleMessageResponseDto>>(
    `/cameras/${encodeURIComponent(cleanCameraId)}`,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    return { message: response.data?.message || 'Camera đã được xóa.' };
  }
  return response.data.data;
}
