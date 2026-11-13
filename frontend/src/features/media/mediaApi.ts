import { apiClient, type ApiUserScopeOptions } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { ApiResponse, SimpleMessageResponseDto } from '@/services/api/apiTypes';
import type {
  LocalImageFile,
  MediaItem,
  MediaReadUrlResponse,
  MediaStatus,
  UploadMediaOptions,
} from './mediaTypes';
import { assertValidImageFile } from './mediaValidation';

function normalizeMediaItem(raw: any): MediaItem {
  if (!raw || typeof raw !== 'object') {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi tệp tin không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }

  const validStatuses: Record<string, MediaStatus> = {
    PENDING: 'PENDING',
    READY: 'READY',
    ATTACHED: 'ATTACHED',
    DELETING: 'DELETING',
    DELETED: 'DELETED',
  };

  const status: MediaStatus = validStatuses[raw.status] || 'READY';

  return {
    id: String(raw.id ?? ''),
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'image/jpeg',
    sizeBytes: typeof raw.sizeBytes === 'number' ? raw.sizeBytes : 0,
    width: typeof raw.width === 'number' ? raw.width : null,
    height: typeof raw.height === 'number' ? raw.height : null,
    status,
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

export async function uploadMedia(
  file: LocalImageFile,
  options?: UploadMediaOptions
): Promise<MediaItem> {
  assertValidImageFile(file);

  const formData = new FormData();
  const fileName = file.name || 'image.jpg';
  const fileType = file.type || 'image/jpeg';

  // React Native FormData structure vs standard Web FormData
  // In React Native: append('file', { uri, name, type } as any)
  formData.append('file', {
    uri: file.uri,
    name: fileName,
    type: fileType,
  } as any);

  const scopeConfig = buildScopeConfig(options);

  const response = await apiClient.post<ApiResponse<MediaItem>>('/media', formData, {
    ...scopeConfig,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể tải tệp tin lên máy chủ.',
      code: 'INVALID_RESPONSE',
    });
  }

  return normalizeMediaItem(response.data.data);
}

export async function getMediaReadUrl(
  mediaId: string,
  scope?: ApiUserScopeOptions
): Promise<MediaReadUrlResponse> {
  if (!mediaId || typeof mediaId !== 'string' || !mediaId.trim()) {
    throw new AppApiError({
      message: 'Mã tệp tin mediaId không hợp lệ.',
      code: 'VALIDATION_ERROR',
      field: 'mediaId',
    });
  }

  const response = await apiClient.get<ApiResponse<MediaReadUrlResponse>>(
    `/media/${encodeURIComponent(mediaId.trim())}/read-url`,
    buildScopeConfig(scope)
  );

  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể lấy URL đọc tệp tin đa phương tiện.',
      code: 'INVALID_RESPONSE',
    });
  }

  return {
    mediaId: String(response.data.data.mediaId ?? mediaId),
    readUrl: String(response.data.data.readUrl ?? ''),
    expiresAt: String(response.data.data.expiresAt ?? ''),
  };
}

export async function deleteMedia(
  mediaId: string,
  scope?: ApiUserScopeOptions
): Promise<SimpleMessageResponseDto> {
  if (!mediaId || typeof mediaId !== 'string' || !mediaId.trim()) {
    throw new AppApiError({
      message: 'Mã tệp tin mediaId không hợp lệ.',
      code: 'VALIDATION_ERROR',
      field: 'mediaId',
    });
  }

  const response = await apiClient.delete<ApiResponse<SimpleMessageResponseDto>>(
    `/media/${encodeURIComponent(mediaId.trim())}`,
    buildScopeConfig(scope)
  );

  if (!response.data?.data) {
    return { message: response.data?.message || 'Đã xóa tệp tin thành công.' };
  }

  return response.data.data;
}
