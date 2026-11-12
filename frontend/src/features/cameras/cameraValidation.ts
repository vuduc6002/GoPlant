import { AppApiError } from '@/services/api/apiError';
import type { CameraStatus } from './cameraTypes';

export const CAMERA_NAME_MAX_LENGTH = 200;

export const VALID_CAMERA_STATUSES = new Set<CameraStatus>(['ONLINE', 'OFFLINE', 'ERROR']);

const CREDENTIAL_ERROR_MESSAGE =
  'Ghi chú kết nối không được chứa mật khẩu, token hoặc thông tin đăng nhập.';

const URI_USERINFO_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s/@?#]*@/i;
const BARE_USERINFO_PATTERN = /(?:^|\s)(?!e?mail:)[^\s:@/]+:[^\s@/]*@[^\s/:]+/i;
const CREDENTIAL_KV_PATTERN =
  /(?:^|[^\p{L}\p{N}])(?:password|passwd|pwd|token|secret|api[_-]?key|username)\s*[:=]/iu;
const BEARER_TOKEN_PATTERN = /\bbearer\s+[a-z0-9._-]{8,}/i;

export function assertValidCameraGardenId(gardenId: string): string {
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

export function assertValidCameraId(cameraId: string): string {
  const cleanId = typeof cameraId === 'string' ? cameraId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Mã camera không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'cameraId',
    });
  }
  return cleanId;
}

export function validateCameraName(name: string): string {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    throw new AppApiError({
      message: 'Tên camera không được để trống',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'name',
    });
  }
  if (cleanName.length > CAMERA_NAME_MAX_LENGTH) {
    throw new AppApiError({
      message: `Tên camera từ 1 đến ${CAMERA_NAME_MAX_LENGTH} ký tự`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'name',
    });
  }
  return cleanName;
}

export function validateCameraStatus(status: CameraStatus | string | undefined): CameraStatus {
  if (typeof status !== 'string' || !VALID_CAMERA_STATUSES.has(status as CameraStatus)) {
    throw new AppApiError({
      message: 'Trạng thái camera không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'status',
    });
  }
  return status as CameraStatus;
}

export function containsCameraCredentialPattern(rawNote: string): boolean {
  const trimmed = rawNote.trim();
  if (!trimmed) {
    return false;
  }
  return (
    URI_USERINFO_PATTERN.test(trimmed) ||
    BARE_USERINFO_PATTERN.test(trimmed) ||
    CREDENTIAL_KV_PATTERN.test(trimmed) ||
    BEARER_TOKEN_PATTERN.test(trimmed)
  );
}

export function validateCameraConnectionNote(connectionNote: string): string {
  const trimmed = typeof connectionNote === 'string' ? connectionNote.trim() : '';
  if (!trimmed) {
    return '';
  }
  if (containsCameraCredentialPattern(trimmed)) {
    throw new AppApiError({
      message: CREDENTIAL_ERROR_MESSAGE,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'connectionNote',
    });
  }
  return trimmed;
}
