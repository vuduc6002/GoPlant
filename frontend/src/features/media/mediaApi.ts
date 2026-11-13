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

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VALID_MEDIA_STATUSES = new Set<MediaStatus>([
  'PENDING',
  'READY',
  'ATTACHED',
  'DELETING',
  'DELETED',
]);

function normalizeMediaItem(raw: any): MediaItem {
  if (!raw || typeof raw !== 'object') {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi tệp tin không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi tệp tin thiếu ID hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }

  const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim().toLowerCase() : '';
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AppApiError({
      message: `Định dạng tệp tin '${mimeType}' không được hỗ trợ.`,
      code: 'INVALID_RESPONSE',
    });
  }

  const sizeBytes = typeof raw.sizeBytes === 'number' ? raw.sizeBytes : -1;
  if (sizeBytes <= 0 || sizeBytes > 5 * 1024 * 1024) {
    throw new AppApiError({
      message: 'Kích thước tệp tin phản hồi không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }

  const status = typeof raw.status === 'string' ? (raw.status as MediaStatus) : ('' as MediaStatus);
  if (!VALID_MEDIA_STATUSES.has(status)) {
    throw new AppApiError({
      message: `Trạng thái tệp tin '${raw.status}' không hợp lệ.`,
      code: 'INVALID_RESPONSE',
    });
  }

  return {
    id,
    mimeType,
    sizeBytes,
    width: typeof raw.width === 'number' && raw.width > 0 ? raw.width : null,
    height: typeof raw.height === 'number' && raw.height > 0 ? raw.height : null,
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

  const data = response.data?.data;
  const readUrl = typeof data?.readUrl === 'string' ? data.readUrl.trim() : '';
  const expiresAt = typeof data?.expiresAt === 'string' ? data.expiresAt.trim() : '';

  if (!readUrl || !expiresAt || !readUrl.startsWith('https://')) {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi URL đọc không hợp lệ hoặc không an toàn.',
      code: 'INVALID_RESPONSE',
    });
  }

  return {
    mediaId: String(data?.mediaId || mediaId).trim(),
    readUrl,
    expiresAt,
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
