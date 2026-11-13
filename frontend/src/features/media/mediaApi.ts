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

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeMediaItem(raw: any): MediaItem {
  if (!raw || typeof raw !== 'object') {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi tệp tin không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id || !UUID_REGEX.test(id)) {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi tệp tin thiếu ID định dạng UUID hợp lệ.',
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

  const sizeBytes = typeof raw.sizeBytes === 'number' && Number.isFinite(raw.sizeBytes) ? raw.sizeBytes : -1;
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 5 * 1024 * 1024) {
    throw new AppApiError({
      message: 'Kích thước tệp tin phản hồi không hợp lệ (phải từ 1 đến 5242880 bytes).',
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

  // React Native FormData vs Web FormData compatibility
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

  const trimmedId = mediaId.trim();
  if (!UUID_REGEX.test(trimmedId)) {
    throw new AppApiError({
      message: 'Mã tệp tin mediaId không đúng định dạng UUID.',
      code: 'VALIDATION_ERROR',
      field: 'mediaId',
    });
  }

  const response = await apiClient.get<ApiResponse<MediaReadUrlResponse>>(
    `/media/${encodeURIComponent(trimmedId)}/read-url`,
    buildScopeConfig(scope)
  );

  const data = response.data?.data;
  if (!data || typeof data !== 'object') {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi URL đọc rỗng hoặc không đúng định dạng.',
      code: 'INVALID_RESPONSE',
    });
  }

  const respMediaId = typeof data.mediaId === 'string' ? data.mediaId.trim() : '';
  if (!respMediaId || respMediaId.toLowerCase() !== trimmedId.toLowerCase()) {
    throw new AppApiError({
      message: 'Mã tệp tin trong phản hồi URL đọc không khớp với yêu cầu.',
      code: 'INVALID_RESPONSE',
    });
  }

  const rawReadUrl = typeof data.readUrl === 'string' ? data.readUrl.trim() : '';
  if (!rawReadUrl) {
    throw new AppApiError({
      message: 'Phản hồi thiếu URL truy cập tệp tin.',
      code: 'INVALID_RESPONSE',
    });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawReadUrl);
  } catch {
    throw new AppApiError({
      message: 'URL truy cập tệp tin không đúng định dạng URI hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new AppApiError({
      message: 'URL truy cập tệp tin phải sử dụng giao thức bảo mật HTTPS.',
      code: 'INVALID_RESPONSE',
    });
  }

  const rawExpiresAt = typeof data.expiresAt === 'string' ? data.expiresAt.trim() : '';
  if (!rawExpiresAt) {
    throw new AppApiError({
      message: 'Phản hồi thiếu thời hạn truy cập URL tệp tin.',
      code: 'INVALID_RESPONSE',
    });
  }

  const expiresTimestamp = Date.parse(rawExpiresAt);
  if (isNaN(expiresTimestamp) || expiresTimestamp <= Date.now()) {
    throw new AppApiError({
      message: 'Thời hạn truy cập URL tệp tin không hợp lệ hoặc đã hết hạn.',
      code: 'INVALID_RESPONSE',
    });
  }

  return {
    mediaId: respMediaId,
    readUrl: rawReadUrl,
    expiresAt: rawExpiresAt,
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

  const trimmedId = mediaId.trim();
  if (!UUID_REGEX.test(trimmedId)) {
    throw new AppApiError({
      message: 'Mã tệp tin mediaId không đúng định dạng UUID.',
      code: 'VALIDATION_ERROR',
      field: 'mediaId',
    });
  }

  const response = await apiClient.delete<ApiResponse<SimpleMessageResponseDto>>(
    `/media/${encodeURIComponent(trimmedId)}`,
    buildScopeConfig(scope)
  );

  const data = response.data?.data;
  return {
    message: typeof data?.message === 'string' ? data.message : 'Đã xóa tệp tin thành công.',
  };
}
