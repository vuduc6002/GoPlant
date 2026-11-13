import { AppApiError } from '@/services/api/apiError';
import type { LocalImageFile } from './mediaTypes';

export const MAX_MEDIA_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_IMAGE_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const ALLOWED_IMAGE_EXTENSIONS = new Set<string>([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function isValidImageExtension(fileName?: string): boolean {
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  const lastDot = lower.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = lower.substring(lastDot);
  return ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

export function validateLocalImageFile(file: LocalImageFile): ValidationResult {
  if (!file || !file.uri) {
    return { valid: false, error: 'Tệp tin không hợp lệ hoặc thiếu đường dẫn URI.' };
  }

  if (file.size !== undefined && file.size !== null) {
    if (file.size <= 0) {
      return { valid: false, error: 'Tệp tin rỗng (0 bytes).' };
    }
    if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Kích thước tệp vượt quá giới hạn tối đa 5MB (${(file.size / (1024 * 1024)).toFixed(2)}MB).`,
      };
    }
  }

  if (file.type && !ALLOWED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `Định dạng MIME '${file.type}' không được hỗ trợ. Chỉ chấp nhận JPEG, PNG, WebP.`,
    };
  }

  if (file.name && !file.type && !isValidImageExtension(file.name)) {
    return {
      valid: false,
      error: `Định dạng tệp không được hỗ trợ từ tên tệp '${file.name}'. Chỉ chấp nhận .jpg, .jpeg, .png, .webp.`,
    };
  }

  return { valid: true };
}

export function assertValidImageFile(file: LocalImageFile): void {
  const result = validateLocalImageFile(file);
  if (!result.valid) {
    throw new AppApiError({
      message: result.error || 'Tệp hình ảnh không hợp lệ.',
      code: 'VALIDATION_ERROR',
      field: 'file',
    });
  }
}
